"""CI gate: an intentionally regressed candidate exits with status 1."""

import argparse
import json
from pathlib import Path

from agentguard.engine import compare, load_dataset, run


def main():
    parser = argparse.ArgumentParser(description="Reproducible AgentGuard evaluation gate")
    parser.add_argument("--dataset", type=Path, default=Path("datasets/support-v1.json"))
    parser.add_argument("--baseline", choices=["baseline", "candidate"], default="baseline")
    parser.add_argument("--candidate", choices=["baseline", "candidate"], default="candidate")
    parser.add_argument("--threshold", type=float, default=0)
    parser.add_argument("--output", type=Path, default=Path("artifacts/comparison.json"))
    args = parser.parse_args()
    if not 0 <= args.threshold <= 1:
        parser.error("threshold must be between 0 and 1")
    dataset = load_dataset(args.dataset)
    baseline, candidate = run(dataset, args.baseline), run(dataset, args.candidate)
    comparison = compare(baseline, candidate, args.threshold)
    report = {
        "baseline": baseline.model_dump(),
        "candidate": candidate.model_dump(),
        "comparison": comparison,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Baseline: {sum(r.passed for r in baseline.results)}/{len(baseline.results)}")
    print(f"Candidate: {sum(r.passed for r in candidate.results)}/{len(candidate.results)}")
    for change in comparison["changes"]:
        if change["status"] == "regression":
            print(f"REGRESSION {change['scenario_id']}: {', '.join(change['failed_evaluators'])}")
    print(f"Evidence: {args.output}")
    return 1 if comparison["gate_failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
