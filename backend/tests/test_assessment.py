from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from agentguard.api import create_app
from agentguard.assessment import Assessment, assess
from agentguard.connector import validate_endpoint
from agentguard.models import Execution


def package():
    return {
        "agent_name": "User support agent",
        "baseline_version": "stable",
        "candidate_version": "changed",
        "options": {
            "usd_per_million_tokens": 10,
            "pricing_source": "dated test price configuration",
        },
        "cases": [
            {
                "scenario": {
                    "id": "refund",
                    "title": "Old order refund",
                    "category": "policy",
                    "input": "Refund A102",
                    "expected_state": {"eligible": False},
                    "required_tools": [{"tool": "lookup", "arguments": {"id": "A102"}}],
                    "evidence": ["policy-v1"],
                },
                "baseline": {
                    "response": "Not eligible",
                    "state": {"eligible": False},
                    "duration_ms": 100,
                    "tokens": 100,
                    "evidence": ["policy-v1"],
                    "spans": [{"tool": "lookup", "arguments": {"id": "A102"}}],
                },
                "candidate": {
                    "response": "Eligible",
                    "state": {"eligible": True},
                    "duration_ms": 150,
                    "tokens": 200,
                    "evidence": [],
                    "spans": [{"tool": "wrong_tool", "arguments": {}}],
                },
            }
        ],
    }


def test_real_assertions_performance_thresholds_and_documented_cost():
    report = assess(Assessment.model_validate(package()))
    assert report["regressions"] == 1
    assert report["gate_failed"]
    assert report["candidate"]["metrics"]["tool_choice"] == 0
    assert report["baseline"]["metrics"]["estimated_cost_usd"] == pytest.approx(0.001)
    assert report["candidate"]["metrics"]["estimated_cost_usd"] == pytest.approx(0.002)
    assert all(p["breached"] for p in report["performance"])
    assert report["performance"][0]["increase_pct"] == 50


def test_partial_coverage_and_missing_traces_remain_unavailable():
    data = package()
    data["cases"][0]["candidate"].update(duration_ms=None, tokens=None, spans=None)
    report = assess(Assessment.model_validate(data))
    assert report["candidate"]["metrics"]["latency_ms"] is None
    assert report["candidate"]["metrics"]["tokens"] is None
    assert report["candidate"]["metrics"]["estimated_cost_usd"] is None
    assert report["candidate"]["metrics"]["tool_choice"] is None
    assert report["candidate"]["unavailable_checks"] == 3
    assert report["candidate"]["latency_coverage"] == 0


def test_zero_baseline_latency_increase_is_not_silently_accepted():
    data = package()
    data["cases"][0]["baseline"]["duration_ms"] = 0
    report = assess(Assessment.model_validate(data))
    assert report["performance"][0]["breached"]
    assert report["performance"][0]["increase_pct"] is None


@pytest.mark.parametrize(
    "mutation", ["duplicate", "no_assertions", "price", "external_ref", "bad_schema"]
)
def test_invalid_assessment_inputs_are_rejected(mutation):
    data = package()
    if mutation == "duplicate":
        data["cases"].append(deepcopy(data["cases"][0]))
    elif mutation == "no_assertions":
        data["cases"][0]["scenario"].update(expected_state={}, required_tools=[], evidence=[])
    elif mutation == "price":
        data["options"]["pricing_source"] = ""
    elif mutation == "external_ref":
        data["cases"][0]["scenario"]["output_schema"] = {"$ref": "http://127.0.0.1/private"}
    else:
        data["cases"][0]["scenario"]["output_schema"] = {"type": "not-a-type"}
    with pytest.raises(ValidationError):
        Assessment.model_validate(data)


def test_response_only_assertions_and_json_boolean_semantics():
    data = package()
    data["cases"][0]["scenario"].update(required_response=["Not eligible"])
    data["cases"][0]["candidate"]["state"] = {"eligible": 0}
    report = assess(Assessment.model_validate(data))
    scores = {s["evaluator"]: s["passed"] for s in report["cases"][0]["candidate"]["scores"]}
    assert scores["task_completion"] is False
    assert scores["response_requirements"] is False


def test_user_report_api_persists_locally_and_blocks_unapproved_endpoints(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'assess.db'}")) as client:
        response = client.post("/assessments", json=package())
        assert response.status_code == 201, response.text
        saved = client.get(f"/assessments/{response.json()['id']}")
        assert saved.json() == response.json()
        live = {k: package()[k] for k in ["agent_name", "baseline_version", "candidate_version"]}
        live.update(
            baseline_endpoint="https://unapproved.example/a",
            candidate_endpoint="https://unapproved.example/b",
            scenarios=[package()["cases"][0]["scenario"]],
        )
        assert client.post("/assessments/live", json=live).status_code == 422


def test_live_assessment_invokes_both_versions_and_measures_actual_round_trip(
    tmp_path, monkeypatch
):
    monkeypatch.setenv(
        "AGENTGUARD_ALLOWED_ENDPOINTS", "https://approved.example/a,https://approved.example/b"
    )
    monkeypatch.setattr("agentguard.api.validate_endpoint", lambda *a, **kw: None)
    calls = []

    async def fake_connector(endpoint, allowed, message, context, **kwargs):
        calls.append((endpoint, message))
        return Execution(
            response="Observed",
            state={"eligible": endpoint.endswith("/b")},
            evidence=[],
            spans=[],
            duration_ms=999,
        )

    monkeypatch.setattr("agentguard.api.invoke", fake_connector)
    with TestClient(create_app(f"sqlite:///{tmp_path / 'live.db'}")) as client:
        payload = {k: package()[k] for k in ["agent_name", "baseline_version", "candidate_version"]}
        payload.update(
            baseline_endpoint="https://approved.example/a",
            candidate_endpoint="https://approved.example/b",
            scenarios=[package()["cases"][0]["scenario"]],
        )
        response = client.post("/assessments/live", json=payload)
        assert response.status_code == 201, response.text
        assert len(calls) == 2
        report = response.json()
        assert report["cases"][0]["candidate"]["execution"]["duration_ms"] != 999
        assert "round-trip latency" in report["mode"]


def test_loopback_requires_both_explicit_allowlist_and_operator_opt_in():
    endpoint = "http://127.0.0.1:9000/evaluate"
    with pytest.raises(ValueError):
        validate_endpoint(endpoint, {endpoint})
    with pytest.raises(ValueError):
        validate_endpoint(endpoint, set(), allow_loopback=True)
    validate_endpoint(endpoint, {endpoint}, allow_loopback=True)
