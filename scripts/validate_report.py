import json
import sys
from pathlib import Path

from jsonschema import validate

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from agentguard.engine import compare  # noqa: E402
from agentguard.models import Dataset, Run  # noqa: E402

directory = ROOT / "apps/web/public/data"
report = json.loads((directory / "report.json").read_text(encoding="utf-8"))
validate(report, json.loads((directory / "report.schema.json").read_text(encoding="utf-8")))
Dataset.model_validate(report["dataset"]).check_unique()
baseline, candidate = [Run.model_validate(r) for r in report["runs"]]
assert report["comparison"] == compare(baseline, candidate)
assert all(
    r.execution.tokens is None and r.execution.cost is None
    for run in [baseline, candidate]
    for r in run.results
)
print("Public snapshot contracts, comparison and unavailable usage validated")
