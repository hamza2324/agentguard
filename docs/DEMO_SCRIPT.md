# 60–90 second interview demonstration

**0–15 seconds:** “AgentGuard catches behavioral regressions after an agent change. This demo runs without a model API key. The dashboard shows saved evidence from a real rule-driven LangGraph support agent, clearly labeled as synthetic data.”

**15–35 seconds:** Open Version comparison. “The baseline passes 31 scenarios. The changed version passes 20. These eleven regressions come from three deliberate code changes.” Select `refund-A102`. Show expected `refund_eligible: false`, observed `true`, the actual order age from `lookup_order`, and the retrieved 30-day policy.

**35–55 seconds:** Open `backend/src/agentguard/agent.py`. Show the candidate's 60-day window and skipped tool branches. “The agent never receives expected answers. Python assertions score execution evidence afterward.”

**55–75 seconds:** Run `uv run python scripts/generate_demo.py`, then `uv run pytest`. Explain that the tests compare observed failures against independently authored expected failure IDs. Run the CLI gate (see BENCHMARKS.md) to show its nonzero exit, then run it with `--candidate baseline` to show the clean control.

**75–90 seconds:** “The failure-to-test integration test saves a human-approved assertion to a new dataset and executes it later against both agents. Public Pages is read-only; live execution uses the local backend or controlled Actions.”

Resume description supported by local verification: “Built an API-key-free agent regression testing platform with a LangGraph reference agent, 31 versioned scenarios, deterministic evaluators, structured tool traces, and a human-reviewed failure-to-test workflow; detected all 11 deliberately seeded scenario regressions.”

Only add a public deployment or CI claim after its workflow actually succeeds.
