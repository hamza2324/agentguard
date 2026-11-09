import { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ShieldCheck,
  LayoutDashboard,
  GitCompareArrows,
  Database,
  FileText,
  ArrowUpRight,
  Search,
  Sun,
  Moon,
  ChevronRight,
  Check,
  AlertTriangle,
  Download,
  Terminal,
  Activity,
  X,
  Home,
  FlaskConical,
} from "lucide-react";
import { reportSchema, runSchema, type Report, type Result } from "./schema";
import "./style.css";
import "./welcome.css";
import { Welcome } from "./Welcome";
import { Playground } from "./Playground";

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const pct = (n: number | null | undefined) =>
  n == null ? "Unavailable" : `${(n * 100).toFixed(1)}%`;
const pages = [
  ["home", "Home", Home],
  ["playground", "Try the agent", FlaskConical],
  ["overview", "Overview", LayoutDashboard],
  ["comparison", "Version comparison", GitCompareArrows],
  ["datasets", "Scenario library", Database],
  ["reports", "Reports & provenance", FileText],
] as const;
function App() {
  const dialogRef = useRef<HTMLElement>(null);
  const [sort, setSort] = useState("id"),
    [localRuns, setLocalRuns] = useState<Report["runs"]>([]),
    [selectedRunId, setSelectedRunId] = useState("");
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(location.hash.slice(1) || "home"),
    [version, setVersion] = useState("candidate"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Result | null>(null),
    [theme, setTheme] = useState(localStorage.getItem("theme") || "light"),
    [backend, setBackend] = useState(""),
    [apiInput, setApiInput] = useState("http://127.0.0.1:8000"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(""),
    [approved, setApproved] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/report.json`)
      .then((r) => {
        if (!r.ok) throw Error(`Snapshot request failed (${r.status})`);
        return r.json();
      })
      .then((data) => setReport(reportSchema.parse(data)))
      .catch((e) => setError(String(e)));
    const changed = () => setPage(location.hash.slice(1) || "home");
    addEventListener("hashchange", changed);
    return () => removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    const elements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button, input, textarea, select, a[href]",
        ) || [],
      );
    elements()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
      if (e.key === "Tab") {
        const list = elements();
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [selected]);
  async function request(path: string, body?: unknown) {
    const r = await fetch(
      `${backend}${path}`,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    if (!r.ok) throw Error(await r.text());
    return r.json();
  }
  async function connect() {
    try {
      const u = new URL(apiInput);
      if (
        !["127.0.0.1", "localhost"].includes(u.hostname) ||
        u.protocol !== "http:"
      )
        throw Error("Use a loopback HTTP backend");
      const r = await fetch(`${u.origin}/health`);
      if (!r.ok || (await r.json()).status !== "ok")
        throw Error("Backend health check failed");
      setBackend(u.origin);
      setNotice("Local backend connected. Live evaluations are available.");
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function liveRun() {
    if (!report) return;
    setBusy(true);
    setNotice("Executing the local agent…");
    try {
      const job = await request("/runs", { version });
      let completed = false;
      for (let i = 0; i < 60; i++) {
        const status = await request(`/jobs/${job.job_id}`);
        if (status.status === "failed") throw Error(status.error);
        if (status.status === "completed") {
          const run = runSchema.parse(await request(`/runs/${status.run_id}`));
          setLocalRuns((previous) => [
            run,
            ...previous.filter((r) => r.version !== run.version),
          ]);
          setNotice(
            `Live evaluation complete: ${run.results.length} scenarios. Comparison below remains the published snapshot.`,
          );
          completed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!completed)
        throw Error("Polling timed out; the job may still be running.");
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveReview() {
    try {
      if (!selected || !report || !approved)
        throw Error("Review and approve assertions first");
      const scenario = JSON.parse(review);
      const run = localRuns.find((r) => r.id === selectedRunId);
      if (!run)
        throw Error("Execute a local run before reviewing its failures");
      const answer = await request("/reviews", {
        run_id: run.id,
        scenario_id: selected.scenario.id,
        note: "Human reviewed in trace inspector",
        approved,
        scenario,
      });
      setNotice(
        `Saved ${answer.dataset_id}. Run this dataset through the API to verify the new regression test.`,
      );
      setSelected(null);
    } catch (e) {
      setNotice(String(e));
    }
  }
  if (error)
    return (
      <main className="loading">
        <AlertTriangle />
        <h1>Snapshot could not be loaded</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  if (!report)
    return (
      <main className="loading">
        <ShieldCheck />
        <h1>Loading evaluation evidence…</h1>
      </main>
    );
  if (page === "home")
    return (
      <Welcome
        report={report}
        theme={theme}
        toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
    );
  const run =
    (page === "overview" || page === "datasets"
      ? localRuns.find((r) => r.version === version)
      : undefined) || report.runs.find((r) => r.version === version)!;
  const regressions = report.comparison.changes.filter(
    (c) => c.status === "regression",
  );
  const results = run.results
    .filter(
      (r) =>
        (filter === "all" || (filter === "fail" ? !r.passed : r.passed)) &&
        `${r.scenario.title} ${r.scenario.id} ${r.scenario.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "latency"
        ? b.execution.duration_ms - a.execution.duration_ms
        : sort === "outcome"
          ? Number(a.passed) - Number(b.passed)
          : a.scenario.title.localeCompare(b.scenario.title),
    );
  function inspect(r: Result, runId = run.id) {
    setSelectedRunId(runId);
    setSelected(r);
    setReview(
      JSON.stringify(
        { ...r.scenario, id: `reviewed-${r.scenario.id}` },
        null,
        2,
      ),
    );
    setApproved(false);
  }
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="#home">
          <span className="brand-icon">
            <ShieldCheck size={24} />
          </span>
          AgentGuard<span className="beta">LAB</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            Support operations<small>Reference project</small>
          </div>
          <ChevronRight size={16} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {pages.map(([id, label, Icon]) => (
            <a key={id} href={`#${id}`} className={page === id ? "active" : ""}>
              <Icon size={18} />
              {label}
              {id === "comparison" && (
                <span className="count">{regressions.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-label">
            <span className="dot" /> No API key required
          </div>
          <p>
            Real executions.
            <br />
            Reproducible evidence.
          </p>
          <button
            className="theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}Switch to{" "}
            {theme === "dark" ? "light" : "dark"} theme
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Workspace <ChevronRight size={13} />{" "}
            <strong>
              {pages.find((p) => p[0] === page)?.[1] || "Overview"}
            </strong>
          </span>
          <span className="snapshot">
            <span className="dot" />
            {backend ? "Local backend connected" : "Published snapshot"}
          </span>
        </header>
        <main>
          {page === "playground" ? (
            <Playground report={report} />
          ) : (
            <>
              <div className="eyebrow">
                AGENT RELIABILITY / SUPPORT OPERATIONS
              </div>
              <div className="title-row">
                <div>
                  <h1>
                    {page === "comparison"
                      ? "A small change. A visible regression."
                      : page === "datasets"
                        ? "Every expectation, versioned."
                        : page === "reports"
                          ? "Evidence you can reproduce."
                          : "Catch regressions before they ship."}
                  </h1>
                  <p className="subtitle">
                    {page === "overview"
                      ? "Follow the evidence from agent behavior to a failing assertion."
                      : "Deterministic scenarios. Observed tool calls. Transparent results."}
                  </p>
                </div>
                <button
                  onClick={() => download("agentguard-report.json", report)}
                >
                  <Download size={16} />
                  Export report
                </button>
              </div>
              <div className="demo-banner">
                <Activity size={18} />
                <div>
                  <strong>
                    {backend
                      ? "Local execution available"
                      : "Interactive demo · real Python-generated results"}
                  </strong>
                  <span>
                    Synthetic records · Rule-driven LangGraph agent · No model
                    API calls
                  </span>
                </div>
                <a href="#reports">
                  View provenance <ArrowUpRight size={15} />
                </a>
              </div>
              {localRuns.some((r) => r.id === run.id) &&
                (page === "overview" || page === "datasets") && (
                  <div className="notice">
                    Showing a live local {version} execution. Version comparison
                    and provenance retain the published snapshot.
                  </div>
                )}
              {notice && (
                <div role="status" className="notice">
                  {notice}
                </div>
              )}
              {(page === "overview" || page === "comparison") && (
                <>
                  <div className="metrics">
                    <article>
                      <span>Scenario pass rate</span>
                      <strong>{pct(run.metrics.pass_rate)}</strong>
                      <small
                        className={
                          version === "candidate" ? "negative" : "positive"
                        }
                      >
                        {version === "candidate"
                          ? `${regressions.length} regressions in published comparison`
                          : "Baseline reference behavior"}
                      </small>
                    </article>
                    <article>
                      <span>Task completion</span>
                      <strong>{pct(run.metrics.task_completion)}</strong>
                      <small>
                        {run.results.filter((r) => r.passed).length} /{" "}
                        {run.results.length} scenarios pass all checks
                      </small>
                    </article>
                    <article>
                      <span>Tool-call accuracy</span>
                      <strong>{pct(run.metrics.tool_choice)}</strong>
                      <small>Required tools observed in trace</small>
                    </article>
                    <article>
                      <span>Mean tool execution</span>
                      <strong>
                        {run.metrics.latency_ms?.toFixed(3)}
                        <em> ms</em>
                      </strong>
                      <small>
                        Measured locally · tokens & cost unavailable
                      </small>
                    </article>
                  </div>
                  <div className="comparison-grid">
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>Version health</h2>
                          <p>Same dataset. Two implementations.</p>
                        </div>
                        <span className="pill">
                          {run.results.length} scenarios
                        </span>
                      </div>
                      <div className="bars">
                        {report.runs.map((r) => (
                          <div className="bar-row" key={r.id}>
                            <span>
                              <b>
                                {r.version === "baseline" ? "v1.0" : "v1.1"}
                              </b>{" "}
                              {r.version}
                              <small>
                                {r.results.filter((s) => s.passed).length}{" "}
                                passing
                              </small>
                            </span>
                            <div className="track">
                              <div
                                style={{
                                  width: `${(r.metrics.pass_rate || 0) * 100}%`,
                                }}
                                className={r.version}
                              />
                            </div>
                            <strong>{pct(r.metrics.pass_rate)}</strong>
                          </div>
                        ))}
                      </div>
                      <p className="footnote">
                        Pass rates describe this synthetic suite, not general
                        agent reliability.
                      </p>
                    </section>
                    <section className="panel regression-callout">
                      <div className="callout-label">
                        <AlertTriangle size={16} /> REGRESSION GATE FAILED
                      </div>
                      <h2>
                        {regressions.length} scenarios lost correct behavior
                      </h2>
                      <p>
                        The candidate widens the refund window, skips urgent
                        escalation, and selects the wrong ticket tool.
                      </p>
                      <a href="#comparison">
                        Inspect version differences <ArrowUpRight size={16} />
                      </a>
                    </section>
                  </div>
                </>
              )}
              {page === "comparison" && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Published comparison</h2>
                      <p>
                        Baseline → candidate · allowed pass-rate drop:{" "}
                        {pct(report.comparison.threshold)}
                      </p>
                    </div>
                    <span className="pill negative">
                      −{pct(report.comparison.pass_rate_drop)}
                    </span>
                  </div>
                  <div className="changes">
                    {report.comparison.changes.map((c) => (
                      <button
                        key={c.scenario_id}
                        onClick={() => {
                          setVersion("candidate");
                          inspect(
                            report.runs
                              .find((r) => r.version === "candidate")!
                              .results.find(
                                (r) => r.scenario.id === c.scenario_id,
                              )!,
                            report.runs.find((r) => r.version === "candidate")!
                              .id,
                          );
                        }}
                      >
                        <span
                          className={
                            c.status === "regression" ? "negative" : "positive"
                          }
                        >
                          {c.status === "regression" ? (
                            <AlertTriangle size={16} />
                          ) : (
                            <Check size={16} />
                          )}
                        </span>
                        <span>
                          {c.scenario_id}
                          <small>
                            {c.failed_evaluators.join(" · ") ||
                              "No failing assertions"}
                          </small>
                        </span>
                        <span className="pill">
                          {c.status.replaceAll("_", " ")}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {(page === "overview" || page === "datasets") && (
                <section className="panel results">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {page === "datasets"
                          ? "Scenario library"
                          : "Evaluation explorer"}
                      </h2>
                      <p>
                        {report.dataset.id} / version {report.dataset.version}{" "}
                        <span className="separator">·</span>{" "}
                        {run.results.length} synthetic scenarios
                      </p>
                    </div>
                    <div className="segmented">
                      {["baseline", "candidate"].map((v) => (
                        <button
                          key={v}
                          className={version === v ? "selected" : ""}
                          onClick={() => setVersion(v)}
                        >
                          {v === "baseline"
                            ? "v1.0 Baseline"
                            : "v1.1 Candidate"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="toolbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Search scenarios"
                        placeholder="Search scenarios, categories, IDs…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter outcomes"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All outcomes</option>
                      <option value="fail">Failed only</option>
                      <option value="pass">Passed only</option>
                    </select>
                    <select
                      aria-label="Sort scenarios"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="id">Title A?Z</option>
                      <option value="outcome">Failures first</option>
                      <option value="latency">Slowest first</option>
                    </select>
                    <span>{results.length} results</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>SCENARIO</th>
                          <th>CATEGORY</th>
                          <th>OUTCOME</th>
                          <th>TOOL STEPS</th>
                          <th>EXECUTION</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.scenario.id} onClick={() => inspect(r)}>
                            <td>
                              <button
                                className="scenario-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  inspect(r);
                                }}
                              >
                                {r.scenario.title}
                              </button>
                              <small>{r.scenario.id}</small>
                            </td>
                            <td>
                              <span className="category">
                                {r.scenario.category}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`outcome ${r.passed ? "pass" : "fail"}`}
                              >
                                {r.passed ? (
                                  <Check size={13} />
                                ) : (
                                  <X size={13} />
                                )}{" "}
                                {r.passed ? "Passed" : "Failed"}
                              </span>
                            </td>
                            <td className="mono">
                              {r.execution.spans?.length ?? "—"}
                            </td>
                            <td className="mono">
                              {r.execution.duration_ms.toFixed(3)} ms
                            </td>
                            <td>
                              <ChevronRight size={15} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!results.length && (
                      <p className="empty">No scenarios match these filters.</p>
                    )}
                  </div>
                  <div className="table-footer">
                    Assertions are calculated from state changes, tool calls,
                    arguments, and cited evidence.
                    <button
                      className="text-button"
                      onClick={() =>
                        download("support-v1.json", report.dataset)
                      }
                    >
                      Download dataset <Download size={14} />
                    </button>
                  </div>
                </section>
              )}
              {page === "reports" && (
                <div className="report-grid">
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Reproduce this benchmark</h2>
                        <p>
                          Run from the repository root. No credentials required.
                        </p>
                      </div>
                      <Terminal size={20} />
                    </div>
                    <pre>
                      uv sync --frozen --python 3.12{"\n"}uv run python
                      scripts/generate_demo.py{"\n"}uv run pytest
                    </pre>
                    <dl>
                      {Object.entries(report.provenance).map(([k, v]) => (
                        <div key={k}>
                          <dt>{k.replaceAll("_", " ")}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="footnote">
                      Generated{" "}
                      {new Date(report.runs[0].created_at).toLocaleString()}.
                      Outcome assertions are repeatable; run IDs, timestamps,
                      and measured latency vary.
                    </p>
                    <button
                      onClick={() => download("agentguard-report.json", report)}
                    >
                      <Download size={16} />
                      Download full evidence
                    </button>
                  </section>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Local live mode</h2>
                        <p>New evaluations require executable Python.</p>
                      </div>
                    </div>
                    <p>
                      Start the API, then connect from the local frontend.
                      GitHub Pages serves saved results and cannot execute an
                      agent.
                    </p>
                    <pre>
                      uv run uvicorn agentguard.api:create_app --factory
                      --app-dir backend/src --host 127.0.0.1
                    </pre>
                    <label className="field">
                      Backend URL
                      <input
                        value={apiInput}
                        onChange={(e) => setApiInput(e.target.value)}
                      />
                    </label>
                    <button onClick={connect}>Connect local backend</button>
                    {backend && (
                      <div className="live-controls">
                        <label className="field">
                          Agent version
                          <select
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                          >
                            <option>baseline</option>
                            <option>candidate</option>
                          </select>
                        </label>
                        <button onClick={liveRun} disabled={busy}>
                          {busy ? "Running…" : "Run real evaluation"}
                        </button>
                      </div>
                    )}
                    <h3>Metric boundaries</h3>
                    <p>
                      Tokens and cost are unavailable: this reference agent uses
                      local rules and tools. Latency measures the support
                      handler, excluding graph orchestration. The comparison
                      gate uses scenario pass rate; it makes no statistical
                      claim.
                    </p>
                  </section>
                </div>
              )}
              <footer>
                <span>
                  <ShieldCheck size={14} /> AgentGuard · Evidence before
                  deployment.
                </span>
                <span>
                  Dataset v{report.dataset.version} · Schema v1 · No paid APIs
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Trace inspector"
            className="inspector"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inspector-header">
              <div>
                <div className="eyebrow">
                  OBSERVED EXECUTION / {version.toUpperCase()}
                </div>
                <h2>{selected.scenario.title}</h2>
                <code>{selected.scenario.id}</code>
              </div>
              <button
                aria-label="Close trace inspector"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="inspector-body">
              <span className={`outcome ${selected.passed ? "pass" : "fail"}`}>
                {selected.passed ? "Passed" : "Failed"}
              </span>
              <h3>Input</h3>
              <blockquote>{selected.scenario.input}</blockquote>
              {Object.keys(selected.scenario.context).length > 0 && (
                <pre>{JSON.stringify(selected.scenario.context, null, 2)}</pre>
              )}
              <h3>Assertions & observed evidence</h3>
              <div className="assertions">
                {selected.scores.map((s) => (
                  <div key={s.evaluator}>
                    <span
                      className={s.passed === false ? "negative" : "positive"}
                    >
                      {s.passed === false ? (
                        <X size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                    </span>
                    <div>
                      <strong>{s.evaluator.replaceAll("_", " ")}</strong>
                      <p>{s.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="states">
                <div>
                  <h3>Expected state</h3>
                  <pre>
                    {JSON.stringify(selected.scenario.expected_state, null, 2)}
                  </pre>
                </div>
                <div>
                  <h3>Observed state</h3>
                  <pre>{JSON.stringify(selected.execution.state, null, 2)}</pre>
                </div>
              </div>
              <h3>
                Tool trace{" "}
                <span className="pill">
                  {selected.execution.spans?.length ?? 0} steps
                </span>
              </h3>
              <div className="timeline">
                {selected.execution.spans?.map((span, i) => (
                  <article key={span.id}>
                    <span className="step">{i + 1}</span>
                    <div>
                      <strong>{span.tool}</strong>
                      <small>{span.duration_ms.toFixed(3)} ms</small>
                      <pre>
                        {JSON.stringify(
                          { arguments: span.arguments, result: span.result },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </article>
                ))}
                {!selected.execution.spans?.length && (
                  <p>No tool calls were observed.</p>
                )}
              </div>
              <h3>Final response</h3>
              <blockquote>{selected.execution.response}</blockquote>
              <p className="footnote">
                Cited evidence:{" "}
                {selected.execution.evidence.join(", ") || "none"}. Findings
                above are deterministic checks of observed behavior.
              </p>
              {backend &&
                localRuns.some((r) => r.id === selectedRunId) &&
                !selected.passed && (
                  <section className="review">
                    <h3>Failure → reviewed regression test</h3>
                    <p>
                      Review the input, expected state, and assertions. Saving
                      creates a new versioned dataset.
                    </p>
                    <textarea
                      aria-label="Review scenario assertions"
                      rows={14}
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={(e) => setApproved(e.target.checked)}
                      />{" "}
                      I reviewed and approve these expectations.
                    </label>
                    <button onClick={saveReview}>
                      Save approved regression test
                    </button>
                  </section>
                )}
              <button
                onClick={() =>
                  download(`${selected.scenario.id}-trace.json`, selected)
                }
              >
                <Download size={15} />
                Export scenario evidence
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
