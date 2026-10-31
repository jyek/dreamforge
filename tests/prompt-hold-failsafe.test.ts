import { test } from "node:test";
import assert from "node:assert/strict";
import { SafetyError } from "../lib/kids-safety";
import {
  consumeApprovedHold,
  recordModerationOutcome,
} from "../lib/prompt-hold";
const missingColumn = {
  query: async () => {
    throw Object.assign(new Error("column hold_status does not exist"), {
      code: "42703",
    });
  },
};
test("chat keeps working when the hold columns are not in the database yet", async () => {
  const log = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const held = await recordModerationOutcome(
      missingColumn,
      "id",
      "child",
      new SafetyError("x", "blocked", {
        decision: "review",
        categories: ["violence"],
        severity: "medium",
      }),
    );
    assert.equal(held, false);
    assert.equal(
      await consumeApprovedHold(missingColumn, {
        childId: "c",
        conversationId: "v",
        content: "hi",
      }),
      false,
    );
    assert.deepEqual(logged[0], ["prompt_hold.unavailable", { code: "42703" }]);
  } finally {
    console.error = log;
  }
});
