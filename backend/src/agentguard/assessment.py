"""User-supplied agent evidence, scored without a model or hosted service."""

from datetime import datetime, timezone
from statistics import mean
from uuid import uuid4

from jsonschema import Draft7Validator, SchemaError
from pydantic import Field, model_validator

from agentguard.engine import evaluate
from agentguard.models import Model, Scenario


class ObservedCall(Model):
    tool: str
    arguments: dict
    result: dict = Field(default_factory=dict)
    id: str | None = None
    duration_ms: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class Observation(Model):
    response: str
    state: dict
    evidence: list[str] = Field(default_factory=list)
    spans: list[ObservedCall] | None = None
    duration_ms: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    tokens: int | None = Field(default=None, ge=0)
    error: str | None = None


class AssessmentCase(Model):
    scenario: Scenario
    baseline: Observation
    candidate: Observation

    @model_validator(mode="after")
    def meaningful_assertions(self):
        s = self.scenario
        if not (
            s.expected_state
            or s.required_response
            or s.required_tools
            or s.forbidden_tools
            or s.evidence
            or s.output_schema
        ):
            raise ValueError("Each scenario needs at least one reviewed assertion")
        if s.output_schema:
            try:
                Draft7Validator.check_schema(s.output_schema)
            except SchemaError as error:
                raise ValueError("Invalid JSON Schema") from error

            def check_refs(value):
                if isinstance(value, dict):
                    if "$ref" in value and not str(value["$ref"]).startswith("#"):
                        raise ValueError("External JSON Schema references are not allowed")
                    for child in value.values():
                        check_refs(child)
                elif isinstance(value, list):
                    for child in value:
                        check_refs(child)

            check_refs(s.output_schema)
            if s.output_schema.get("$schema", "http://json-schema.org/draft-07/schema#") not in {
                "http://json-schema.org/draft-07/schema#",
                "https://json-schema.org/draft-07/schema#",
            }:
                raise ValueError("User assessments support JSON Schema draft-07")
        return self


class AssessmentOptions(Model):
    max_pass_rate_drop: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)
    max_latency_increase_pct: float = Field(default=20, ge=0, allow_inf_nan=False)
    max_token_increase_pct: float = Field(default=20, ge=0, allow_inf_nan=False)
    max_cost_increase_pct: float = Field(default=20, ge=0, allow_inf_nan=False)
    usd_per_million_tokens: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    pricing_source: str = ""

    @model_validator(mode="after")
    def documented_price(self):
        if self.usd_per_million_tokens is not None and not self.pricing_source.strip():
            raise ValueError("A documented pricing source is required to estimate cost")
        return self


class Assessment(Model):
    schema_version: str = "1"
    agent_name: str = Field(min_length=1, max_length=120)
    baseline_version: str = Field(min_length=1, max_length=80)
    candidate_version: str = Field(min_length=1, max_length=80)
    cases: list[AssessmentCase] = Field(min_length=1, max_length=100)
    options: AssessmentOptions = Field(default_factory=AssessmentOptions)

    @model_validator(mode="after")
    def unique_cases(self):
        if self.schema_version != "1":
            raise ValueError("Unsupported assessment schema version")
        if len({c.scenario.id for c in self.cases}) != len(self.cases):
            raise ValueError("Scenario IDs must be unique")
        return self


def assess(request: Assessment, mode="imported evidence / Python"):
    evaluated = []
    for case in request.cases:
        versions = {}
        for version in ["baseline", "candidate"]:
            observation = getattr(case, version)
            scores = evaluate(case.scenario, observation)
            versions[version] = {
                "execution": observation.model_dump(),
                "scores": [s.model_dump() for s in scores],
                "passed": all(s.passed is not False for s in scores),
            }
        before, after = versions["baseline"]["passed"], versions["candidate"]["passed"]
        status = (
            "regression"
            if before and not after
            else "resolved"
            if not before and after
            else "unchanged_pass"
            if after
            else "unchanged_failure"
        )
        evaluated.append({"scenario": case.scenario.model_dump(), **versions, "status": status})

    summaries = {}
    for version in ["baseline", "candidate"]:
        values = [c[version] for c in evaluated]
        metrics = {"pass_rate": mean(v["passed"] for v in values)}
        for name in {s["evaluator"] for v in values for s in v["scores"]}:
            available = [
                s["passed"]
                for v in values
                for s in v["scores"]
                if s["evaluator"] == name and s["passed"] is not None
            ]
            metrics[name] = mean(available) if available else None
        durations = [v["execution"]["duration_ms"] for v in values]
        tokens = [v["execution"]["tokens"] for v in values]
        metrics["latency_ms"] = mean(durations) if all(v is not None for v in durations) else None
        metrics["tokens"] = sum(tokens) if all(v is not None for v in tokens) else None
        rate = request.options.usd_per_million_tokens
        metrics["estimated_cost_usd"] = (
            metrics["tokens"] / 1_000_000 * rate
            if metrics["tokens"] is not None and rate is not None
            else None
        )
        summaries[version] = {
            "metrics": metrics,
            "passed": sum(v["passed"] for v in values),
            "total": len(values),
            "unavailable_checks": sum(s["passed"] is None for v in values for s in v["scores"]),
            "latency_coverage": sum(v is not None for v in durations),
            "token_coverage": sum(v is not None for v in tokens),
        }
    performance = []
    for metric, threshold in [
        ("latency_ms", request.options.max_latency_increase_pct),
        ("tokens", request.options.max_token_increase_pct),
        ("estimated_cost_usd", request.options.max_cost_increase_pct),
    ]:
        before, after = (summaries[v]["metrics"][metric] for v in ["baseline", "candidate"])
        delta = after - before if before is not None and after is not None else None
        increase = delta / before * 100 if delta is not None and before > 0 else None
        # A positive increase from a true zero baseline exceeds any finite percent threshold.
        breach = (
            increase > threshold
            if increase is not None
            else delta is not None and before == 0 and delta > 0
        )
        performance.append(
            {
                "metric": metric,
                "baseline": before,
                "candidate": after,
                "delta": delta,
                "increase_pct": increase,
                "threshold_pct": threshold,
                "breached": breach,
            }
        )
    drop = (
        summaries["baseline"]["metrics"]["pass_rate"]
        - summaries["candidate"]["metrics"]["pass_rate"]
    )
    gate_failed = drop > request.options.max_pass_rate_drop or any(
        p["breached"] for p in performance
    )
    regressions = sum(c["status"] == "regression" for c in evaluated)
    unresolved = any(not c["candidate"]["passed"] for c in evaluated)
    verdict = (
        "regressions_detected"
        if gate_failed
        else "review_required"
        if regressions or unresolved or any(s["unavailable_checks"] for s in summaries.values())
        else "no_regressions_observed"
    )
    return {
        "schema_version": "1",
        "id": uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "agent_name": request.agent_name,
        "baseline_version": request.baseline_version,
        "candidate_version": request.candidate_version,
        "options": request.options.model_dump(),
        "baseline": summaries["baseline"],
        "candidate": summaries["candidate"],
        "pass_rate_drop": drop,
        "regressions": regressions,
        "resolved": sum(c["status"] == "resolved" for c in evaluated),
        "gate_failed": gate_failed,
        "verdict": verdict,
        "performance": performance,
        "cases": evaluated,
        "limitations": [
            "Results apply only to the supplied scenarios; this is not a deployment certification.",
            "Imported observations, timings and token usage are supplied by the user, not independently verified.",
            "Missing trace checks remain unavailable. Grounding checks reference IDs, not semantic factuality.",
            "Cost is a flat-rate estimate only when token usage and a documented blended token price are supplied.",
            "No LLM judge, statistical significance test, or repeated stochastic evaluation was performed.",
        ],
    }
