import assert from "node:assert/strict";
import { test } from "node:test";
import { groupProjectSpending } from "../lib/project-spending";
const row = {
  vm_id: "vm-a",
  project_name: "Game",
  model: "z-ai/glm-5.3-flash",
  used_tokens: "150",
  input_tokens: "100",
  output_tokens: "50",
  credit_cost_micros: "81",
  estimated_credit_micros: "0",
  legacy_runs: "0",
};
test("project spend combines models without mixing historical estimates into actual charges", () => {
  const result = groupProjectSpending([
    row,
    {
      ...row,
      model: "anthropic/claude-sonnet-5.5",
      credit_cost_micros: "1418",
    },
    {
      ...row,
      model: "retired-model",
      credit_cost_micros: "0",
      estimated_credit_micros: "50000",
      legacy_runs: "1",
    },
    { ...row, vm_id: "vm-b" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].models.length, 3);
  assert.equal(result[0].used_tokens, "450");
  assert.equal(result[0].credit_cost_micros, "1499");
  assert.equal(result[0].estimated_credit_micros, "50000");
  assert.equal(result[1].credit_cost_micros, "81");
});
test("projects without settled usage remain visible with zero spend", () => {
  const result = groupProjectSpending([
    {
      ...row,
      model: "",
      used_tokens: "0",
      input_tokens: "0",
      output_tokens: "0",
      credit_cost_micros: "0",
    },
  ]);
  assert.equal(result[0].credit_cost_micros, "0");
  assert.deepEqual(result[0].models, []);
  assert.deepEqual(groupProjectSpending([]), []);
});
