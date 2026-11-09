# Test your own agent before a release

Open **[Test your agent](https://hamza2324.github.io/agentguard/#test-agent)**. The four steps explain what to supply and what the report can establish. Use **Load a worked example** to learn the format with three real synthetic reference executions; replace the example with your own evidence for a real assessment.

## 1. Name the versions

Choose a baseline (the version you currently trust) and a candidate (your proposed change). Both must receive the same test inputs and session context. Comparing unrelated questions does not establish a regression.

Two input modes are supported:

- **Paste or upload execution data:** works directly on public GitHub Pages. Scoring runs in your browser. Your evidence is not posted to a server, saved to browser storage, or published to GitHub. Download your report before leaving.
- **Connect my agent endpoints:** runs both versions through a locally running Python backend. An operator must explicitly allow the exact URLs. The public site does not call arbitrary remote agents or store API credentials.

## 2. Define correct behavior

Each test needs a unique ID, a title, an input and at least one reviewed assertion:

| Input | What it checks |
| --- | --- |
| Expected final state (JSON) | Listed key/value pairs must match the observed state. Extra state keys are allowed. |
| Required response text | Each supplied phrase must occur verbatim, case-sensitive. This is not semantic grading. |
| Required tool calls | Each named tool must occur; supplied argument subsets must match. Additional nonforbidden tools are allowed. |
| Forbidden tool names | Those tools must not appear in the trace. |
| Required evidence IDs | Reference IDs must be present; this does not establish semantic factual correctness. |
| Output schema | Validates final state using JSON Schema draft-07; external schema references are rejected. |
| Session context | The same explicit context is sent to both versions. |

Start with a few meaningful cases: one ordinary task, a boundary condition, a missing-information case and a prohibited action. Add cases after actual failures. This tool does not invent expected answers from a prompt or evaluate an arbitrary source-code upload.

## 3. Supply actual execution evidence

Run each test through your own baseline and candidate, then paste the outputs into their respective fields. **Download input template** produces the full import package for your test definitions. You can also upload a complete JSON package at step 1.

Illustrative execution format (replace strings with your observed outputs; unavailable measurements are null):

```json
{
  "response": "The final response from your agent",
  "state": {"status": "delivered"},
  "evidence": ["order-reference"],
  "spans": [
    {"tool": "lookup_order", "arguments": {"order_id": "A100"}, "result": {"status": "delivered"}}
  ],
  "duration_ms": null,
  "tokens": null
}
```

`spans: null` means no tool trace was supplied. `spans: []` explicitly reports zero tool calls. These are different observations. Missing trace-dependent checks remain unavailable. Do not estimate tokens from character count or manufacture latency; use actual elapsed milliseconds and provider-reported total tokens.

The package shape is:

```text
schema_version: "1"
agent_name, baseline_version, candidate_version
cases: [{scenario: <scenario contract>, baseline: <execution>, candidate: <execution>}]
options: <thresholds and optional documented token pricing>
```

Browser imports support up to 100 scenarios and a 2 MB package. Live HTTP requests support up to 10 scenarios, executing each against both versions. Credentials should be handled by your local adapter or infrastructure, never pasted into frontend URL fields.

## Local live execution walkthrough

The included `examples/http_agent.py` is an executable adapter demonstration. It exposes the bundled synthetic agent through HTTP. Replace its reference-agent invocation with your own agent integration to test your application. The example uses no paid API.

Terminal 1, repository root:

```powershell
uv sync --frozen --python 3.12
$env:PYTHONPATH='backend/src'
uv run uvicorn http_agent:app --app-dir examples --host 127.0.0.1 --port 9000
```

Terminal 2, repository root:

```powershell
$env:AGENTGUARD_ALLOWED_ENDPOINTS='http://127.0.0.1:9000/baseline,http://127.0.0.1:9000/candidate'
$env:AGENTGUARD_ALLOW_LOOPBACK='1'
uv run uvicorn agentguard.api:create_app --factory --app-dir backend/src --host 127.0.0.1
```

Terminal 3:

```powershell
cd apps/web
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173/#test-agent`. Choose live mode. Use input `Refund A102` and expected state `{"refund_eligible": false}`. Supply the two URLs from the allowlist. Review and generate: the baseline rejects the 45-day-old refund, the candidate incorrectly permits it, and the report identifies the changed outcome with real tool traces.

HTTPS public endpoints also require exact `AGENTGUARD_ALLOWED_ENDPOINTS` entries. Loopback HTTP is disabled unless `AGENTGUARD_ALLOW_LOOPBACK=1` **and** the endpoint is explicitly allowed. Other private/reserved destinations remain rejected. The connector does not follow redirects or retry side-effecting calls. Use egress controls before hosting against untrusted destinations; the local API is not an authenticated public service.

HTTP requests use `{"input":"...","context":{}}`. Responses follow [the existing HTTP connector contract](API.md): `response`, `state`, `evidence`, `spans`, actual `duration_ms`, optional reported `tokens`, and nullable `cost`/`error`. The live assessment measures round-trip latency itself, replacing the adapter's handler timing. No provider pricing is assumed. Timeouts and response errors become failed executions with class-only explanations; subsequent scenarios still run.

## 4. Review the gate and read the report

Approve the input, assertions and evidence before generating. Configure the allowed pass-rate drop and percentage increases for latency, tokens and estimated cost. A strictly greater change breaches a threshold; a positive increase from a measured zero baseline also breaches a finite percentage threshold.

The report includes:

- Baseline/candidate pass rates, newly failing scenarios, resolved failures and unchanged failures.
- State, response, tool choice, arguments, forbidden-action, evidence and schema checks where applicable.
- Mean latency, measured-case coverage, total reported tokens and optional estimated USD cost.
- Threshold comparisons, per-scenario failure explanations, actual responses and tool evidence.
- Data-quality limitations and practical next steps for failing cases.
- JSON evidence, readable Markdown and browser Print / Save as PDF exports.

Latency and total usage are unavailable if any scenario lacks the measurement. Estimates require total reported tokens for every case, a supplied flat/blended USD rate per million tokens, and a documented price/configuration reference. Mixed input/output token pricing is not inferred. It is not an invoice.

**Regression gate failed** means the supplied pass-rate or performance threshold was breached. **Review required** covers remaining failures, unavailable trace checks or newly failing cases within a tolerated aggregate drop. **No regressions observed** applies only to this suite and its available assertions; it is not a general deployment approval. Tool/evidence checks without supplied requirements impose no constraints. No subjective LLM judge, statistical significance test or repeated stochastic evaluation is performed.

Reports from the local HTTP API are persisted in local SQLite and can be retrieved with `GET /assessments/{id}`. Browser-only reports remain in memory until downloaded. Nothing in this flow publishes your evidence to the portfolio dataset.

## Verification

Browser scoring is independently checked against Python's real reference outcomes for all 31 scenarios. The browser test suite covers custom input through report download, missing assertions, invalid JSON, and fresh end-to-end HTTP execution against the adapter. Python tests verify performance thresholds, pricing requirements, unavailable measurements, schema validation, boolean-versus-number state comparisons, persistence and endpoint restrictions.
