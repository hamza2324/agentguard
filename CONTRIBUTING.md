# Contributing

Use Python 3.12 and Node 24. Run `uv sync --frozen`, `uv run pytest`, `uv run ruff check backend scripts`, and `uv run ruff format --check backend scripts`. In `apps/web`, run `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd run build`, `npx.cmd playwright install chromium`, then `npm.cmd test`.

Keep agent logic separate from expected outcomes. Add a human-authored failure label when introducing a deliberate defect. Do not commit secrets, real customer records, fabricated metrics or arbitrary remote execution. Generated public data must come from the bundled synthetic agent. Explain meaningful limitations in documentation.
