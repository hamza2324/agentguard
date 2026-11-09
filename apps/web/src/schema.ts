import { z } from "zod";
const record = z.record(z.string(), z.unknown());
export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  input: z.string(),
  context: record,
  expected_state: record,
  required_tools: z.array(z.object({ tool: z.string(), arguments: record })),
  forbidden_tools: z.array(z.string()),
  evidence: z.array(z.string()),
  output_schema: record.nullable().optional(),
  tags: z.array(z.string()),
});
const score = z.object({
  evaluator: z.string(),
  passed: z.boolean().nullable(),
  reason: z.string(),
});
const execution = z.object({
  error: z.string().nullable().optional(),
  response: z.string(),
  state: record,
  evidence: z.array(z.string()),
  duration_ms: z.number(),
  tokens: z.number().nullable(),
  cost: z.number().nullable(),
  spans: z
    .array(
      z.object({
        id: z.string(),
        tool: z.string(),
        arguments: record,
        result: record,
        duration_ms: z.number(),
      }),
    )
    .nullable(),
});
export const resultSchema = z.object({
  scenario: scenarioSchema,
  execution,
  scores: z.array(score),
  passed: z.boolean(),
});
export const runSchema = z.object({
  schema_version: z.literal("1"),
  id: z.string(),
  version: z.enum(["baseline", "candidate"]),
  dataset_id: z.string(),
  dataset_version: z.number(),
  dataset_hash: z.string(),
  created_at: z.string(),
  results: z.array(resultSchema),
  metrics: z.record(z.string(), z.number().nullable()),
});
export const reportSchema = z.object({
  schema_version: z.literal("1"),
  mode: z.string(),
  provenance: z.object({
    python: z.string(),
    platform: z.string(),
    commit: z.string(),
    command: z.string(),
    agent: z.string(),
    dataset_hash: z.string(),
  }),
  dataset: z.object({
    id: z.string(),
    version: z.number(),
    scenarios: z.array(scenarioSchema),
  }),
  runs: z.array(runSchema).length(2),
  comparison: z.object({
    baseline_id: z.string(),
    candidate_id: z.string(),
    pass_rate_drop: z.number(),
    threshold: z.number(),
    gate_failed: z.boolean(),
    warning: z.string(),
    changes: z.array(
      z.object({
        scenario_id: z.string(),
        status: z.string(),
        failed_evaluators: z.array(z.string()),
      }),
    ),
  }),
});
export type Report = z.infer<typeof reportSchema>;
export type Result = z.infer<typeof resultSchema>;
