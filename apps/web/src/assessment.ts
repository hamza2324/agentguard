import { z } from "zod";
import Ajv from "ajv";
import { scenarioSchema } from "./schema";

const record = z.record(z.string(), z.unknown());
const nonnegative = z.number().finite().nonnegative();
const callSchema = z.object({
  tool: z.string(),
  arguments: record,
  result: record.default({}),
  id: z.string().nullable().optional(),
  duration_ms: nonnegative.nullable().optional(),
});
export const observationSchema = z
  .object({
    response: z.string(),
    state: record,
    evidence: z.array(z.string()).default([]),
    spans: z.array(callSchema).nullable().default(null),
    duration_ms: nonnegative.nullable().default(null),
    tokens: z.number().int().nonnegative().nullable().default(null),
    error: z.string().nullable().optional(),
  })
  .strict();
export const optionsSchema = z
  .object({
    max_pass_rate_drop: z.number().min(0).max(1).default(0),
    max_latency_increase_pct: nonnegative.default(20),
    max_token_increase_pct: nonnegative.default(20),
    max_cost_increase_pct: nonnegative.default(20),
    usd_per_million_tokens: nonnegative.nullable().default(null),
    pricing_source: z.string().default(""),
  })
  .refine(
    (o) =>
      o.usd_per_million_tokens === null || o.pricing_source.trim().length > 0,
    "Provide a pricing source when estimating cost",
  );
export const assessmentSchema = z
  .object({
    schema_version: z.literal("1").default("1"),
    agent_name: z.string().min(1).max(120),
    baseline_version: z.string().min(1).max(80),
    candidate_version: z.string().min(1).max(80),
    cases: z
      .array(
        z.object({
          scenario: scenarioSchema,
          baseline: observationSchema,
          candidate: observationSchema,
        }),
      )
      .min(1)
      .max(100),
    options: optionsSchema.default(optionsSchema.parse({})),
  })
  .superRefine((value, ctx) => {
    const ids = value.cases.map((c) => c.scenario.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Scenario IDs must be unique" });
    value.cases.forEach((c, i) => {
      const s = c.scenario;
      if (
        !Object.keys(s.expected_state).length &&
        !s.required_tools.length &&
        !s.forbidden_tools.length &&
        !s.evidence.length &&
        !s.output_schema &&
        !s.required_response.length
      )
        ctx.addIssue({
          code: "custom",
          path: ["cases", i],
          message: "Add at least one reviewed assertion",
        });
    });
  });
export type Assessment = z.infer<typeof assessmentSchema>;
type Scenario = Assessment["cases"][number]["scenario"];
type Observation = z.infer<typeof observationSchema>;
type Score = { evaluator: string; passed: boolean | null; reason: string };
const average = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(
        (k) => Object.hasOwn(right, k) && equal(left[k], right[k]),
      )
    );
  }
  return false;
};
function safeSchema(value: unknown, depth = 0) {
  if (depth > 30) throw Error("Output schema is too deeply nested");
  if (Array.isArray(value)) {
    value.forEach((v) => safeSchema(v, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("$ref" in obj && !String(obj.$ref).startsWith("#"))
      throw Error("External JSON Schema references are not allowed");
    for (const v of Object.values(obj)) safeSchema(v, depth + 1);
  }
}
function scoreScenario(s: Scenario, e: Observation): Score[] {
  const scores: Score[] = [];
  const add = (evaluator: string, passed: boolean | null, reason: string) =>
    scores.push({ evaluator, passed, reason });
  if (e.error) add("execution", false, e.error);
  const wrong = Object.fromEntries(
    Object.entries(s.expected_state).filter(
      ([k, v]) => !Object.hasOwn(e.state, k) || !equal(e.state[k], v),
    ),
  );
  add(
    "task_completion",
    !Object.keys(wrong).length,
    `Expected state differences: ${JSON.stringify(wrong)}`,
  );
  if (s.required_response.length) {
    const missing = s.required_response.filter(
      (phrase) => !e.response.includes(phrase),
    );
    add(
      "response_requirements",
      !missing.length,
      `Missing required response text: ${JSON.stringify(missing)}`,
    );
  }
  if (e.spans === null) {
    for (const name of ["tool_choice", "tool_arguments", "forbidden_actions"])
      add(name, null, "Agent did not supply tool traces");
  } else {
    const missing = s.required_tools
      .filter((a) => !e.spans!.some((c) => c.tool === a.tool))
      .map((a) => a.tool);
    add(
      "tool_choice",
      !missing.length,
      `Missing required tools: ${JSON.stringify(missing)}`,
    );
    const unmatched = s.required_tools.filter(
      (a) =>
        !e.spans!.some(
          (c) =>
            c.tool === a.tool &&
            Object.entries(a.arguments).every(
              ([k, v]) =>
                Object.hasOwn(c.arguments, k) && equal(c.arguments[k], v),
            ),
        ),
    );
    add(
      "tool_arguments",
      !unmatched.length,
      `Unmatched argument expectations: ${JSON.stringify(unmatched)}`,
    );
    const forbidden = e.spans
      .filter((c) => s.forbidden_tools.includes(c.tool))
      .map((c) => c.tool);
    add(
      "forbidden_actions",
      !forbidden.length,
      `Forbidden calls: ${JSON.stringify(forbidden)}`,
    );
  }
  const missing = s.evidence.filter((v) => !e.evidence.includes(v));
  add(
    "required_evidence",
    !missing.length,
    `Missing evidence: ${JSON.stringify(missing)}`,
  );
  if (s.output_schema) {
    safeSchema(s.output_schema);
    const schema = s.output_schema;
    const dialect = schema.$schema;
    if (
      dialect &&
      dialect !== "http://json-schema.org/draft-07/schema#" &&
      dialect !== "https://json-schema.org/draft-07/schema#"
    )
      throw Error("User assessments support JSON Schema draft-07");
    const ajv = new Ajv({
      strict: false,
      allErrors: true,
      validateFormats: false,
    });
    const validate = ajv.compile({
      ...schema,
      $schema: "http://json-schema.org/draft-07/schema#",
    });
    const valid = Boolean(validate(e.state));
    add(
      "output_schema",
      valid,
      valid ? "State matches JSON schema" : ajv.errorsText(validate.errors),
    );
  }
  return scores;
}
export function assess(input: unknown, mode = "imported evidence / browser") {
  const request = assessmentSchema.parse(input);
  const cases = request.cases.map((c) => {
    const pair = (version: "baseline" | "candidate") => {
      const scores = scoreScenario(c.scenario, c[version]);
      return {
        execution: c[version],
        scores,
        passed: scores.every((s) => s.passed !== false),
      };
    };
    const baseline = pair("baseline"),
      candidate = pair("candidate");
    const status =
      baseline.passed && !candidate.passed
        ? "regression"
        : !baseline.passed && candidate.passed
          ? "resolved"
          : candidate.passed
            ? "unchanged_pass"
            : "unchanged_failure";
    return { scenario: c.scenario, baseline, candidate, status };
  });
  const summarize = (version: "baseline" | "candidate") => {
    const values = cases.map((c) => c[version]);
    const metrics: Record<string, number | null> = {
      pass_rate: average(values.map((v) => Number(v.passed))),
    };
    for (const name of new Set(
      values.flatMap((v) => v.scores.map((s) => s.evaluator)),
    )) {
      const available = values.flatMap((v) =>
        v.scores
          .filter((s) => s.evaluator === name && s.passed !== null)
          .map((s) => Number(s.passed)),
      );
      metrics[name] = available.length ? average(available) : null;
    }
    const durations = values.map((v) => v.execution.duration_ms),
      tokens = values.map((v) => v.execution.tokens);
    metrics.latency_ms = durations.every((v) => v !== null)
      ? average(durations as number[])
      : null;
    metrics.tokens = tokens.every((v) => v !== null)
      ? (tokens as number[]).reduce((a, b) => a + b, 0)
      : null;
    metrics.estimated_cost_usd =
      metrics.tokens !== null && request.options.usd_per_million_tokens !== null
        ? (metrics.tokens / 1e6) * request.options.usd_per_million_tokens
        : null;
    return {
      metrics,
      passed: values.filter((v) => v.passed).length,
      total: values.length,
      unavailable_checks: values
        .flatMap((v) => v.scores)
        .filter((s) => s.passed === null).length,
      latency_coverage: durations.filter((v) => v !== null).length,
      token_coverage: tokens.filter((v) => v !== null).length,
    };
  };
  const baseline = summarize("baseline"),
    candidate = summarize("candidate");
  const performance = [
    ["latency_ms", request.options.max_latency_increase_pct],
    ["tokens", request.options.max_token_increase_pct],
    ["estimated_cost_usd", request.options.max_cost_increase_pct],
  ].map(([key, threshold]) => {
    const metric = String(key),
      limit = Number(threshold),
      before = baseline.metrics[metric],
      after = candidate.metrics[metric],
      delta = before !== null && after !== null ? after - before : null,
      increase = delta !== null && before! > 0 ? (delta / before!) * 100 : null;
    return {
      metric,
      baseline: before,
      candidate: after,
      delta,
      increase_pct: increase,
      threshold_pct: limit,
      breached:
        increase !== null
          ? increase > limit
          : delta !== null && before === 0 && delta > 0,
    };
  });
  const drop = baseline.metrics.pass_rate! - candidate.metrics.pass_rate!,
    regressions = cases.filter((c) => c.status === "regression").length;
  const gate_failed =
    drop > request.options.max_pass_rate_drop ||
    performance.some((p) => p.breached);
  return {
    schema_version: "1",
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    mode,
    agent_name: request.agent_name,
    baseline_version: request.baseline_version,
    candidate_version: request.candidate_version,
    options: request.options,
    baseline,
    candidate,
    pass_rate_drop: drop,
    regressions,
    resolved: cases.filter((c) => c.status === "resolved").length,
    gate_failed,
    verdict: gate_failed
      ? "regressions_detected"
      : regressions ||
          cases.some((c) => !c.candidate.passed) ||
          baseline.unavailable_checks ||
          candidate.unavailable_checks
        ? "review_required"
        : "no_regressions_observed",
    performance,
    cases,
    limitations: [
      "Results apply only to the supplied scenarios; this is not a deployment certification.",
      "Imported observations, timings and token usage are supplied by the user, not independently verified.",
      "Missing trace checks remain unavailable. Grounding checks reference IDs, not semantic factuality.",
      "Cost is a flat-rate estimate only when token usage and a documented blended token price are supplied.",
      "No LLM judge, statistical significance test, or repeated stochastic evaluation was performed.",
    ],
  };
}
export type AssessmentReport = ReturnType<typeof assess>;
export function markdownReport(r: AssessmentReport) {
  const format = (v: number | null) =>
    v === null ? "Unavailable" : String(Number(v.toFixed(6)));
  return `# AgentGuard assessment: ${r.agent_name}\n\n${r.baseline_version} → ${r.candidate_version}\n\nGenerated: ${r.created_at}\nMode: ${r.mode}\nVerdict: ${r.verdict.replaceAll("_", " ")}\n\n## Summary\n\n- Baseline: ${r.baseline.passed}/${r.baseline.total}\n- Candidate: ${r.candidate.passed}/${r.candidate.total}\n- New failures: ${r.regressions}\n- Resolved failures: ${r.resolved}\n- Gate failed: ${r.gate_failed}\n\n## Metrics\n\n| Metric | Baseline | Candidate |\n| --- | ---: | ---: |\n${Array.from(
    new Set([
      ...Object.keys(r.baseline.metrics),
      ...Object.keys(r.candidate.metrics),
    ]),
  )
    .map(
      (k) =>
        `| ${k} | ${format(r.baseline.metrics[k] ?? null)} | ${format(r.candidate.metrics[k] ?? null)} |`,
    )
    .join(
      "\n",
    )}\n\n## Scenario findings\n\n${r.cases.map((c) => `### ${c.scenario.title} (${c.scenario.id})\n\nStatus: ${c.status}\nInput: ${c.scenario.input}\n\n${c.candidate.scores.map((s) => `- ${s.evaluator}: ${s.passed === null ? "unavailable" : s.passed ? "pass" : "FAIL"} — ${s.reason}`).join("\n")}\n\nExpected state: ${JSON.stringify(c.scenario.expected_state)}\nObserved state: ${JSON.stringify(c.candidate.execution.state)}\n`).join("\n")}\n## Thresholds\n\nPass-rate drop allowed: ${r.options.max_pass_rate_drop * 100} percentage points\n${r.performance.map((p) => `${p.metric}: allowed increase ${p.threshold_pct}%; actual increase ${format(p.increase_pct)}%; breached: ${p.breached}`).join("\n")}\n\nPricing source: ${r.options.pricing_source || "Not supplied"}\n\n## Limitations\n\n${r.limitations.map((v) => "- " + v).join("\n")}\n`;
}
