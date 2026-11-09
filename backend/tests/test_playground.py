from fastapi.testclient import TestClient

from agentguard.api import create_app


def test_playground_executes_fresh_requests_with_bounded_validated_inputs(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'playground.db'}")) as client:
        for version, eligible in [("baseline", False), ("candidate", True)]:
            response = client.post("/playground", json={"input": "Refund A102", "version": version})
            assert response.status_code == 200
            actual = response.json()
            assert actual["state"]["refund_eligible"] is eligible
            assert [s["tool"] for s in actual["spans"]] == ["lookup_order", "get_policy"]
            assert actual["duration_ms"] >= 0
        assert (
            client.post("/playground", json={"input": "hello", "version": "shell"}).status_code
            == 422
        )
        assert (
            client.post(
                "/playground", json={"input": "x" * 10001, "version": "baseline"}
            ).status_code
            == 422
        )
