# Architecture

```mermaid
flowchart LR
 D[Versioned JSON scenarios] --> E[Python evaluation engine]
 E --> A[LangGraph reference agent]
 A --> T[Synthetic local tools]
 T --> X[Observed state and tool spans]
 X --> S[Deterministic scoring]
 S --> C[Comparison and regression gate]
 C --> R[JSON evidence report]
 R --> W[React static explorer]
 E --> API[Local FastAPI jobs]
 API --> DB[(SQLAlchemy / SQLite)]
 DB --> H[Human reviewed assertions]
 H --> D2[New versioned dataset]
 D2 --> E
```

Domain contracts: `backend/src/agentguard/models.py`. Execution: `agent.py`. Assertions, aggregation and comparison: `engine.py`. HTTP contract: `connector.py`. Local persistence and jobs: `storage.py`, `api.py`. Public artifact generator: `scripts/generate_demo.py`.

An agent receives only input and context; the test runner holds expectations. Scores are calculated after execution. Multiple trajectories are allowed: required tools and argument subsets must occur, while explicitly forbidden tools must not occur. Extra nonforbidden calls are permitted.

Comparison requires matching dataset hashes, including assertions. Pass-rate threshold uses strict `drop > threshold`. Missing trace-dependent scores are null and excluded from evaluator denominators. Overall pass means no observed assertion failed; unavailable checks do not establish correctness. No statistical significance is inferred.

The local API stores runs separately, with one worker and at most two in-flight jobs. Process restart does not resume jobs. Reviewed tests require a failed source run, explicit approval and an editable scenario. Reviews and dataset snapshots persist in SQLite. Public Pages has no write path.

The user assessment workflow adds a separate contract in `assessment.py`: reviewed scenarios plus baseline/candidate observations, thresholds and optional documented blended token pricing. `apps/web/src/assessment.ts` implements deterministic scoring for private browser-only imports; parity tests compare evaluator outcomes against all 31 Python reference scenarios. The four-step UI lives in `TestAgent.tsx` and is loaded on demand. Import scoring does not execute an agent. Local live assessment calls operator-allowlisted endpoints through the HTTP connector, measures round-trip latency, scores with the Python engine and stores reports in local SQLite. Public results are never modified by this flow.
