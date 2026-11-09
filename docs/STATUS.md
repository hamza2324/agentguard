# Verification status

Implemented and tested locally on 2026-11-09. This document distinguishes local verification from unavailable hosted verification.

- Python: 31 tests pass, covering assertion faults, independently labeled agent regressions, repeated outcomes, comparison thresholds/resolutions, connector validation/timeouts, missing traces, API jobs/persistence, execution exceptions and the approved failure-to-test workflow.
- Benchmark: baseline 31/31; candidate 20/31; 11 observed regressions. Unchanged baseline control exits zero; candidate regression gate exits one as expected.
- TypeScript production build and ESLint pass.
- Browser suite: 22 passed, 2 intentionally skipped duplicate mobile integrations. Desktop/mobile Chromium cover snapshots, filters, trace navigation, report downloads, themes and loading errors. A desktop browser test starts the real FastAPI server, executes the candidate and saves an approved failure-to-test review. Another verifies JS/CSS, generated data and hash navigation under an actual `/agentguard/` URL prefix.
- npm dependency audit: zero reported vulnerabilities after patched minimatch override.
- Python dependency audit: pip-audit reported no known vulnerabilities in the installed project environment.
- Public snapshot schema and comparison validation implemented.
- Generated public snapshot validated successfully against Python contracts, JSON Schema and recomputed comparison.
- Actual desktop/mobile screenshots captured and visually inspected. Mobile tables scroll horizontally within the panel without page overflow.
- Git and GitHub CLI installed. Existing Git Credential Manager authentication was verified as `hamza2324` and reused in process memory for GitHub operations; no additional login was needed.
- Coherent local commits use the explicit automation identity `AgentGuard local build <build@localhost>`, without guessing the user's author identity.
- Workflow YAML was parsed locally; actionlint binary download failed with HTTP 504, so actionlint is not claimed. Hosted workflows were separately executed successfully.
- Public repository: https://github.com/hamza2324/agentguard. Public Pages: https://hamza2324.github.io/agentguard/. CI, deterministic evaluation and Pages publication completed successfully on GitHub Actions.
  - CI: https://github.com/hamza2324/agentguard/actions/runs/42584442926
  - Deterministic evaluation: https://github.com/hamza2324/agentguard/actions/runs/42584443176
  - Pages: https://github.com/hamza2324/agentguard/actions/runs/42584442932
- Docker and PostgreSQL integration have not been executed.

The larger master brief is not fully implemented: multi-user projects/configuration management, Alembic migrations, optional LLM judge, OTLP export and stochastic experiment aggregation are deferred. The working vertical slice prioritizes the reproducible interview workflow.

Homepage redesign: narrative hero, real baseline/candidate example, workflow explanation, setup section, and explanatory Ask AgentGuard guide. Playground supports transparent static replay plus fresh local support requests. Backend input validation and desktop/mobile request execution are tested.

The prior assumption that a separate GitHub CLI login was required was corrected: the existing Git credential helper successfully authenticated GitHub operations.

User-agent assessment update: four-step private browser import and approved local HTTP execution now generate quality/performance reports. Browser scoring matches Python on all 31 reference scenarios. Focused desktop/mobile assessment tests pass, including actual HTTP adapter execution and report download. Full local suite: 31 Python tests passed; 22 desktop/mobile browser tests passed with 2 intentionally skipped duplicate integrations. Production build, TypeScript, ESLint, Ruff, snapshot validation and npm audit pass. Updated hosted workflow results are verified after publication.
