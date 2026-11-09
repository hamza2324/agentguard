# Local API and connectors

Start from root:

```powershell
uv run uvicorn agentguard.api:create_app --factory --app-dir backend/src --host 127.0.0.1
```

Open `http://127.0.0.1:8000/docs` for generated contracts. All routes are local-only and unauthenticated. Do not expose the service to a network.

| Route | Behavior |
| --- | --- |
| GET /health | Local mode and readiness |
| POST /assessments | Score and persist an imported user baseline/candidate package |
| POST /assessments/live | Execute up to 10 scenarios against two operator-allowlisted endpoints and produce a report |
| GET /assessments/{id} | Retrieve a locally persisted user regression report |
| POST /playground | Fresh input, version and optional context; returns actual execution without asserting pass/fail |
| GET /agents | Included agent and supported versions |
| GET, POST /datasets | List / validate and import a versioned dataset; use a new ID to clone |
| GET, POST /runs | List stored runs / queue evaluation; returns job_id with HTTP 202 |
| GET /jobs/{id} | queued, running, completed with run_id, or failed |
| GET /runs/{id} | Entire report including scores and traces |
| POST /comparisons | baseline_id, candidate_id, threshold; persists comparison |
| GET, POST /reviews | Human approval and creation of versioned regression dataset |

```powershell
$body = @{version='candidate';dataset_id='support-operations'} | ConvertTo-Json
$job = Invoke-RestMethod http://127.0.0.1:8000/runs -Method Post -ContentType application/json -Body $body
Invoke-RestMethod "http://127.0.0.1:8000/jobs/$($job.job_id)"
```

Failure-to-test POST requires `run_id`, failed `scenario_id`, `note`, `approved: true`, and a full `scenario` matching the dataset contract. It returns `dataset_id`; pass this ID to POST /runs for a subsequent evaluation. The test `test_api_persistence_and_reviewed_failure_to_runnable_test` demonstrates the entire contract. In the UI this workflow appears only for failed runs executed by the connected local backend; published run IDs are not stored in your local database.

## HTTP connector contract

For the guided frontend, input package, metrics and local HTTP walkthrough, see [Test your agent](TEST_YOUR_AGENT.md). Public browser imports are evaluated locally without contacting this API; local live mode calls the allowlisted assessment route.

The connector is a Python library, not a public URL execution route. Provision a trusted exact HTTPS endpoint and allowlist in operator code, then call `agentguard.connector.invoke`.

Request:

```json
{"input":"Track A100","context":{"order_id":"A100"}}
```

Response:

```json
{"response":"Order A100 is delivered.","state":{"status":"delivered"},"evidence":["A100"],"spans":null,"duration_ms":42.1,"tokens":null,"cost":null}
```

When supplied, each span requires `id`, `tool`, `arguments`, `result`, `duration_ms`. Omit unavailable model usage by returning null. Duration must come from the agent or gateway measurement; never make it up. Missing spans remain null; trace-dependent checks become unavailable. Pydantic rejects unknown response fields. Timeout is ten seconds; no automatic retry prevents duplicate side effects. Redirects and nonpublic addresses are rejected; an egress firewall is required for a hardened remote service.

To evaluate a connected agent, obtain validated `Execution` objects using the connector and pass each to `engine.evaluate(scenario, execution)`, or supply a synchronous adapter through `engine.run(dataset, version, executor=adapter)`. Exceptions become failed executions with sanitized class-only messages and do not abort subsequent scenarios. A hosted external-agent orchestration UI, credential storage, cancellation and provider metadata are deferred.
