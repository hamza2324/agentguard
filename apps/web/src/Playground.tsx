import { useEffect, useState } from "react";
import {
  ArrowRight,
  Play,
  Terminal,
  Check,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";
import type { Report } from "./schema";
import { AskGuide } from "./Welcome";

export function Playground({ report }: { report: Report }) {
  const [version, setVersion] = useState("candidate"),
    [sample, setSample] = useState("refund-A102"),
    [message, setMessage] = useState("Can I refund A102?"),
    [backend, setBackend] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      response: string;
      state: Record<string, unknown>;
      evidence: string[];
      spans:
        | {
            tool: string;
            arguments: Record<string, unknown>;
            result: Record<string, unknown>;
          }[]
        | null;
    } | null>(null),
    [mode, setMode] = useState("");
  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
    fetch("http://127.0.0.1:8000/health", { signal: AbortSignal.timeout(1500) })
      .then((r) => r.json())
      .then((d) => setBackend(d.status === "ok"))
      .catch(() => {});
  }, []);
  function replay() {
    const stored = report.runs
      .find((r) => r.version === version)!
      .results.find((r) => r.scenario.id === sample)!;
    setMessage(stored.scenario.input);
    setResult(stored.execution);
    setMode("Saved scenario replay — no fresh agent execution");
    setError("");
  }
  async function execute() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("http://127.0.0.1:8000/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: message, version }),
      });
      if (!r.ok) throw Error(await r.text());
      setResult(await r.json());
      setMode("Fresh local execution — real reference agent");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="playground-page">
      <div className="eyebrow">MEET THE AGENT UNDER TEST</div>
      <h1>
        A support agent.
        <br />
        Two versions. Different decisions.
      </h1>
      <p className="playground-intro">
        Ask about a synthetic order, request a refund, create a support ticket,
        or escalate a concern. Then look beyond the answer: inspect what the
        agent actually did.
      </p>
      <div className="playground-layout">
        <section className="panel playground-input">
          <div className="panel-head">
            <h2>
              <MessageCircle size={18} />
              Try the agent
            </h2>
            <span className="pill">
              {backend ? "Local agent ready" : "Published demo"}
            </span>
          </div>
          <div className="playground-controls">
            <label className="field">
              Agent version
              <select
                value={version}
                onChange={(e) => {
                  setVersion(e.target.value);
                  setResult(null);
                }}
              >
                <option value="baseline">v1.0 — Baseline</option>
                <option value="candidate">v1.1 — Changed agent</option>
              </select>
            </label>
            <label className="field">
              Choose an example
              <select
                value={sample}
                onChange={(e) => {
                  setSample(e.target.value);
                  setMessage(
                    report.dataset.scenarios.find(
                      (s) => s.id === e.target.value,
                    )!.input,
                  );
                  setResult(null);
                }}
              >
                {report.dataset.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Your request
              <textarea
                aria-label="Support request"
                rows={4}
                value={message}
                readOnly={!backend}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={10000}
              />
            </label>
            {backend ? (
              <button
                className="run-agent"
                onClick={execute}
                disabled={busy || !message.trim()}
              >
                <Play size={16} />
                {busy ? "Executing…" : "Run agent locally"}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="run-agent" onClick={replay}>
                <Play size={16} />
                Replay selected example
                <ArrowRight size={16} />
              </button>
            )}
            <p className="footnote">
              {backend
                ? "Fresh requests execute the local rule-driven LangGraph agent. These ad hoc requests are not automatically scored: evaluation requires reviewed assertions."
                : "Public Pages cannot run Python. Replay reads an actual stored execution for the selected version and scenario. To type a fresh request, run the local backend."}
            </p>
            {error && <p role="alert">{error}</p>}
          </div>
        </section>
        <section className="panel playground-output">
          <div className="panel-head">
            <h2>Answer + execution evidence</h2>
            <span className="pill">
              {result ? "Evidence available" : "Ready when you are"}
            </span>
          </div>
          {result ? (
            <div className="playground-controls">
              <div className="replay-mode">
                <Check size={14} />
                {mode}
              </div>
              <blockquote>{result.response}</blockquote>
              <h3>Observed state</h3>
              <pre>{JSON.stringify(result.state, null, 2)}</pre>
              <h3>Actual tool calls</h3>
              {result.spans?.length ? (
                result.spans.map((span, i) => (
                  <div className="playground-tool" key={i}>
                    <span>{i + 1}</span>
                    <div>
                      <b>{span.tool}</b>
                      <pre>
                        {JSON.stringify(
                          { arguments: span.arguments, result: span.result },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </div>
                ))
              ) : (
                <p>No tool calls were observed.</p>
              )}
              <p className="footnote">
                Evidence references: {result.evidence.join(", ") || "none"}
              </p>
              <a className="text-button" href="#comparison">
                Compare against the expected behavior <ArrowRight size={14} />
              </a>
            </div>
          ) : (
            <div className="playground-empty">
              <Terminal size={38} />
              <h3>The response is only half the story.</h3>
              <p>
                Choose a version and run an example to inspect the answer, final
                state and tool calls together.
              </p>
            </div>
          )}
        </section>
      </div>
      <div className="playground-notes">
        <div>
          <Check size={18} />
          <p>
            <b>Safe by design</b>Synthetic records and mock support actions. No
            real orders, payments, or customer accounts.
          </p>
        </div>
        <div>
          <AlertTriangle size={18} />
          <p>
            <b>Deliberately imperfect</b>The changed version contains known
            bugs. Compare both versions to see what the evaluator catches.
          </p>
        </div>
      </div>
      <AskGuide report={report} />
    </div>
  );
}
