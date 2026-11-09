# Engineering decisions

Reviewed 2026-11-09. Agent changes can preserve fluent output while breaking operational behavior. AgentGuard tests observable state, required tools, argument constraints, forbidden actions, output schemas and evidence. It owns the scoring and comparison code.

## Industry context

[LangSmith evaluation](https://docs.langchain.com/langsmith/evaluation) organizes datasets, experiments and evaluators. [Phoenix](https://arize.com/docs/phoenix) joins tracing and evaluation. [Langfuse](https://langfuse.com/docs/evaluation/overview) supports scores and experiments. [DeepEval](https://deepeval.com/docs/getting-started) provides evaluation testing abstractions. AgentGuard borrows the general separation of datasets, executions and checks; it does not wrap those services or reproduce their interfaces.

The focused differentiator is an inspectable, offline regression demonstration: modify a real local agent, execute versioned assertions, compare runs, inspect failing evidence, and turn an approved failure into a subsequent executable test.

## Architecture and tradeoffs

- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) orchestrates a rule-driven support handler. No LLM is needed. This tests workflow regression mechanics, not model reasoning quality.
- Pydantic contracts and Python evaluators remain independent of React and FastAPI. Assertions are never given to the agent.
- [FastAPI](https://fastapi.tiangolo.com/) provides local API validation and OpenAPI. One bounded worker thread keeps evaluations off request handlers. This is not a durable distributed job queue.
- SQLAlchemy stores typed-domain JSON records in SQLite. `DATABASE_URL` can select PostgreSQL with a separately installed driver. A normalized relational schema and Alembic migrations are deferred; `create_all` initializes the initial schema.
- [uv](https://docs.astral.sh/uv/) locks dependencies; Python 3.12 is pinned because the host's newer default interpreter required native builds. Python and npm locks are committed.
- React, TypeScript, Vite and Zod provide a small static evidence explorer. Custom CSS and native controls keep UI effort bounded. [shadcn/Vite](https://ui.shadcn.com/docs/installation/vite) was reviewed; shadcn, Tailwind, animation libraries and table frameworks were not needed for this slice.
- [Vite static deployment](https://vite.dev/guide/static-deploy) and [GitHub Pages](https://docs.github.com/en/pages) support a generated static bundle. Relative base paths plus hash navigation support repository subpaths. Python runs during [Actions](https://docs.github.com/en/actions), never on Pages.
- [Playwright](https://playwright.dev/) verifies the built dashboard in desktop and mobile Chromium, including failure states and evidence downloads.
- [OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/) and [GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) were reviewed. The initial implementation stores explicit local tool spans; it does not claim OTLP export or full semantic-convention compliance. This is an extension point.

## Security and boundaries

Synthetic data only; no live financial operations. Agent selection is an enum, not uploaded code. HTTP endpoints require operator-supplied exact HTTPS allowlists, DNS validation, timeouts, no redirects and no environment proxy. This is defense in depth, not protection against DNS rebinding: production hosting needs outbound network controls. Connector execution is not exposed as a public API route. No automatic retry for potentially side-effecting agents.

The API binds to loopback and has no authentication. Do not publish it directly. CORS permits only the local Vite origins. Snapshot publishing executes the bundled reference agent and publishes only synthetic evidence. External-agent content needs a separate approved sanitization/export pipeline before public release. No judge, paid model calls, arbitrary code execution or third-party business integrations are included.

Direct dependency licenses: FastAPI, SQLAlchemy, LangGraph, React, Vite, Zod, Lucide and pytest use permissive licenses (MIT, BSD, or ISC); Playwright uses Apache-2.0. This is not a legal audit of all transitive dependencies. AgentGuard source uses MIT.
