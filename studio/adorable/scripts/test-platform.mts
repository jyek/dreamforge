import fs from "node:fs";
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { database } from "../lib/database";
import { settleUsage, reserveUsage } from "../lib/platform-usage";
dotenv.config({ path: ".deployment/platform.env", quiet: true });
const db = database(),
  base = "http://localhost:3030",
  tag = randomBytes(4).toString("hex"),
  password = randomBytes(16).toString("hex");
const accounts: any[] = [];
const projects: string[] = [];
const classes: string[] = [];
const invites: string[] = [];
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
async function call(
  path: string,
  body?: unknown,
  cookie?: string,
  method?: string,
) {
  const r = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function teacher(n: string) {
  const token = randomBytes(24).toString("hex");
  invites.push(hash(token));
  await db.query(
    "insert into adorable.teacher_invites(token_hash) values($1)",
    [hash(token)],
  );
  const result = await call("/api/platform/auth", {
    action: "signup",
    teacherInvite: token,
    username: `test_${tag}_${n}`,
    name: "Test Teacher",
    email: `test_${tag}_${n}@dreamforge.invalid`,
    password,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const user = (await call("/api/platform/auth", undefined, result.cookie)).body
    .user;
  accounts.push(user);
  return { user, cookie: result.cookie, token };
}
try {
  const a = await teacher("ta"),
    b = await teacher("tb");
  const again = await call("/api/platform/auth", {
    action: "signup",
    teacherInvite: a.token,
    username: `test_${tag}_bad`,
    name: "Bad",
    email: `test_${tag}_bad@dreamforge.invalid`,
    password,
  });
  assert.equal(again.status, 400);
  const ca = (
    await call("/api/platform/classes", { name: "Test class A" }, a.cookie)
  ).body.class;
  classes.push(ca.id);
  const cb = (
    await call("/api/platform/classes", { name: "Test class B" }, b.cookie)
  ).body.class;
  classes.push(cb.id);
  const sign = await call("/api/platform/auth", {
    action: "signup",
    classCode: ca.invite_code,
    role: "teacher",
    username: `test_${tag}_child`,
    name: "Test Builder",
    password,
  });
  assert.equal(sign.status, 200, JSON.stringify(sign.body));
  const child = (await call("/api/platform/auth", undefined, sign.cookie)).body
    .user;
  accounts.push(child);
  assert.equal(child.role, "child");
  const id = "vm-" + randomBytes(16).toString("hex"),
    conversation = randomUUID();
  projects.push(id);
  const metadata = {
    version: 3,
    name: "Test isolation project",
    createdAt: new Date().toISOString(),
    prodVmId: null,
    previewDomain: "test.invalid",
    productionDomain: "test.invalid",
    conversations: [
      {
        id: conversation,
        title: "Test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    releases: [],
    liveReleaseId: null,
  };
  await db.query(
    "insert into adorable.projects(vm_id,metadata,owner_id) values($1,$2,$3)",
    [id, JSON.stringify(metadata), child.id],
  );
  await db.query(
    "insert into adorable.conversations(vm_id,id,messages) values($1,$2,$3)",
    [id, conversation, "[]"],
  );
  await db.query(
    "insert into adorable.prompt_reviews(vm_id,child_id,conversation_id,content,decision,categories,severity) values($1,$2,$3,'Test prompt','allow','{}','low')",
    [id, child.id, conversation],
  );
  assert.equal(
    (await call("/api/platform/dashboard", undefined, a.cookie)).body.projects
      .length,
    1,
  );
  assert.equal(
    (await call("/api/platform/dashboard", undefined, b.cookie)).body.projects
      .length,
    0,
  );
  assert.ok(
    [403, 404].includes(
      (
        await call(
          `/api/projects/${id}/conversations/${conversation}`,
          undefined,
          b.cookie,
        )
      ).status,
    ),
  );
  assert.equal(
    (
      await call(
        `/api/projects/${id}/conversations/${conversation}`,
        undefined,
        a.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `/api/projects/${id}`,
        { name: "No teacher editing" },
        a.cookie,
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/api/projects/${id}`,
        { name: "Child renamed" },
        sign.cookie,
        "PATCH",
      )
    ).status,
    200,
  );
  const ra = (await call("/api/platform/reviews", undefined, a.cookie)).body
    .reviews;
  assert.equal(ra.length, 1);
  assert.equal(
    (await call("/api/platform/reviews", undefined, b.cookie)).body.reviews
      .length,
    0,
  );
  assert.equal(
    (await call("/api/platform/reviews", { id: ra[0].id }, b.cookie)).body.ok,
    false,
  );
  assert.equal(
    (await call("/api/platform/reviews", { id: ra[0].id }, a.cookie)).body.ok,
    true,
  );
  assert.equal(
    (
      await call(
        "/api/platform/classes",
        { action: "inviteTeacher" },
        sign.cookie,
      )
    ).status,
    400,
  );
  const login = await call("/api/platform/auth", {
    login: child.username,
    password,
  });
  assert.equal(login.status, 200);
  const reserve = await Promise.allSettled([
    reserveUsage(child.id, id, 70000),
    reserveUsage(child.id, id, 70000),
  ]);
  assert.equal(reserve.filter((r) => r.status === "fulfilled").length, 1);
  const run = (
    reserve.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<string>
  ).value;
  await settleUsage(run, 2000, 1000, "qwen/qwen3-coder-30b-a3b-instruct");
  await settleUsage(run, 2000, 1000, "qwen/qwen3-coder-30b-a3b-instruct");
  const balance = (
    await db.query("select * from adorable.token_accounts where child_id=$1", [
      child.id,
    ])
  ).rows[0];
  assert.equal(Number(balance.used_tokens), 3000);
  assert.equal(Number(balance.reserved_tokens), 0);
  const topup = await call("/api/platform/topups", {}, sign.cookie);
  assert.equal(topup.status, 200);
  assert.ok(topup.body.link.includes("/pay/"));
  const blocked = await call("/api/platform/checkout", {
    token: new URL(topup.body.link).pathname.split("/").pop(),
    package: "spark",
  });
  assert.equal(blocked.status, 503);
  assert.equal(
    (await call("/api/platform/classes", { code: cb.invite_code }, sign.cookie))
      .status,
    200,
  );
  assert.equal(
    (await call("/api/platform/dashboard", undefined, b.cookie)).body.projects
      .length,
    1,
  );
  if (process.argv.includes("--keep"))
    fs.writeFileSync(
      ".deployment/test-platform-session.json",
      JSON.stringify({
        teacher: a.cookie,
        child: sign.cookie,
        childId: child.id,
        password,
        tag,
      }),
      { mode: 0o600 },
    );
  console.log(
    "PASS: username signup/login, no email verification, single-use teacher invites, role protection, class joins, scoped teacher reviews, child ownership, concurrent quota reservation, idempotent settlement, disabled checkout.",
  );
  // Retain test accounts temporarily for browser visual checks; cleanup script consumes manifest.
  fs.writeFileSync(
    ".deployment/platform-test-cleanup.json",
    JSON.stringify({ accounts, projects, classes, invites }),
    { mode: 0o600 },
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
  fs.writeFileSync(
    ".deployment/platform-test-cleanup.json",
    JSON.stringify({ accounts, projects, classes, invites }),
    { mode: 0o600 },
  );
} finally {
  if (!process.argv.includes("--keep")) {
    for (const id of projects) {
      await db.query("delete from adorable.prompt_reviews where vm_id=$1", [
        id,
      ]);
      await db.query("delete from adorable.usage_runs where vm_id=$1", [id]);
      await db.query("delete from adorable.projects where vm_id=$1", [id]);
    }
    for (const id of classes)
      await db.query("delete from adorable.classes where id=$1", [id]);
    for (const user of accounts) {
      await db.query("delete from adorable.topup_requests where child_id=$1", [
        user.id,
      ]);
      await db.query("delete from adorable.token_accounts where child_id=$1", [
        user.id,
      ]);
      await db.query(
        "delete from adorable.teacher_invites where used_by=$1 or created_by=$1",
        [user.id],
      );
      await fetch(
        process.env.SUPABASE_URL + "/auth/v1/admin/users/" + user.id,
        {
          method: "DELETE",
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
          },
        },
      );
    }
    for (const hash of invites)
      await db.query(
        "delete from adorable.teacher_invites where token_hash=$1",
        [hash],
      );
  }
  await db.end();
}
