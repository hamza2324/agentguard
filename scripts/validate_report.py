import json
import hashlib
import sys
from pathlib import Path
from statistics import mean

from jsonschema import validate

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from agentguard.engine import compare, evaluate  # noqa: E402
from agentguard.models import Dataset, Run  # noqa: E402

directory = ROOT / "apps/web/public/data"
report = json.loads((directory / "report.json").read_text(encoding="utf-8"))
validate(report, json.loads((directory / "report.schema.json").read_text(encoding="utf-8")))
dataset = Dataset.model_validate(report["dataset"]).check_unique()
baseline, candidate = [Run.model_validate(r) for r in report["runs"]]
digest = hashlib.sha256(dataset.model_dump_json().encode()).hexdigest()
for run in [baseline, candidate]:
    assert run.dataset_hash == digest
    assert [r.scenario for r in run.results] == dataset.scenarios
    for result in run.results:
        assert result.scores == evaluate(result.scenario, result.execution)
        assert result.passed == all(s.passed is not False for s in result.scores)
    assert run.metrics["pass_rate"] == mean(r.passed for r in run.results)
    for name in {s.evaluator for r in run.results for s in r.scores}:
        values = [
            s.passed
            for r in run.results
            for s in r.scores
            if s.evaluator == name and s.passed is not None
        ]
        assert run.metrics[name] == (mean(values) if values else None)
assert report["comparison"] == compare(baseline, candidate)
assert all(
    r.execution.tokens is None and r.execution.cost is None
    for run in [baseline, candidate]
    for r in run.results
)
print("Public snapshot contracts, dataset hash, assertions, aggregates and comparison validated")
