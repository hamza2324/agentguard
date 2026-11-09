import hashlib
import json
from datetime import datetime, timezone
from statistics import mean
from time import perf_counter
from uuid import uuid4

from jsonschema import Draft7Validator, ValidationError

from agentguard.agent import build_agent
from agentguard.models import Dataset, Execution, Result, Run, Score


def json_equal(left, right):
    """JSON structural equality; booleans must not equal numeric zero/one."""
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(json_equal(left[k], right[k]) for k in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(json_equal(a, b) for a, b in zip(left, right))
    return left == right


def evaluate(scenario, execution):
    calls = execution.spans
    scores = []

    def add(name, passed, reason):
        scores.append(Score(evaluator=name, passed=passed, reason=reason))

    if execution.error:
        add("execution", False, execution.error)
    missing = {
        k: v
        for k, v in scenario.expected_state.items()
        if k not in execution.state or not json_equal(execution.state[k], v)
    }
    add("task_completion", not missing, f"Expected state differences: {missing}")
    if scenario.required_response:
        missing_phrases = [
            phrase for phrase in scenario.required_response if phrase not in execution.response
        ]
        add(
            "response_requirements",
            not missing_phrases,
            f"Missing required response text: {missing_phrases}",
        )
    if calls is None:
        for name in ["tool_choice", "tool_arguments", "forbidden_actions"]:
            add(name, None, "Agent did not supply tool traces")
    else:
        missing_tools = [
            a.tool for a in scenario.required_tools if not any(c.tool == a.tool for c in calls)
        ]
        add("tool_choice", not missing_tools, f"Missing required tools: {missing_tools}")
        invalid = [
            a.model_dump()
            for a in scenario.required_tools
            if not any(
                c.tool == a.tool
                and all(
                    k in c.arguments and json_equal(c.arguments[k], v)
                    for k, v in a.arguments.items()
                )
                for c in calls
            )
        ]
        add("tool_arguments", not invalid, f"Unmatched argument expectations: {invalid}")
        forbidden = [c.tool for c in calls if c.tool in scenario.forbidden_tools]
        add("forbidden_actions", not forbidden, f"Forbidden calls: {forbidden}")
    missing_evidence = sorted(set(scenario.evidence) - set(execution.evidence))
    add("required_evidence", not missing_evidence, f"Missing evidence: {missing_evidence}")
    if scenario.output_schema:
        try:
            Draft7Validator(scenario.output_schema).validate(execution.state)
            add("output_schema", True, "State matches JSON schema")
        except ValidationError as error:
            add("output_schema", False, error.message)
    return scores


def run(dataset: Dataset, version: str, executor=None):
    dataset.check_unique()
    agent = build_agent(version) if executor is None else None
    results = []
    for scenario in dataset.scenarios:
        started = perf_counter()
        try:
            execution = (
                executor(scenario.input, scenario.context)
                if executor
                else agent.invoke({"message": scenario.input, "context": scenario.context})[
                    "execution"
                ]
            )
        except Exception as error:
            # Exception messages may contain remote URLs or credentials; retain only the class.
            execution = Execution(
                response="",
                state={},
                evidence=[],
                spans=None,
                duration_ms=(perf_counter() - started) * 1000,
                error=f"Agent execution failed ({type(error).__name__})",
            )
        scores = evaluate(scenario, execution)
        results.append(
            Result(
                scenario=scenario,
                execution=execution,
                scores=scores,
                passed=all(s.passed is not False for s in scores),
            )
        )
    metrics = {
        "pass_rate": mean(r.passed for r in results),
        "latency_ms": mean(r.execution.duration_ms for r in results),
        "tokens": None,
        "cost": None,
    }
    for name in {s.evaluator for r in results for s in r.scores}:
        values = [
            s.passed
            for r in results
            for s in r.scores
            if s.evaluator == name and s.passed is not None
        ]
        metrics[name] = mean(values) if values else None
    return Run(
        id=uuid4().hex,
        version=version,
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        dataset_hash=hashlib.sha256(dataset.model_dump_json().encode()).hexdigest(),
        created_at=datetime.now(timezone.utc).isoformat(),
        results=results,
        metrics=metrics,
    )


def compare(baseline: Run, candidate: Run, threshold: float = 0):
    if not 0 <= threshold <= 1:
        raise ValueError("Threshold must be between zero and one")
    if baseline.dataset_hash != candidate.dataset_hash:
        raise ValueError("Comparison requires identical dataset content")
    before = {r.scenario.id: r for r in baseline.results}
    if set(before) != {r.scenario.id for r in candidate.results}:
        raise ValueError("Comparison requires identical scenario IDs")
    changes = []
    for result in candidate.results:
        previous = before[result.scenario.id]
        status = (
            "regression"
            if previous.passed and not result.passed
            else "resolved"
            if not previous.passed and result.passed
            else "unchanged_pass"
            if result.passed
            else "unchanged_failure"
        )
        changes.append(
            {
                "scenario_id": result.scenario.id,
                "status": status,
                "failed_evaluators": [s.evaluator for s in result.scores if s.passed is False],
            }
        )
    drop = baseline.metrics["pass_rate"] - candidate.metrics["pass_rate"]
    return {
        "baseline_id": baseline.id,
        "candidate_id": candidate.id,
        "pass_rate_drop": drop,
        "threshold": threshold,
        "gate_failed": drop > threshold,
        "changes": changes,
        "warning": "Synthetic deterministic suite; no statistical generalization.",
    }


def load_dataset(path):
    return Dataset.model_validate(json.loads(path.read_text(encoding="utf-8"))).check_unique()
