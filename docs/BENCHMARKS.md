# Reference benchmark

Measured locally on Windows, Python 3.12.10, on 2026-11-09. Dataset: `support-operations` version 1, 31 scenarios. One execution per scenario/version per generated snapshot. The repeatability test independently reruns both suites and compares outcomes, state and evaluator explanations. Timing, IDs and timestamps deliberately vary.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| All assertions pass | 31/31 (100%) | 20/31 (64.5%) |
| Task completion | 31/31 | 20/31 |
| Required tool choice | 31/31 | 23/31 |
| Required argument match | 31/31 | 23/31 |
| Required evidence | 31/31 | 31/31 |
| Forbidden action check | 31/31 | 31/31 |
| Output schema (one applicable scenario) | 1/1 | 1/1 |
| Tokens / cost | Unavailable | Unavailable |

Three defects produce eleven regressed scenarios: widened refund window (A102, A105, context refund), skipped escalation (four urgent cases), wrong ticket tool (four request kinds). These are deliberate defects in the candidate implementation, not fabricated result records.

Human-authored expected-failure IDs in `backend/tests/test_core.py` match detected IDs exactly: 11 true positives, 0 false positives, 0 false negatives, 20 true negatives **within this deliberately constructed suite**. This is not an independently sampled generalization benchmark. Do not present it as real-world model detection accuracy.

Categories: order lookup 7, policy boundaries 7, escalation 4, tool selection 4, missing information 3, error handling 2, grounding 1, context 3. Context is explicit synthetic session context, not an LLM conversation memory evaluation.

Latency is real `perf_counter` measurement of the support handler and tools, excluding graph scheduling. The initial snapshot measured means of approximately 0.096 ms baseline / 0.046 ms candidate. These very short times are hardware-sensitive and noisy; the candidate also does less work because it skips tools. They establish no performance improvement. Download current evidence for the actual snapshot measurements and execution environment.

Task completion compares expected state key/value subsets. Tool choice requires each expected tool at least once, without enforcing an identical trajectory. Argument evaluation requires a call whose arguments match the asserted subset. Forbidden actions detect explicitly named tools. Required evidence compares reference IDs. Schema validation uses JSON Schema on final state. Overall pass requires no false assertion; unavailable checks do not count as failures and are visibly unavailable. Metric denominators include only applicable, available checks.

Comparison uses an absolute pass-rate drop with configurable threshold (default zero). Dataset content hashes must match. Small sample, no confidence intervals or statistical significance claims. No subjective judge or paid model was used.

Reproduce:

```powershell
uv sync --frozen --python 3.12
uv run python scripts/generate_demo.py
uv run pytest
$env:PYTHONPATH='backend/src'
uv run python -m agentguard
# Expected exit code 1: the candidate contains known regressions.
uv run python -m agentguard --candidate baseline
# Expected exit code 0: unchanged agent passes the gate.
```
