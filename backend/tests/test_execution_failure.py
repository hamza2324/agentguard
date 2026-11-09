from agentguard.engine import run
from agentguard.models import Dataset, Scenario


def test_agent_exception_is_failure_not_batch_abort_or_secret_leak():
    dataset = Dataset(
        id="errors",
        version=1,
        scenarios=[
            Scenario(
                id="timeout", title="Timeout", category="error", input="hello", expected_state={}
            ),
            Scenario(
                id="next", title="Next case", category="error", input="hello", expected_state={}
            ),
        ],
    )

    def broken(message, context):
        raise TimeoutError("https://private.example/?api_key=DO_NOT_PUBLISH")

    report = run(dataset, "candidate", executor=broken)
    assert len(report.results) == 2
    assert not any(r.passed for r in report.results)
    assert "DO_NOT_PUBLISH" not in report.model_dump_json()
    assert all(r.execution.spans is None for r in report.results)
    assert report.metrics["tool_choice"] is None
