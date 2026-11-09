"""Generate public evidence by executing both real agent versions."""

import json
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from agentguard.engine import compare, load_dataset, run  # noqa: E402


def generate():
    dataset = load_dataset(ROOT / "datasets/support-v1.json")
    baseline, candidate = (run(dataset, v) for v in ["baseline", "candidate"])
    try:
        commit = (
            subprocess.check_output(["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL)
            .decode()
            .strip()
        )
    except (OSError, subprocess.CalledProcessError):
        commit = "uncommitted"
    report = {
        "schema_version": "1",
        "mode": "Published evaluation snapshot · synthetic demonstration data",
        "provenance": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "commit": commit,
            "command": "uv run python scripts/generate_demo.py",
            "agent": "Rule-driven LangGraph support agent; no model API",
            "dataset_hash": baseline.dataset_hash,
        },
        "dataset": dataset.model_dump(),
        "runs": [baseline.model_dump(), candidate.model_dump()],
        "comparison": compare(baseline, candidate),
    }
    output = ROOT / "apps/web/public/data"
    output.mkdir(parents=True, exist_ok=True)
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output / "report.schema.json").write_text(
        json.dumps(
            {
                "type": "object",
                "required": ["schema_version", "dataset", "runs", "comparison", "provenance"],
                "properties": {
                    "schema_version": {"const": "1"},
                    "runs": {"type": "array", "minItems": 2, "maxItems": 2},
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "scenarios": len(dataset.scenarios),
                "baseline": baseline.metrics,
                "candidate": candidate.metrics,
                "regressions": sum(
                    c["status"] == "regression" for c in report["comparison"]["changes"]
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    generate()
