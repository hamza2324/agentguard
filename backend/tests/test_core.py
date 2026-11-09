import asyncio
from copy import deepcopy
from pathlib import Path
from time import sleep

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from agentguard.agent import build_agent
from agentguard.api import create_app
from agentguard.connector import invoke, validate_endpoint
from agentguard.engine import compare, evaluate, load_dataset, run
from agentguard.models import Action, Dataset, Execution, Scenario, Span

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def dataset():
    return load_dataset(ROOT / "datasets/support-v1.json")


@pytest.fixture(scope="module")
def experiments(dataset):
    return run(dataset, "baseline"), run(dataset, "candidate")


def test_labeled_regressions(experiments):
    baseline, candidate = experiments
    assert len(baseline.results) == 31
    assert all(r.passed for r in baseline.results)
    # Human-authored labels independent of engine classification.
    expected = {"refund-A102", "refund-A105", "context-refund"}
    expected |= {f"urgent-{i}" for i in range(4)}
    expected |= {f"ticket-{i}" for i in range(4)}
    actual = {r.scenario.id for r in candidate.results if not r.passed}
    assert actual == expected
    report = compare(baseline, candidate)
    assert {c["scenario_id"] for c in report["changes"] if c["status"] == "regression"} == expected
    assert report["gate_failed"]
    assert not compare(baseline, candidate, threshold=0.4)["gate_failed"]


def test_repeatability_and_unknown_usage(dataset, experiments):
    for version, previous in zip(["baseline", "candidate"], experiments):
        repeated = run(dataset, version)
        assert [(r.passed, r.execution.state, r.scores) for r in repeated.results] == [
            (r.passed, r.execution.state, r.scores) for r in previous.results
        ]
        assert repeated.metrics["cost"] is None
        assert repeated.metrics["tokens"] is None
        assert all(r.execution.duration_ms >= 0 for r in repeated.results)


def test_resolutions_and_dataset_mismatch(experiments):
    baseline, candidate = experiments
    assert sum(c["status"] == "resolved" for c in compare(candidate, baseline)["changes"]) == 11
    wrong = candidate.model_copy(update={"dataset_hash": "different"})
    with pytest.raises(ValueError, match="identical"):
        compare(baseline, wrong)


def fixture_execution():
    return Execution(
        response="Delivered",
        state={"status": "delivered"},
        evidence=["A100"],
        spans=[
            Span(
                id="1",
                tool="lookup_order",
                arguments={"order_id": "A100"},
                result={"status": "delivered"},
                duration_ms=0.01,
            )
        ],
        duration_ms=0.1,
    )


@pytest.mark.parametrize(
    "mutation,evaluator",
    [
        ("state", "task_completion"),
        ("tool", "tool_choice"),
        ("arguments", "tool_arguments"),
        ("forbidden", "forbidden_actions"),
        ("evidence", "required_evidence"),
        ("schema", "output_schema"),
    ],
)
def test_each_evaluator_detects_observed_fault(mutation, evaluator):
    scenario = Scenario(
        id="one",
        title="Track",
        category="unit",
        input="Track A100",
        expected_state={"status": "delivered"},
        required_tools=[Action(tool="lookup_order", arguments={"order_id": "A100"})],
        evidence=["A100"],
        forbidden_tools=["delete_order"],
        output_schema={
            "type": "object",
            "required": ["status"],
            "properties": {"status": {"type": "string"}},
        },
    )
    execution = fixture_execution()
    assert all(s.passed for s in evaluate(scenario, execution))
    if mutation == "state":
        execution.state = {"status": "shipped"}
    elif mutation == "tool":
        execution.spans[0].tool = "other"
    elif mutation == "arguments":
        execution.spans[0].arguments = {"order_id": "A999"}
    elif mutation == "forbidden":
        execution.spans.append(
            Span(id="2", tool="delete_order", arguments={}, result={}, duration_ms=0)
        )
    elif mutation == "evidence":
        execution.evidence = []
    else:
        execution.state = {"status": 42}
    assert (
        next(s for s in evaluate(scenario, execution) if s.evaluator == evaluator).passed is False
    )


def test_missing_trace_is_unavailable():
    scenario = Scenario(id="x", title="x", category="x", input="x", expected_state={})
    execution = fixture_execution()
    execution.spans = None
    scores = evaluate(scenario, execution)
    assert all(
        s.passed is None
        for s in scores
        if s.evaluator in {"tool_choice", "tool_arguments", "forbidden_actions"}
    )


def test_dataset_contract(dataset):
    duplicate = dataset.model_copy(deep=True)
    duplicate.scenarios.append(deepcopy(duplicate.scenarios[0]))
    with pytest.raises(ValueError, match="unique"):
        duplicate.check_unique()
    with pytest.raises(ValidationError):
        Dataset.model_validate({"id": "x", "version": 0, "scenarios": []})
    with pytest.raises(ValueError):
        build_agent("unknown")


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://127.0.0.1",
        "https://user:pass@example.com",
        "https://example.com/#secret",
    ],
)
def test_endpoint_restrictions(url):
    with pytest.raises(ValueError):
        validate_endpoint(url, {url})


def test_connector_contract_and_timeout(monkeypatch):
    monkeypatch.setattr(
        "agentguard.connector.socket.getaddrinfo",
        lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))],
    )
    endpoint = "https://agent.example/evaluate"
    good = httpx.MockTransport(
        lambda request: httpx.Response(200, json=fixture_execution().model_dump())
    )
    assert (
        asyncio.run(invoke(endpoint, {endpoint}, "Track A100", {}, good)).state["status"]
        == "delivered"
    )

    def timeout(request):
        raise httpx.ReadTimeout("timed out")

    with pytest.raises(httpx.ReadTimeout):
        asyncio.run(invoke(endpoint, {endpoint}, "hello", {}, httpx.MockTransport(timeout)))
    invalid = httpx.MockTransport(lambda request: httpx.Response(200, json={"made_up": True}))
    with pytest.raises(ValidationError):
        asyncio.run(invoke(endpoint, {endpoint}, "hello", {}, invalid))


def wait_job(client, identifier):
    for _ in range(100):
        result = client.get(f"/jobs/{identifier}").json()
        if result["status"] in {"completed", "failed"}:
            assert result["status"] == "completed", result
            return result["run_id"]
        sleep(0.02)
    pytest.fail("Job did not finish")


def test_api_persistence_and_reviewed_failure_to_runnable_test(tmp_path):
    url = f"sqlite:///{tmp_path / 'test.db'}"
    with TestClient(create_app(url)) as client:
        assert client.get("/health").json()["paid_apis_required"] is False
        assert client.get("/datasets").status_code == 200
        assert client.get("/runs/missing").status_code == 404
        assert client.post("/runs", json={"version": "malicious"}).status_code == 422
        candidate_job = client.post("/runs", json={"version": "candidate"}).json()["job_id"]
        candidate_id = wait_job(client, candidate_job)
        candidate = client.get(f"/runs/{candidate_id}").json()
        failure = next(r for r in candidate["results"] if not r["passed"])
        new_scenario = {**failure["scenario"], "id": "reviewed-refund-case"}
        review = {
            "run_id": candidate_id,
            "scenario_id": failure["scenario"]["id"],
            "note": "Verified policy boundary and assertions",
            "approved": False,
            "scenario": new_scenario,
        }
        assert client.post("/reviews", json=review).status_code == 422
        review["approved"] = True
        saved = client.post("/reviews", json=review)
        assert saved.status_code == 201, saved.text
        dataset_id = saved.json()["dataset_id"]
        # New test executes later against each agent and retains its value.
        for version, expected in [("baseline", True), ("candidate", False)]:
            response = client.post("/runs", json={"version": version, "dataset_id": dataset_id})
            assert response.status_code == 202, response.text
            run_id = wait_job(client, response.json()["job_id"])
            report = client.get(f"/runs/{run_id}").json()
            assert len(report["results"]) == 1
            assert report["results"][0]["passed"] is expected
        baseline_job = client.post("/runs", json={"version": "baseline"}).json()["job_id"]
        baseline_id = wait_job(client, baseline_job)
        comparison = client.post(
            "/comparisons", json={"baseline_id": baseline_id, "candidate_id": candidate_id}
        )
        assert comparison.status_code == 200
        assert comparison.json()["gate_failed"] is True
    with TestClient(create_app(url)) as reopened:
        assert len(reopened.get("/reviews").json()) == 1
        assert len(reopened.get("/runs").json()) == 4
