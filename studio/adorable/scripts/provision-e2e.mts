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
if (!key || !process.env.SUPABASE_URL)
  throw Error(
    "Configure Supabase service role and DATABASE_URL in .env first.",
  );
const username = `e2e_${randomBytes(6).toString("hex")}`,
  email = `${username}@tests.dreamforge.invalid`,
  password = randomBytes(24).toString("base64url");
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
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
const user = await r.json();
const db = await database().connect();
try {
  await db.query("begin");
  await db.query(
    "insert into adorable.profiles(id,username,display_name,auth_email,role) values($1,$2,'E2E Dreamer',$3,'child')",
    [user.id, username, email],
  );
  await db.query(
    "insert into adorable.token_accounts(child_id,token_limit) values($1,1000000)",
    [user.id],
  );
  await fs.writeFile(
    target,
    `E2E_BASE_URL=https://dreamforge.vercel.app\nE2E_LOGIN=${username}\nE2E_PASSWORD=${password}\nE2E_MODEL=glm\n`,
    { mode: 0o600, flag: "wx" },
  );
  await db.query("commit");
  console.log(
    "Created dedicated E2E student with a finite 1M internal token allowance. Credentials saved privately to .env.e2e.local.",
  );
} catch (error) {
  await db.query("rollback");
  await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers,
  });
  throw error;
} finally {
  db.release();
  await database().end();
}
