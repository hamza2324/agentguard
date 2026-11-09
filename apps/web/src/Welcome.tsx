import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Terminal,
  GitCompareArrows,
  Check,
  X,
  Play,
  MessageCircle,
  Sun,
  Moon,
} from "lucide-react";
import type { Report } from "./schema";

export function AskGuide({ report }: { report: Report }) {
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState("");
  function ask(text: string) {
    setQuestion(text);
    const q = text.toLowerCase();
    let response =
      "AgentGuard tests whether an agent behaves correctly after a change. Start with the refund example, inspect its tool evidence, then compare both versions. This guide uses the published report and written product explanations; it is not an LLM chat.";
    if (/cost|paid|api key|free|llm|model/.test(q))
      response =
        "No API key is needed. The reference agent uses LangGraph, local rules and synthetic support tools. Token usage and cost are unavailable because no model is called. This benchmark demonstrates regression testing, not general LLM intelligence.";
    else if (/my agent|own agent|upload|report|deploy/.test(q))
      response =
        "Open Test your agent. Name both versions, define test inputs and expected behavior, then paste execution data or connect approved endpoints through the local backend. Review the assertions and thresholds to generate a report with findings, metrics, evidence and JSON, Markdown or PDF exports. Public imports stay in your browser.";
    else if (/run|live|backend|start|install/.test(q))
      response =
        "The public site explores saved Python-generated results. To execute a fresh request, start the FastAPI backend locally, open the local frontend, and use Try the agent. To reproduce the complete benchmark, run: uv run python scripts/generate_demo.py. The README has the setup commands.";
    else if (/fail|regress|result|why|refund|score/.test(q)) {
      const b = report.runs.find((r) => r.version === "baseline")!,
        c = report.runs.find((r) => r.version === "candidate")!;
      response = `The baseline passes ${b.results.filter((r) => r.passed).length}/${b.results.length}; the candidate passes ${c.results.filter((r) => r.passed).length}/${c.results.length}. The changed agent widens the refund window from 30 to 60 days, skips urgent escalation and uses a policy lookup instead of creating tickets. These changes produce 11 failing scenarios in this synthetic suite. Open Version comparison for the exact assertions.`;
    } else if (/test|workflow|work|how|what|agentguard/.test(q))
      response =
        "The workflow is: define expected behavior → execute the agent → record tools and final state → calculate assertions → compare versions → inspect a new failure. Expected answers stay in the evaluator; the agent never sees them. A human can approve a failed live trace as a new regression test.";
    setAnswer(response);
  }
  return (
    <section className="ask-guide" id="ask">
      <div>
        <span className="landing-kicker">A LITTLE CONTEXT GOES A LONG WAY</span>
        <h2>Questions before you dive in?</h2>
        <p>Ask about the workflow, results, cost, or how to run it yourself.</p>
      </div>
      <div className="ask-box">
        <div className="guide-label">
          <MessageCircle size={17} /> Ask AgentGuard{" "}
          <span>Product guide · no LLM</span>
        </div>
        <div className="suggestions">
          {[
            "What does AgentGuard do?",
            "Why did the candidate fail?",
            "Can I run it for free?",
          ].map((q) => (
            <button key={q} onClick={() => ask(q)}>
              {q}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <input
            aria-label="Ask about AgentGuard"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="How does regression testing work?"
            required
            maxLength={500}
          />
          <button aria-label="Ask the product guide" type="submit">
            <ArrowRight size={18} />
          </button>
        </form>
        {answer && (
          <div role="status" className="guide-answer">
            <p>{answer}</p>
            <a href="#comparison">
              See the evidence <ArrowRight size={13} />
            </a>
          </div>
        )}
        <small>
          Answers cover this demo and its documented workflow. No remote model
          is called.
        </small>
        <a className="guide-own-agent" href="#test-agent">
          Ready to test your own agent? <ArrowRight size={13} />
        </a>
      </div>
    </section>
  );
}

export function Welcome({
  report,
  theme,
  toggleTheme,
}: {
  report: Report;
  theme: string;
  toggleTheme: () => void;
}) {
  const [version, setVersion] = useState<"baseline" | "candidate">("candidate");
  const scenario = report.runs
    .find((r) => r.version === version)!
    .results.find((r) => r.scenario.id === "refund-A102")!;
  const regressions = report.comparison.changes.filter(
    (c) => c.status === "regression",
  ).length;
  return (
    <div className="landing">
      <nav className="landing-nav">
        <a href="#home" className="landing-brand">
          <ShieldCheck />
          AgentGuard<span>OPEN SOURCE</span>
        </a>
        <div className="landing-links">
          <a href="#test-agent">Test your agent</a>
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            How it works
          </a>
          <a href="#playground">Try the agent</a>
          <a href="#overview">
            Results lab <ArrowUpRight size={13} />
          </a>
        </div>
        <div className="landing-nav-actions">
          <button aria-label="Toggle color theme" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <a className="landing-nav-cta" href="#test-agent">
            Test your agent <ArrowRight size={14} />
          </a>
        </div>
      </nav>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="landing-kicker">
              <span className="live-square" /> THE AGENT CHANGED. DID ITS
              BEHAVIOR?
            </span>
            <h1>
              Looks right.
              <br />
              Sounds right.
              <br />
              <span>Still breaks.</span>
            </h1>
            <p>
              Your agent’s next update can quietly break what worked yesterday.
              AgentGuard runs the tests, catches the regression, and shows you
              exactly where things went wrong.
            </p>
            <div className="hero-actions">
              <a className="primary-cta" href="#test-agent">
                <Play size={16} />
                Test your agent
                <ArrowUpRight size={16} />
              </a>
              <a className="secondary-cta" href="#comparison">
                Explore {regressions} real regressions <ArrowRight size={16} />
              </a>
            </div>
            <div className="hero-proof">
              <span>
                <Check size={13} />
                No API keys
              </span>
              <span>
                <Check size={13} />
                Real tool executions
              </span>
              <span>
                <Check size={13} />
                Reproducible results
              </span>
            </div>
          </div>
          <div className="hero-experiment">
            <div className="experiment-top">
              <span>
                <span className="live-square" /> CASE FILE 014
              </span>
              <span>REFUND POLICY / A102</span>
            </div>
            <div className="customer-prompt">
              <span className="avatar">C</span>
              <div>
                <small>CUSTOMER REQUEST</small>
                <p>“Can I get a refund for order A102?”</p>
              </div>
            </div>
            <div className="record-strip">
              <div>
                <small>ORDER AGE</small>
                <b>45 days</b>
              </div>
              <div>
                <small>REFUND POLICY</small>
                <b>30 days</b>
              </div>
              <span className="record-stamp">OUTSIDE WINDOW</span>
            </div>
            <div className="experiment-tabs">
              <button
                className={version === "baseline" ? "chosen" : ""}
                onClick={() => setVersion("baseline")}
              >
                v1.0 · Baseline
              </button>
              <button
                className={version === "candidate" ? "chosen" : ""}
                onClick={() => setVersion("candidate")}
              >
                v1.1 · Changed agent
              </button>
            </div>
            <div
              className={`agent-verdict ${scenario.passed ? "correct" : "broken"}`}
            >
              <span>
                {scenario.passed ? <Check size={21} /> : <X size={21} />}
              </span>
              <div>
                <small>ACTUAL AGENT RESPONSE</small>
                <h3>{scenario.execution.response}</h3>
                <p>
                  {scenario.passed
                    ? "Correct. The order falls outside the retrieved policy."
                    : "Confident answer. Wrong decision. The changed agent permits a 60-day window."}
                </p>
              </div>
            </div>
            <div className="assertion-strip">
              <code>refund_eligible</code>
              <span>
                expected <b>false</b>
              </span>
              <span>
                observed{" "}
                <b className={scenario.passed ? "positive" : "negative"}>
                  {String(scenario.execution.state.refund_eligible)}
                </b>
              </span>
            </div>
            <a className="experiment-evidence" href="#comparison">
              This is an executed test, not a mockup.
              <span>
                Inspect the trace <ArrowUpRight size={14} />
              </span>
            </a>
          </div>
        </section>
        <div className="benchmark-ribbon">
          <span>
            THE INCLUDED
            <br />
            <b>REFERENCE BENCHMARK</b>
          </span>
          <div>
            <strong>
              31<span>/31</span>
            </strong>
            <small>baseline scenarios pass</small>
          </div>
          <div>
            <strong>
              20<span>/31</span>
            </strong>
            <small>changed agent scenarios pass</small>
          </div>
          <div className="ribbon-regression">
            <strong>{regressions}</strong>
            <small>regressions found</small>
          </div>
          <p>
            Calculated by Python against synthetic records.
            <br />
            No model calls. No invented metrics.
          </p>
        </div>
        <section className="story-section" id="how-it-works">
          <div className="story-heading">
            <span className="landing-kicker">
              FROM “IT SEEMS FINE” TO EVIDENCE
            </span>
            <h2>
              A test suite for
              <br />
              what your agent <em>does.</em>
            </h2>
            <p>
              A convincing reply is only one part of the job. The right tools,
              arguments, policies, and state changes matter too.
            </p>
          </div>
          <div className="workflow-steps">
            {[
              [
                "01",
                "Define the contract",
                "Write the expected outcome, required tools, evidence and forbidden actions in a versioned scenario.",
              ],
              [
                "02",
                "Run both versions",
                "The real support agent looks up synthetic orders, retrieves policy and routes support requests.",
              ],
              [
                "03",
                "Find what changed",
                "Independent Python checks score the observed behavior and identify newly failing scenarios.",
              ],
              [
                "04",
                "Keep the failure caught",
                "Inspect the trace. In local mode, approve the expectations and save a new executable regression test.",
              ],
            ].map(([n, title, copy]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="choose-path">
          <div>
            <span className="landing-kicker">PICK YOUR STARTING POINT</span>
            <h2>
              See it fail.
              <br />
              Understand why.
            </h2>
          </div>
          <a href="#playground">
            <Play />
            <span>
              <b>Try the support agent</b>
              <small>
                Explore a saved example, or execute a fresh request with your
                local backend.
              </small>
            </span>
            <ArrowUpRight />
          </a>
          <a href="#overview">
            <GitCompareArrows />
            <span>
              <b>Explore the benchmark</b>
              <small>
                Search all 31 scenarios, inspect assertions, and compare agent
                versions.
              </small>
            </span>
            <ArrowUpRight />
          </a>
        </section>
        <AskGuide report={report} />
        <section className="reproduce-section">
          <div>
            <span className="landing-kicker">YOUR LAPTOP. YOUR EVIDENCE.</span>
            <h2>
              Reproduce the result.
              <br />
              No subscription required.
            </h2>
            <p>
              The core benchmark runs independently of paid LLM APIs. A
              deterministic LangGraph agent does the work; Python checks the
              outcome.
            </p>
            <a
              href="https://github.com/hamza2324/agentguard"
              target="_blank"
              rel="noreferrer"
            >
              Read the source & setup guide <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="landing-terminal">
            <div>
              <Terminal size={15} />
              <span>PowerShell / repository root</span>
            </div>
            <pre>
              <span># Install the locked environment</span>
              {"\n"}uv sync --frozen --python 3.12{"\n\n"}
              <span># Execute both agent versions</span>
              {"\n"}uv run python scripts/generate_demo.py{"\n\n"}
              <span># Verify the regression workflow</span>
              {"\n"}uv run pytest
            </pre>
          </div>
        </section>
        <footer className="landing-footer">
          <a href="#home" className="landing-brand">
            <ShieldCheck />
            AgentGuard
          </a>
          <span>Evidence before deployment.</span>
          <div>
            <a href="#reports">Provenance</a>
            <a href="#playground">Try the agent</a>
            <a href="https://github.com/hamza2324/agentguard">
              GitHub <ArrowUpRight size={12} />
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
