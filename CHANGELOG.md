# Changelog

## User agent release assessment — 2026-11-09

- Added a guided four-step flow for agent versions, expected behavior, imported execution evidence or approved local HTTP endpoints, and regression reports.
- Added state/response/tool/evidence/schema checks, configurable quality and performance gates, measurement coverage and documented flat-rate cost estimation.
- Added JSON, Markdown, rerunnable input and print/PDF report exports.
- Added a runnable HTTP adapter example, setup guide, endpoint allowlists and explicit loopback opt-in.
- Added Python assessment tests, browser/Python scoring parity checks, and browser tests covering custom input through report export and actual HTTP agent execution.

## 0.1.0 — 2026-11-09

- Local deterministic LangGraph support agent and deliberately regressed candidate.
- 31 versioned scenarios, six assertion types, measured latency and null unavailable usage.
- Comparison gate, generated evidence snapshots and static interactive explorer.
- Local SQLite-backed API, bounded evaluation jobs and reviewed failure-to-test workflow.
- Python and browser regression tests; CI and Pages workflow definitions.

Deployment status must be checked separately; workflow files alone do not establish publication.

## Homepage and playground update ? 2026-11-09

- Reused existing Git Credential Manager authentication and published the repository and GitHub Pages site.
- Added a narrative homepage, real interactive regression example, workflow introduction, setup guide and Ask AgentGuard product guide.
- Added a support-agent playground with honest public replay and fresh local typed requests.
- Verified 19 Python tests and 14 desktop/mobile browser tests, with 2 duplicate mobile integrations skipped.
- Hosted CI, deterministic evaluation and Pages workflows passed.
