import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Upload,
  Download,
  Check,
  AlertTriangle,
  FileCheck2,
  Plus,
  Trash2,
  Printer,
  Link as LinkIcon,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import {
  assess,
  assessmentSchema,
  markdownReport,
  observationSchema,
  optionsSchema,
  type Assessment,
  type AssessmentReport,
} from "./assessment";
import { scenarioSchema, type Report } from "./schema";
import "./test-agent.css";

type Draft = {
  id: string;
  title: string;
  input: string;
  state: string;
  response: string;
  tools: string;
  forbidden: string;
  evidence: string;
  context: string;
  schema: string;
};
const blank = (n = 1): Draft => ({
  id: `test-${n}`,
  title: `Test ${n}`,
  input: "",
  state: "{}",
  response: "",
  tools: "[]",
  forbidden: "",
  evidence: "",
  context: "{}",
  schema: "",
});
const emptyExecution = () =>
  JSON.stringify(
    {
      response: "",
      state: {},
      evidence: [],
      spans: null,
      duration_ms: null,
      tokens: null,
    },
    null,
    2,
  );
const list = (value: string) =>
  value
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
const fromScenario = (s: Assessment["cases"][number]["scenario"]): Draft => ({
  id: s.id,
  title: s.title,
  input: s.input,
  state: JSON.stringify(s.expected_state, null, 2),
  response: s.required_response.join("\n"),
  tools: JSON.stringify(s.required_tools, null, 2),
  forbidden: s.forbidden_tools.join(", "),
  evidence: s.evidence.join(", "),
  context: JSON.stringify(s.context, null, 2),
  schema: s.output_schema ? JSON.stringify(s.output_schema, null, 2) : "",
});
function saveFile(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const metricLabel: Record<string, string> = {
  pass_rate: "All assertions pass",
  task_completion: "Expected state",
  tool_choice: "Tool-call accuracy",
  tool_arguments: "Argument accuracy",
  forbidden_actions: "Forbidden action safety",
  required_evidence: "Required evidence",
  output_schema: "Output schema",
  response_requirements: "Required response text",
  execution: "Execution health",
  latency_ms: "Mean execution latency",
  tokens: "Total reported tokens",
  estimated_cost_usd: "Estimated cost (USD)",
};
function number(value: number | null | undefined, key: string) {
  if (value == null) return "Unavailable";
  if (key === "latency_ms") return `${value.toFixed(2)} ms`;
  if (key === "tokens") return value.toLocaleString();
  if (key === "estimated_cost_usd") return `$${value.toFixed(6)}`;
  return `${(value * 100).toFixed(1)}%`;
}

export function TestAgent({ published }: { published: Report }) {
  const [step, setStep] = useState(1),
    [agent, setAgent] = useState(""),
    [baselineVersion, setBaselineVersion] = useState("v1.0"),
    [candidateVersion, setCandidateVersion] = useState("v1.1"),
    [mode, setMode] = useState<"import" | "live">("import"),
    [drafts, setDrafts] = useState<Draft[]>([blank()]),
    [evidence, setEvidence] = useState<
      Record<string, { baseline: string; candidate: string }>
    >({}),
    [options, setOptions] = useState(optionsSchema.parse({})),
    [backend, setBackend] = useState(false),
    [baselineUrl, setBaselineUrl] = useState(""),
    [candidateUrl, setCandidateUrl] = useState(""),
    [packageText, setPackageText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [example, setExample] = useState(false),
    [report, setReport] = useState<AssessmentReport | null>(null),
    [approved, setApproved] = useState(false);
  const reportRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setReport(null);
    setApproved(false);
  }, [
    agent,
    baselineVersion,
    candidateVersion,
    drafts,
    evidence,
    options,
    mode,
  ]);
  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
    fetch("http://127.0.0.1:8000/health", { signal: AbortSignal.timeout(1500) })
      .then((r) => r.json())
      .then((r) => setBackend(r.status === "ok"))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (report) reportRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [report]);
  const scenarios = () =>
    drafts.map((d) =>
      scenarioSchema.parse({
        id: d.id,
        title: d.title,
        category: "user regression",
        input: d.input,
        context: JSON.parse(d.context),
        expected_state: JSON.parse(d.state),
        required_response: d.response.split("\n").filter(Boolean),
        required_tools: JSON.parse(d.tools),
        forbidden_tools: list(d.forbidden),
        evidence: list(d.evidence),
        output_schema: d.schema.trim() ? JSON.parse(d.schema) : null,
        tags: ["user-authored"],
      }),
    );
  function update(index: number, key: keyof Draft, value: string) {
    setDrafts((previous) =>
      previous.map((d, i) => (i === index ? { ...d, [key]: value } : d)),
    );
    setExample(false);
    setReport(null);
    setApproved(false);
  }
  function importPackage(text: string) {
    try {
      if (text.length > 2_000_000) throw Error("Keep the package under 2 MB");
      const parsed = assessmentSchema.parse(JSON.parse(text));
      assess(parsed);
      setAgent(parsed.agent_name);
      setBaselineVersion(parsed.baseline_version);
      setCandidateVersion(parsed.candidate_version);
      setDrafts(parsed.cases.map((c) => fromScenario(c.scenario)));
      setEvidence(
        Object.fromEntries(
          parsed.cases.map((c) => [
            c.scenario.id,
            {
              baseline: JSON.stringify(c.baseline, null, 2),
              candidate: JSON.stringify(c.candidate, null, 2),
            },
          ]),
        ),
      );
      setOptions(parsed.options);
      setMode("import");
      setExample(false);
      setApproved(false);
      setReport(null);
      setError("");
      setStep(2);
    } catch (e) {
      setError(
        `Could not import package: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  function loadExample() {
    const ids = ["refund-A102", "urgent-0", "status-A101"];
    const cases = ids.map((id) => {
      const b = published.runs
          .find((r) => r.version === "baseline")!
          .results.find((r) => r.scenario.id === id)!,
        c = published.runs
          .find((r) => r.version === "candidate")!
          .results.find((r) => r.scenario.id === id)!;
      const observation = (e: typeof b.execution) => ({
        response: e.response,
        state: e.state,
        evidence: e.evidence,
        spans: e.spans,
        duration_ms: e.duration_ms,
        tokens: e.tokens,
        error: e.error,
      });
      return {
        scenario: b.scenario,
        baseline: observation(b.execution),
        candidate: observation(c.execution),
      };
    });
    importPackage(
      JSON.stringify({
        agent_name: "Support operations — worked example",
        baseline_version: "v1.0",
        candidate_version: "v1.1",
        cases,
      }),
    );
    setExample(true);
    setStep(1);
  }
  function next() {
    try {
      if (step === 1) {
        if (
          !agent.trim() ||
          !baselineVersion.trim() ||
          !candidateVersion.trim()
        )
          throw Error("Name your agent and both versions first.");
      }
      if (step === 2) {
        const s = scenarios();
        if (mode === "live" && s.length > 10)
          throw Error("Live assessments support up to 10 tests per request.");
        if (s.some((v) => !v.input.trim() || !v.title.trim()))
          throw Error(
            "Each test needs a title and the input your agent receives.",
          );
        const placeholder = { response: "placeholder", state: {} };
        assessmentSchema.parse({
          agent_name: agent,
          baseline_version: baselineVersion,
          candidate_version: candidateVersion,
          cases: s.map((scenario) => ({
            scenario,
            baseline: placeholder,
            candidate: placeholder,
          })),
          options,
        });
        assess({
          agent_name: agent,
          baseline_version: baselineVersion,
          candidate_version: candidateVersion,
          cases: s.map((scenario) => ({
            scenario,
            baseline: placeholder,
            candidate: placeholder,
          })),
          options,
        });
      }
      if (step === 3) {
        if (mode === "import") {
          buildPackage();
        } else if (!baselineUrl || !candidateUrl)
          throw Error("Enter both approved endpoint URLs.");
      }
      setError("");
      setApproved(false);
      setStep(Math.min(4, step + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function buildPackage() {
    return assessmentSchema.parse({
      agent_name: agent,
      baseline_version: baselineVersion,
      candidate_version: candidateVersion,
      options,
      cases: scenarios().map((scenario) => {
        const values = evidence[scenario.id];
        if (!values)
          throw Error(
            `Paste baseline and candidate execution JSON for ${scenario.title}.`,
          );
        const baseline = observationSchema.parse(JSON.parse(values.baseline)),
          candidate = observationSchema.parse(JSON.parse(values.candidate));
        if (
          [baseline, candidate].some(
            (e) => !e.response && !Object.keys(e.state).length && !e.error,
          )
        )
          throw Error(
            `Replace the empty execution template for ${scenario.title} with real output.`,
          );
        return { scenario, baseline, candidate };
      }),
    });
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      if (!approved)
        throw Error(
          "Review and approve the inputs and expected behavior before generating a report.",
        );
      if (mode === "import") {
        setReport(
          assess(
            buildPackage(),
            example
              ? "synthetic worked example / browser"
              : "user-imported evidence / browser; no agent execution",
          ),
        );
      } else {
        if (!backend)
          throw Error(
            "Start the local backend and open the local frontend for live execution.",
          );
        const r = await fetch("http://127.0.0.1:8000/assessments/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_name: agent,
            baseline_version: baselineVersion,
            candidate_version: candidateVersion,
            baseline_endpoint: baselineUrl,
            candidate_endpoint: candidateUrl,
            scenarios: scenarios(),
            options,
          }),
          signal: AbortSignal.timeout(240000),
        });
        if (!r.ok) throw Error(await r.text());
        setReport((await r.json()) as AssessmentReport);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const s = scenarios();
    const body = {
      schema_version: "1",
      agent_name: agent || "Your agent",
      baseline_version: baselineVersion,
      candidate_version: candidateVersion,
      options,
      cases: s.map((scenario) => ({
        scenario,
        baseline: JSON.parse(emptyExecution()),
        candidate: JSON.parse(emptyExecution()),
      })),
    };
    saveFile("agentguard-input-template.json", JSON.stringify(body, null, 2));
  }
  return (
    <div className="test-agent-page">
      <div className="eyebrow">YOUR AGENT / YOUR RELEASE CHECK</div>
      <div className="assessment-title">
        <div>
          <h1>
            Test your agent.
            <br />
            Know what changed.
          </h1>
          <p>
            Bring a baseline, a changed version, and the behavior you expect.
            We’ll turn the evidence into a regression report you can inspect and
            share.
          </p>
        </div>
        <button onClick={loadExample}>
          <PlayExample />
          Load a worked example
        </button>
      </div>
      <div className="assessment-intro">
        <ShieldCheck size={19} />
        <p>
          <b>Start here:</b> a URL or a prompt alone cannot establish a
          regression. Test both versions on the same inputs and decide what
          correct behavior looks like. The steps below guide you through it.
        </p>
      </div>
      <ol className="assessment-stepper">
        {[
          "Your agent",
          "Expected behavior",
          "Execution evidence",
          "Review & report",
        ].map((label, i) => (
          <li
            key={label}
            className={
              step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
            }
          >
            <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <section className="assessment-form panel">
        <div className="panel-head">
          <div>
            <span className="assessment-step-label">STEP {step} OF 4</span>
            <h2>
              {
                [
                  "Tell us what you’re testing",
                  "Define what correct looks like",
                  "Bring observed behavior from both versions",
                  "Set the gate. Review. Generate.",
                ][step - 1]
              }
            </h2>
          </div>
          <span className="pill">
            {mode === "import" ? "Browser assessment" : "Local live execution"}
          </span>
        </div>
        <div className="assessment-form-body">
          {example && (
            <div className="assessment-example">
              Synthetic worked example loaded. These are real saved
              reference-agent executions. Replace them to test your own agent.
            </div>
          )}
          {step === 1 && (
            <>
              <div className="assessment-fields">
                <label className="field">
                  Agent name
                  <input
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    placeholder="e.g. My customer support agent"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  Baseline version
                  <input
                    value={baselineVersion}
                    onChange={(e) => setBaselineVersion(e.target.value)}
                    maxLength={80}
                  />
                  <small>
                    The last known version you want to compare against.
                  </small>
                </label>
                <label className="field">
                  Candidate version
                  <input
                    value={candidateVersion}
                    onChange={(e) => setCandidateVersion(e.target.value)}
                    maxLength={80}
                  />
                  <small>The version you are checking before release.</small>
                </label>
              </div>
              <div className="assessment-modes">
                <button
                  className={mode === "import" ? "chosen" : ""}
                  onClick={() => setMode("import")}
                >
                  <Upload size={20} />
                  <b>Paste or upload execution data</b>
                  <span>
                    Works on this public site. Your input stays in this browser;
                    no model or remote agent is called.
                  </span>
                </button>
                <button
                  className={mode === "live" ? "chosen" : ""}
                  onClick={() => setMode("live")}
                >
                  <LinkIcon size={20} />
                  <b>Connect my agent endpoints</b>
                  <span>
                    Execute fresh tests using the local Python backend and
                    explicitly approved endpoint URLs.
                  </span>
                </button>
              </div>
              <details className="assessment-help">
                <summary>Already have an AgentGuard input package?</summary>
                <label className="field">
                  Upload assessment JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2_000_000) {
                        setError("Keep the package under 2 MB");
                        return;
                      }
                      importPackage(await file.text());
                    }}
                  />
                </label>
                <label className="field">
                  Or paste a complete input package
                  <textarea
                    rows={7}
                    value={packageText}
                    onChange={(e) => setPackageText(e.target.value)}
                    maxLength={2_000_000}
                    placeholder="Paste the versioned input package from your own execution harness"
                  />
                </label>
                <button onClick={() => importPackage(packageText)}>
                  Import package
                </button>
              </details>
            </>
          )}
          {step === 2 && (
            <>
              <p className="assessment-help-copy">
                A test includes the exact input and at least one assertion.
                Start with an expected final state or required response text.
                Add tool and evidence checks when your agent supplies traces.
              </p>
              {drafts.map((d, i) => (
                <article className="assessment-case" key={i}>
                  <div className="assessment-case-top">
                    <b>Test {i + 1}</b>
                    {drafts.length > 1 && (
                      <button
                        aria-label={`Remove test ${i + 1}`}
                        onClick={() =>
                          setDrafts((previous) =>
                            previous.filter((_, index) => index !== i),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="assessment-fields two">
                    <label className="field">
                      Test title
                      <input
                        value={d.title}
                        onChange={(e) => update(i, "title", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Stable test ID
                      <input
                        value={d.id}
                        onChange={(e) => update(i, "id", e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field">
                    Input sent to your agent
                    <textarea
                      rows={3}
                      value={d.input}
                      onChange={(e) => update(i, "input", e.target.value)}
                      placeholder="e.g. Can I get a refund for order A102?"
                      maxLength={10000}
                    />
                  </label>
                  <div className="assessment-fields two">
                    <label className="field">
                      Expected final state (JSON)
                      <textarea
                        rows={4}
                        value={d.state}
                        onChange={(e) => update(i, "state", e.target.value)}
                        placeholder={'{"refund_eligible": false}'}
                      />
                      <small>
                        Only listed keys must match. Leave {`{}`} if you use a
                        response assertion instead.
                      </small>
                    </label>
                    <label className="field">
                      Required response text
                      <textarea
                        rows={4}
                        value={d.response}
                        onChange={(e) => update(i, "response", e.target.value)}
                        placeholder="One exact required phrase per line"
                      />
                      <small>
                        Case-sensitive substring checks, not semantic or LLM
                        grading.
                      </small>
                    </label>
                  </div>
                  <details className="assessment-help">
                    <summary>
                      Tool calls, evidence, context & output schema
                    </summary>
                    <label className="field">
                      Required tool calls (JSON)
                      <textarea
                        rows={4}
                        value={d.tools}
                        onChange={(e) => update(i, "tools", e.target.value)}
                        placeholder={
                          '[{"tool":"lookup_order","arguments":{"order_id":"A102"}}]'
                        }
                      />
                      <small>
                        Argument subsets must match; valid extra tool calls are
                        allowed.
                      </small>
                    </label>
                    <div className="assessment-fields two">
                      <label className="field">
                        Forbidden tool names
                        <input
                          value={d.forbidden}
                          onChange={(e) =>
                            update(i, "forbidden", e.target.value)
                          }
                          placeholder="delete_order, issue_payment"
                        />
                      </label>
                      <label className="field">
                        Required evidence IDs
                        <input
                          value={d.evidence}
                          onChange={(e) =>
                            update(i, "evidence", e.target.value)
                          }
                          placeholder="A102, refund-policy-v1"
                        />
                      </label>
                    </div>
                    <label className="field">
                      Session context (JSON)
                      <textarea
                        rows={2}
                        value={d.context}
                        onChange={(e) => update(i, "context", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Final-state JSON Schema (optional, draft-07)
                      <textarea
                        rows={3}
                        value={d.schema}
                        onChange={(e) => update(i, "schema", e.target.value)}
                        placeholder={
                          '{"type":"object","required":["refund_eligible"]}'
                        }
                      />
                    </label>
                  </details>
                </article>
              ))}
              <button
                onClick={() => {
                  setDrafts((previous) => [
                    ...previous,
                    blank(previous.length + 1),
                  ]);
                  setApproved(false);
                }}
                disabled={drafts.length >= (mode === "live" ? 10 : 100)}
              >
                <Plus size={15} />
                Add another test
              </button>
              <button
                className="assessment-template"
                onClick={() => {
                  try {
                    template();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                <Download size={15} />
                Download input template
              </button>
            </>
          )}
          {step === 3 && (
            <>
              {mode === "import" ? (
                <>
                  <p className="assessment-help-copy">
                    Run each test against both agent versions using your own
                    execution harness. Paste the resulting JSON here. Unknown
                    latency, tokens or tool traces should be <code>null</code>;
                    never estimate them from response length.
                  </p>
                  <details className="assessment-help">
                    <summary>What does an execution object look like?</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          response: "The final answer from your agent",
                          state: { result: "actual final state" },
                          evidence: [],
                          spans: [
                            {
                              tool: "your_tool",
                              arguments: { query: "actual argument" },
                              result: { value: "actual tool return" },
                            },
                          ],
                          duration_ms: null,
                          tokens: null,
                        },
                        null,
                        2,
                      )}
                    </pre>
                    <p>
                      Capture real elapsed milliseconds and provider-reported
                      total tokens if available. Use <code>spans: null</code> if
                      your agent does not expose tools. Empty arrays mean the
                      agent explicitly made zero tool calls.
                    </p>
                  </details>
                  {drafts.map((d) => (
                    <article className="assessment-case" key={d.id}>
                      <h3>{d.title}</h3>
                      <p>
                        <code>{d.input}</code>
                      </p>
                      <div className="assessment-fields two">
                        {(["baseline", "candidate"] as const).map((version) => (
                          <label className="field" key={version}>
                            {version === "baseline" ? "Baseline" : "Candidate"}{" "}
                            execution JSON — {d.title}
                            <textarea
                              rows={13}
                              value={evidence[d.id]?.[version] ?? ""}
                              onChange={(e) => {
                                setEvidence((previous) => ({
                                  ...previous,
                                  [d.id]: {
                                    baseline:
                                      previous[d.id]?.baseline ??
                                      emptyExecution(),
                                    candidate:
                                      previous[d.id]?.candidate ??
                                      emptyExecution(),
                                    [version]: e.target.value,
                                  },
                                }));
                                setExample(false);
                                setReport(null);
                              }}
                              placeholder={emptyExecution()}
                              maxLength={500000}
                            />
                          </label>
                        ))}
                      </div>
                    </article>
                  ))}
                </>
              ) : (
                <>
                  <div className="assessment-local-status">
                    <Terminal size={20} />
                    <div>
                      <b>
                        {backend
                          ? "Local backend connected"
                          : "Local execution requires your Python backend"}
                      </b>
                      <p>
                        The public site does not contact arbitrary agent URLs.
                        Open this same flow at localhost after starting the
                        backend. No API keys belong in these fields.
                      </p>
                    </div>
                  </div>
                  <label className="field">
                    Baseline endpoint URL
                    <input
                      value={baselineUrl}
                      onChange={(e) => setBaselineUrl(e.target.value)}
                      placeholder="https://your-service.example/v1/evaluate"
                    />
                  </label>
                  <label className="field">
                    Candidate endpoint URL
                    <input
                      value={candidateUrl}
                      onChange={(e) => setCandidateUrl(e.target.value)}
                      placeholder="https://your-service.example/v2/evaluate"
                    />
                  </label>
                  <details className="assessment-help" open>
                    <summary>Configure and start the local backend</summary>
                    <pre>{`$env:AGENTGUARD_ALLOWED_ENDPOINTS='https://your-service.example/v1/evaluate,https://your-service.example/v2/evaluate'\nuv run uvicorn agentguard.api:create_app --factory --app-dir backend/src --host 127.0.0.1\n\n# In another terminal\ncd apps/web\nnpm.cmd run dev`}</pre>
                    <p>
                      For an agent running on your laptop, explicitly opt into
                      loopback and allow its exact endpoint URLs. The API sends{" "}
                      <code>{'{"input":"...","context":{}}'}</code> and expects
                      the documented execution response.{" "}
                      <a
                        href="https://github.com/hamza2324/agentguard/blob/main/docs/TEST_YOUR_AGENT.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Read the adapter guide.
                      </a>
                    </p>
                    <pre>{`$env:AGENTGUARD_ALLOWED_ENDPOINTS='http://127.0.0.1:9000/baseline,http://127.0.0.1:9000/candidate'\n$env:AGENTGUARD_ALLOW_LOOPBACK='1'`}</pre>
                  </details>
                </>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <div className="assessment-review">
                <div>
                  <small>AGENT</small>
                  <b>{agent}</b>
                </div>
                <div>
                  <small>VERSIONS</small>
                  <b>
                    {baselineVersion} → {candidateVersion}
                  </b>
                </div>
                <div>
                  <small>TESTS</small>
                  <b>
                    {drafts.length} reviewed scenario
                    {drafts.length > 1 ? "s" : ""}
                  </b>
                </div>
              </div>
              <h3>Choose your regression thresholds</h3>
              <div className="assessment-fields two">
                <label className="field">
                  Allowed pass-rate drop (percentage points)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={options.max_pass_rate_drop * 100}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        max_pass_rate_drop: Number(e.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field">
                  Allowed latency increase (%)
                  <input
                    type="number"
                    min={0}
                    value={options.max_latency_increase_pct}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        max_latency_increase_pct: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Allowed token increase (%)
                  <input
                    type="number"
                    min={0}
                    value={options.max_token_increase_pct}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        max_token_increase_pct: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Allowed estimated cost increase (%)
                  <input
                    type="number"
                    min={0}
                    value={options.max_cost_increase_pct}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        max_cost_increase_pct: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <details className="assessment-help">
                <summary>Optional documented token pricing</summary>
                <p>
                  Cost remains unavailable unless every execution includes
                  reported tokens and you supply a documented flat or blended
                  USD rate. This is an estimate, not a provider invoice.
                </p>
                <label className="field">
                  USD per million tokens
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={options.usd_per_million_tokens ?? ""}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        usd_per_million_tokens:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Pricing source or configuration reference
                  <input
                    value={options.pricing_source}
                    onChange={(e) =>
                      setOptions({ ...options, pricing_source: e.target.value })
                    }
                    placeholder="Provider pricing URL and dated blended-rate configuration"
                  />
                </label>
              </details>
              <label className="assessment-approval">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                I reviewed the inputs, expected behavior, execution evidence and
                thresholds.
              </label>
              <p className="footnote">
                The report will distinguish observed failures, changed outcomes,
                missing measurements and threshold breaches. Passing these tests
                does not certify an agent for production.
              </p>
            </>
          )}
          {error && (
            <div className="assessment-error" role="alert">
              <AlertTriangle size={17} />
              <pre>{error}</pre>
            </div>
          )}
          <div className="assessment-actions">
            {step > 1 && (
              <button
                onClick={() => {
                  setError("");
                  setStep(step - 1);
                  setApproved(false);
                }}
                disabled={busy}
              >
                <ArrowLeft size={15} />
                Back
              </button>
            )}
            <span />
            {step < 4 ? (
              <button className="assessment-primary" onClick={next}>
                Continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="assessment-primary"
                onClick={generate}
                disabled={busy || !approved || (mode === "live" && !backend)}
              >
                <FileCheck2 size={16} />
                {busy ? "Running your tests…" : "Generate regression report"}
              </button>
            )}
          </div>
        </div>
      </section>
      {report && (
        <section
          ref={reportRef}
          id="assessment-report"
          className="assessment-report"
        >
          <div className="assessment-report-title">
            <div>
              <div className="eyebrow">AGENTGUARD / RELEASE REVIEW REPORT</div>
              <h2>{report.agent_name}</h2>
              <p>
                {report.baseline_version} → {report.candidate_version} ·{" "}
                {new Date(report.created_at).toLocaleString()}
              </p>
            </div>
            <div className="assessment-export">
              <button
                onClick={() =>
                  saveFile(
                    "agentguard-rerunnable-input.json",
                    JSON.stringify(
                      {
                        schema_version: "1",
                        agent_name: report.agent_name,
                        baseline_version: report.baseline_version,
                        candidate_version: report.candidate_version,
                        options: report.options,
                        cases: report.cases.map((c) => ({
                          scenario: c.scenario,
                          baseline: c.baseline.execution,
                          candidate: c.candidate.execution,
                        })),
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download size={15} />
                Inputs
              </button>
              <button
                onClick={() =>
                  saveFile(
                    "agentguard-regression-report.json",
                    JSON.stringify(report, null, 2),
                  )
                }
              >
                <Download size={15} />
                JSON
              </button>
              <button
                onClick={() =>
                  saveFile(
                    "agentguard-regression-report.md",
                    markdownReport(report),
                    "text/markdown",
                  )
                }
              >
                <Download size={15} />
                Markdown
              </button>
              <button
                onClick={() => {
                  document
                    .querySelectorAll<HTMLDetailsElement>(
                      "#assessment-report details",
                    )
                    .forEach((d) => {
                      d.open = true;
                    });
                  window.print();
                }}
              >
                <Printer size={15} />
                Print / PDF
              </button>
            </div>
          </div>
          <div
            className={`assessment-verdict ${report.verdict === "no_regressions_observed" ? "clear" : "attention"}`}
          >
            <span>
              {report.verdict === "no_regressions_observed" ? (
                <Check size={25} />
              ) : (
                <AlertTriangle size={25} />
              )}
            </span>
            <div>
              <h3>
                {report.verdict === "regressions_detected"
                  ? "Regression gate failed"
                  : report.verdict === "review_required"
                    ? "Review required"
                    : "No regressions observed in these tests"}
              </h3>
              <p>
                {report.regressions} newly failing scenarios · {report.resolved}{" "}
                resolved failures · {report.candidate.passed}/
                {report.candidate.total} candidate scenarios pass
              </p>
              <small>
                {report.mode}. Scope is limited to the supplied assertions.
              </small>
            </div>
          </div>
          <div className="metrics">
            <article>
              <span>Baseline pass rate</span>
              <strong>
                {number(report.baseline.metrics.pass_rate, "pass_rate")}
              </strong>
              <small>
                {report.baseline.passed}/{report.baseline.total} scenarios
              </small>
            </article>
            <article>
              <span>Candidate pass rate</span>
              <strong>
                {number(report.candidate.metrics.pass_rate, "pass_rate")}
              </strong>
              <small>
                {report.candidate.passed}/{report.candidate.total} scenarios
              </small>
            </article>
            <article>
              <span>New failures</span>
              <strong>{report.regressions}</strong>
              <small>Passed baseline, failed candidate</small>
            </article>
            <article>
              <span>Unavailable checks</span>
              <strong>{report.candidate.unavailable_checks}</strong>
              <small>Candidate checks without tool evidence</small>
            </article>
          </div>
          <section className="panel">
            <div className="panel-head">
              <h3>Quality, usage & performance</h3>
              <span className="pill">Complete evidence only</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>METRIC</th>
                    <th>BASELINE</th>
                    <th>CANDIDATE</th>
                    <th>INTERPRETATION</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(
                    new Set([
                      ...Object.keys(report.baseline.metrics),
                      ...Object.keys(report.candidate.metrics),
                    ]),
                  ).map((key) => (
                    <tr key={key}>
                      <td>{metricLabel[key] || key}</td>
                      <td>{number(report.baseline.metrics[key], key)}</td>
                      <td>{number(report.candidate.metrics[key], key)}</td>
                      <td>
                        {key === "latency_ms"
                          ? `${report.candidate.latency_coverage}/${report.candidate.total} measured candidate cases`
                          : key === "tokens"
                            ? `${report.candidate.token_coverage}/${report.candidate.total} cases with reported usage`
                            : key === "estimated_cost_usd"
                              ? "Flat-rate estimate; requires usage and a documented price"
                              : "Fraction of scenarios passing the supplied assertions"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="assessment-metric-note">
              Latency and usage totals are unavailable if any scenario lacks the
              measurement. Tool and evidence checks without requirements impose
              no constraints. Missing traces remain unavailable, never zero.
            </p>
          </section>
          <section className="panel assessment-performance">
            <div className="panel-head">
              <h3>Regression thresholds</h3>
            </div>
            <p>
              Pass-rate drop:{" "}
              <b>
                {(report.pass_rate_drop * 100).toFixed(1)} percentage points
              </b>
              ; allowed: {(report.options.max_pass_rate_drop * 100).toFixed(1)}.
            </p>
            {report.performance.map((p) => (
              <div key={p.metric}>
                <b>{metricLabel[p.metric]}</b>
                <span>
                  {p.increase_pct === null
                    ? p.baseline === 0 &&
                      p.candidate !== null &&
                      p.candidate > 0
                      ? "Increase from zero baseline"
                      : "Percent change unavailable"
                    : `${p.increase_pct > 0 ? "+" : ""}${p.increase_pct.toFixed(1)}%`}
                </span>
                <small>Allowed +{p.threshold_pct}%</small>
                <span className={p.breached ? "negative" : ""}>
                  {p.breached
                    ? "Threshold exceeded"
                    : p.baseline === null || p.candidate === null
                      ? "Unavailable"
                      : "Within threshold"}
                </span>
              </div>
            ))}
          </section>
          <h3 className="assessment-findings-title">
            Scenario evidence & next steps
          </h3>
          {report.cases.map((c) => (
            <details
              key={c.scenario.id}
              className="assessment-finding panel"
              open={c.status === "regression"}
            >
              <summary>
                <span
                  className={
                    c.status === "regression" ? "negative" : "positive"
                  }
                >
                  {c.status.replaceAll("_", " ")}
                </span>
                <b>{c.scenario.title}</b>
                <code>{c.scenario.id}</code>
              </summary>
              <div className="assessment-finding-body">
                <p>
                  <b>Input:</b> {c.scenario.input}
                </p>
                <div className="assessment-fields two">
                  <div>
                    <h4>Expected state</h4>
                    <pre>
                      {JSON.stringify(c.scenario.expected_state, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4>Candidate observed state</h4>
                    <pre>
                      {JSON.stringify(c.candidate.execution.state, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="assertions">
                  {c.candidate.scores.map((s) => (
                    <div key={s.evaluator}>
                      <span
                        className={
                          s.passed === false
                            ? "negative"
                            : s.passed === null
                              ? ""
                              : "positive"
                        }
                      >
                        {s.passed === false ? (
                          <AlertTriangle size={14} />
                        ) : s.passed === null ? (
                          "—"
                        ) : (
                          <Check size={14} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {metricLabel[s.evaluator] || s.evaluator}
                        </strong>
                        <p>{s.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="assessment-next-step">
                  <b>Next step:</b>{" "}
                  {c.status === "regression"
                    ? "Inspect the changed behavior and its failing assertions below. Fix the agent or explicitly review the expectation, then rerun the same tests."
                    : !c.candidate.passed
                      ? "The candidate still fails. Resolve the observed assertion failures before treating this case as covered."
                      : "Keep this case in your regression suite and broaden coverage before release."}
                </p>
                <div className="assessment-fields two">
                  {(["baseline", "candidate"] as const).map((v) => (
                    <details className="assessment-trace" key={v}>
                      <summary>
                        {v === "baseline" ? "Baseline" : "Candidate"} response &
                        tool trace
                      </summary>
                      <blockquote>
                        {c[v].execution.response || "No final response"}
                      </blockquote>
                      <pre>{JSON.stringify(c[v].execution, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              </div>
            </details>
          ))}
          <section className="assessment-limitations">
            <h3>Scope, data quality & limitations</h3>
            <ul>
              {report.limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              Pricing source:{" "}
              {report.options.pricing_source ||
                "Not provided; cost is unavailable."}
            </p>
            <p>
              Report ID: <code>{report.id}</code>. Evidence stays in your
              browser in import mode. Nothing is published to GitHub.
            </p>
          </section>
        </section>
      )}
    </div>
  );
}
function PlayExample() {
  return <Terminal size={15} />;
}
