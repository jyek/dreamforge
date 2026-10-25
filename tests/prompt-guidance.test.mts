import assert from "node:assert/strict";
import "dotenv/config";
import { database } from "../lib/database";
import { guidanceSQL } from "../lib/prompt-guidance";
const fixtures = [
  {
    content: "fix it",
    categories: [],
    decision: "allow",
    expected: ["not_specific"],
  },
  {
    content: "Make the button blue",
    categories: [],
    decision: "allow",
    expected: [],
  },
  {
    content: "This is fucking broken",
    categories: [],
    decision: "allow",
    expected: ["bad_language"],
  },
  {
    content: "make it better",
    categories: ["bullying"],
    decision: "block",
    expected: ["bullying", "not_specific"],
  },
  {
    content: "Hello",
    categories: [],
    decision: "block",
    expected: ["other_safety"],
  },
];
for (const fixture of fixtures) {
  const { rows } = await database().query(
    `select ${guidanceSQL} as guidance from (select $1::text as content,$2::text[] as categories,$3::text as decision) r`,
    [fixture.content, fixture.categories, fixture.decision],
  );
  assert.deepEqual(rows[0].guidance.sort(), fixture.expected.sort());
}
console.log(
  "Guidance SQL checks passed: coaching, specific prompts, language and safety categories.",
);
await database().end();
