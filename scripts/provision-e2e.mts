import "dotenv/config";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { database } from "../lib/database";
const target = ".env.e2e.local";
if (await fs.stat(target).catch(() => null))
  throw Error(
    ".env.e2e.local already exists. Reuse the existing test account.",
  );
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.DATABASE_URL)
  throw Error(
    "Configure the target DATABASE_URL before provisioning a dedicated test account.",
  );
const origin = new URL(
  process.env.E2E_BASE_URL || "https://dreamforge2.vercel.app",
).origin;
const username = `e2e_${randomBytes(6).toString("hex")}`,
  email = `${username}@tests.dreamforge.invalid`,
  password = randomBytes(24).toString("base64url");
const headers = {
  apikey: key || "",
  Authorization: `Bearer ${key || ""}`,
  "Content-Type": "application/json",
};
let user: { id: string };
if (key && process.env.SUPABASE_URL) {
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: "dreamforge-prompting-e2e" },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error(`Could not provision test account: HTTP ${r.status}`);
  user = await r.json();
} else {
  // Production keeps its sensitive service key in Vercel. Use normal signup rather than exporting it.
  const r = await fetch(origin + "/api/platform/auth", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "signup",
      username,
      password,
      name: "E2E Dreamer",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error(`Dedicated test signup failed: HTTP ${r.status}`);
  const { rows } = await database().query(
    "select id from profiles where username=$1 and role='child'",
    [username],
  );
  if (!rows[0])
    throw Error("The configured database does not match the signup target.");
  user = rows[0];
}
const db = await database().connect();
try {
  await db.query("begin");
  if (key)
    await db.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,$2,'E2E Dreamer',$3,'child')",
      [user.id, username, email],
    );
  await db.query(
    "insert into token_accounts(child_id) values($1) on conflict(child_id) do nothing",
    [user.id],
  );
  await fs.writeFile(
    target,
    `E2E_BASE_URL=${origin}\nE2E_LOGIN=${username}\nE2E_PASSWORD=${password}\nE2E_MODEL=glm\n`,
    { mode: 0o600, flag: "wx" },
  );
  await db.query("commit");
  console.log(
    "Created dedicated E2E student with a finite 1M internal token allowance. Credentials saved privately to .env.e2e.local.",
  );
} catch (error) {
  await db.query("rollback");
  if (key)
    await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers,
    });
  throw error;
} finally {
  db.release();
  await database().end();
}
