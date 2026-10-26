import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import { database } from "../lib/database";
dotenv.config({ path: ".deployment/production.env", quiet: true });
const db = database();
try {
  const { rows } = await db.query("select to_regclass('profiles') as existing");
  if (!rows[0].existing)
    throw Error(
      "Apply the tracked Supabase migrations before setting up DreamForge accounts.",
    );
  if (process.argv.includes("--invite")) {
    const token = randomBytes(24).toString("base64url");
    await db.query("insert into teacher_invites(token_hash) values($1)", [
      createHash("sha256").update(token).digest("hex"),
    ]);
    writeFileSync(
      ".deployment/initial-teacher-invite.json",
      JSON.stringify({ token, expires: "7 days" }),
      { mode: 0o600 },
    );
  }
  const summary = await db.query(
    "select count(*)::int as examples from projects where is_example",
  );
  console.log(
    "Classroom schema ready; separate examples:",
    summary.rows[0].examples,
  );
} finally {
  await db.end();
}
