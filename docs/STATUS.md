# Verification status

Implemented and tested locally on 2026-11-09. This document distinguishes local verification from unavailable hosted verification.

- Python: 18 tests pass, covering assertion faults, independently labeled agent regressions, repeated outcomes, comparison thresholds/resolutions, connector validation/timeouts, missing traces, API jobs/persistence, execution exceptions and the approved failure-to-test workflow.
- Benchmark: baseline 31/31; candidate 20/31; 11 observed regressions. Unchanged baseline control exits zero; candidate regression gate exits one as expected.
- TypeScript production build and ESLint pass.
- Browser suite: 8 passed, 2 intentionally skipped duplicate mobile integrations. Desktop/mobile Chromium cover snapshots, filters, trace navigation, report downloads, themes and loading errors. A desktop browser test starts the real FastAPI server, executes the candidate and saves an approved failure-to-test review. Another verifies JS/CSS, generated data and hash navigation under an actual `/agentguard/` URL prefix.
- npm dependency audit: zero reported vulnerabilities after patched minimatch override.
- Python dependency audit: pip-audit reported no known vulnerabilities in the installed project environment.
- Public snapshot schema and comparison validation implemented.
- Generated public snapshot validated successfully against Python contracts, JSON Schema and recomputed comparison.
- Actual desktop/mobile screenshots captured and visually inspected. Mobile tables scroll horizontally within the panel without page overflow.
- Git and GitHub CLI installed; GitHub CLI currently has no authenticated account.
- Coherent local commits use the explicit automation identity `AgentGuard local build <build@localhost>`, without guessing the user's author identity.
- Workflow YAML was parsed locally; actionlint binary download failed with HTTP 504, so actionlint and hosted workflow execution are not claimed.
- GitHub repository creation/push, hosted workflows and public Pages deployment are pending authentication.
- Docker and PostgreSQL integration have not been executed.

The larger master brief is not fully implemented: multi-user projects/configuration management, Alembic migrations, optional LLM judge, OTLP export and stochastic experiment aggregation are deferred. The working vertical slice prioritizes the reproducible interview workflow.
