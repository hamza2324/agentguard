import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { assess } from "../src/assessment";
import { reportSchema } from "../src/schema";

test("browser evaluator matches Python reference outcomes across all 31 scenarios", () => {
  const report = reportSchema.parse(
    JSON.parse(readFileSync("public/data/report.json", "utf-8")),
  );
  const observed = (
    e: (typeof report.runs)[number]["results"][number]["execution"],
  ) => ({
    response: e.response,
    state: e.state,
    evidence: e.evidence,
    spans: e.spans,
    duration_ms: e.duration_ms,
    tokens: e.tokens,
    error: e.error,
  });
  const baseline = report.runs.find((r) => r.version === "baseline")!,
    candidate = report.runs.find((r) => r.version === "candidate")!;
  const result = assess({
    agent_name: "Parity test",
    baseline_version: "baseline",
    candidate_version: "candidate",
    cases: baseline.results.map((b, i) => ({
      scenario: b.scenario,
      baseline: observed(b.execution),
      candidate: observed(candidate.results[i].execution),
    })),
  });
  expect(result.regressions).toBe(11);
  expect(result.baseline.passed).toBe(31);
  expect(result.candidate.passed).toBe(20);
  result.cases.forEach((c, i) => {
    expect(c.candidate.scores.map((s) => [s.evaluator, s.passed])).toEqual(
      candidate.results[i].scores.map((s) => [s.evaluator, s.passed]),
    );
  });
  expect(result.candidate.metrics.tokens).toBeNull();
  expect(result.candidate.metrics.estimated_cost_usd).toBeNull();
});

test("guides a new user through expectations, evidence and a downloadable report", async ({
  page,
}) => {
  await page.goto("/#test-agent");
  await expect(
    page.getByRole("heading", { name: "Test your agent. Know what changed." }),
  ).toBeVisible();
  await page.getByLabel("Agent name", { exact: true }).fill("My own assistant");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Test title", { exact: true })
    .fill("Order lookup contract");
  await page
    .getByLabel("Input sent to your agent", { exact: true })
    .fill("Where is A100?");
  await page
    .getByLabel("Expected final state (JSON)", { exact: false })
    .fill('{"status":"delivered"}');
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const base = {
    response: "Delivered",
    state: { status: "delivered" },
    spans: [
      {
        tool: "lookup_order",
        arguments: { order_id: "A100" },
        result: { status: "delivered" },
      },
    ],
    evidence: [],
    duration_ms: 100,
    tokens: 100,
  };
  const candidate = {
    ...base,
    response: "Shipped",
    state: { status: "shipped" },
    duration_ms: 150,
    tokens: 120,
  };
  await page
    .getByLabel("Baseline execution JSON", { exact: false })
    .fill(JSON.stringify(base));
  await page
    .getByLabel("Candidate execution JSON", { exact: false })
    .fill(JSON.stringify(candidate));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Generate regression report" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Generate regression report" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Regression gate failed", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#assessment-report")).toContainText(
    "Expected state differences",
  );
  await expect(page.locator("#assessment-report")).toContainText(
    "Estimated cost (USD)",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "agentguard-regression-report.md",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.CAPTURE_SCREENSHOTS)
    await page.screenshot({
      path: `../../assets/screenshots/user-report-${test.info().project.name}.png`,
      fullPage: true,
    });
});

test("rejects missing assertions and malformed execution JSON with helpful errors", async ({
  page,
}) => {
  await page.goto("/#test-agent");
  await page.getByLabel("Agent name", { exact: true }).fill("A real agent");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Input sent to your agent").fill("Hello");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("reviewed assertion");
  await page
    .getByLabel("Required response text", { exact: false })
    .fill("Hello");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Baseline execution JSON", { exact: false })
    .fill("{broken");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("executes a user suite against real HTTP baseline and candidate endpoints", async ({
  page,
}) => {
  await page.goto("/#test-agent");
  await page.getByLabel("Agent name", { exact: true }).fill("My HTTP agent");
  await page
    .getByRole("button", { name: /Connect my agent endpoints/ })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Input sent to your agent").fill("Refund A102");
  await page
    .getByLabel("Expected final state (JSON)", { exact: false })
    .fill('{"refund_eligible":false}');
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Baseline endpoint URL")
    .fill("http://127.0.0.1:9000/baseline");
  await page
    .getByLabel("Candidate endpoint URL")
    .fill("http://127.0.0.1:9000/candidate");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Generate regression report" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Regression gate failed", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#assessment-report")).toContainText(
    "fresh HTTP execution",
  );
  await expect(page.locator("#assessment-report")).toContainText(
    "1 newly failing scenarios",
  );
});
