// @suite database
import assert from "node:assert/strict";
import { test, after, before } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { authorizeAdminRequest, isPlatformAdmin } from "../lib/admin-auth";
import { loadAdminProjects, changeShowcase } from "../lib/admin-showcase";
import type { Profile } from "../lib/platform-auth";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
const admin = "00000000-0000-4000-8000-000000000301",
  teacher = "00000000-0000-4000-8000-000000000302",
  child = "00000000-0000-4000-8000-000000000303";
const original = "vm-adminprivate",
  demo = "vm-admindemo";
const profile = (id: string): Profile => ({
  id,
  role: id === child ? "child" : "teacher",
  username: "fixture",
  display_name: "Fixture",
});
after(() => pool.end());
before(async () => {
  for (const [id, username, role] of [
    [admin, "site_admin_fixture", "teacher"],
    [teacher, "ordinary_teacher_fixture", "teacher"],
    [child, "ordinary_child_fixture", "child"],
  ]) {
    await pool.query("insert into auth.users(id) values($1)", [id]);
    await pool.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,$2,$2,$3,$4)",
      [id, username, username + "@tests.invalid", role],
    );
  }
  await pool.query("insert into platform_admins(profile_id) values($1)", [
    admin,
  ]);
  await pool.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,$3)",
    [
      original,
      child,
      JSON.stringify({
        name: "Private game",
        conversations: [{ id: "private-conversation" }],
      }),
    ],
  );
  await pool.query(
    "insert into conversations(vm_id,id,messages) values($1,$2,$3)",
    [
      original,
      "00000000-0000-4000-8000-000000000304",
      JSON.stringify([
        {
          role: "user",
          parts: [{ type: "text", text: "private learner chat" }],
        },
      ]),
    ],
  );
  await pool.query(
    "insert into projects(vm_id,metadata,is_example) values($1,$2,false)",
    [demo, JSON.stringify({ name: "Demo game" })],
  );
});
test("only explicit server-owned admin membership grants access; anonymous, students and ordinary teachers are denied", async () => {
  assert.equal(await isPlatformAdmin(admin), true);
  assert.equal(await isPlatformAdmin(teacher), false);
  assert.equal(await isPlatformAdmin(child), false);
  for (const id of [teacher, child]) {
    assert.equal(
      (
        await authorizeAdminRequest(
          new Request("https://fixture.invalid/api/admin/showcase"),
          async () => profile(id),
        )
      ).response?.status,
      403,
    );
    await assert.rejects(() => loadAdminProjects(id), /Administrator/);
    await assert.rejects(
      () => changeShowcase(id, "feature", original),
      /Administrator/,
    );
  }
  assert.equal(
    (
      await authorizeAdminRequest(
        new Request("https://fixture.invalid/api/admin/showcase"),
        async () => null,
      )
    ).response?.status,
    401,
  );
});
test("admin writes require a same-origin JSON request even for a real administrator", async () => {
  for (const origin of [undefined, "https://attacker.invalid"]) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (origin) headers.Origin = origin;
    assert.equal(
      (
        await authorizeAdminRequest(
          new Request("https://fixture.invalid/api/admin/showcase", {
            method: "POST",
            headers,
          }),
          async () => profile(admin),
        )
      ).response?.status,
      403,
    );
  }
  const allowed = await authorizeAdminRequest(
    new Request("https://fixture.invalid/api/admin/showcase", {
      method: "POST",
      headers: {
        Origin: "https://fixture.invalid",
        "Content-Type": "application/json",
      },
    }),
    async () => profile(admin),
  );
  assert.equal(allowed.user?.id, admin);
  assert.equal(
    (
      await authorizeAdminRequest(
        new Request("https://fixture.invalid/api/admin/showcase", {
          method: "POST",
          headers: { Origin: "https://fixture.invalid" },
        }),
        async () => profile(admin),
      )
    ).response?.status,
    415,
  );
});
test("browser roles cannot read or grant admin permissions or alter audit records", async () => {
  for (const role of ["anon", "authenticated"]) {
    const c = await pool.connect();
    try {
      await c.query("set role " + role);
      for (const sql of [
        "select * from dreamforge.platform_admins",
        `insert into dreamforge.platform_admins(profile_id) values('${child}')`,
        "select * from dreamforge.admin_audit_log",
        "insert into dreamforge.admin_audit_log(action) values('forged')",
      ]) {
        await assert.rejects(() => c.query(sql), /permission denied/);
      }
    } finally {
      await c.query("reset role");
      c.release();
    }
  }
});
test("personal projects are publicly tagged without copying, changing ownership or exposing chat", async () => {
  const { isPubliclyShowcased } = await import("../lib/public-showcase");
  await changeShowcase(admin, "feature", demo);
  assert.equal(await isPubliclyShowcased(demo), true);
  await changeShowcase(admin, "hide", demo);
  assert.equal(await isPubliclyShowcased(demo), false);
  const before = (
    await pool.query(
      "select count(*)::int as n from projects where vm_id=$1 or metadata->>'showcaseSourceId'=$1",
      [original],
    )
  ).rows[0].n;
  await changeShowcase(admin, "feature", original);
  const source = (
    await pool.query(
      "select owner_id,is_example,is_showcased from projects where vm_id=$1",
      [original],
    )
  ).rows[0];
  assert.equal(source.owner_id, child);
  assert.equal(source.is_example, false);
  assert.equal(source.is_showcased, true);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from projects where vm_id=$1 or metadata->>'showcaseSourceId'=$1",
        [original],
      )
    ).rows[0].n,
    before,
  );
  const row = (await loadAdminProjects(admin)).find((x) => x.id === original)!;
  assert.equal(row.exampleId, original);
  assert.equal(row.featured, true);
  assert.doesNotMatch(
    JSON.stringify(row),
    /private learner chat|private-conversation/,
  );
  await changeShowcase(admin, "hide", original);
  assert.equal(await isPubliclyShowcased(original), false);
  const messages = (
    await pool.query("select messages from conversations where vm_id=$1", [
      original,
    ])
  ).rows[0].messages;
  assert.match(JSON.stringify(messages), /private learner chat/);
  await changeShowcase(admin, "feature", original);
});
test("ordering validates the whole current showcase and writes an audit trail without private content", async () => {
  await changeShowcase(admin, "feature", demo);
  const ids = (
    await pool.query("select vm_id from projects where is_showcased")
  ).rows.map((r) => r.vm_id);
  await assert.rejects(
    () => changeShowcase(admin, "reorder", undefined, [original, original]),
    /exactly once/,
  );
  await assert.rejects(
    () => changeShowcase(admin, "reorder", undefined, []),
    /showcase changed/,
  );
  const wanted = [original, ...ids.filter((id) => id !== original)];
  await changeShowcase(admin, "reorder", undefined, wanted);
  const order = (
    await pool.query(
      "select vm_id from projects where is_showcased order by (metadata->>'exampleOrder')::int",
    )
  ).rows.map((r) => r.vm_id);
  assert.deepEqual(order, wanted);
  const audit = (
    await pool.query(
      "select action,details from admin_audit_log where actor_id=$1",
      [admin],
    )
  ).rows;
  assert(audit.some((r) => r.action === "showcase.reordered"));
  assert.doesNotMatch(JSON.stringify(audit), /private learner chat/);
});
test("hiding a public project revokes public HTML and asset access immediately", async () => {
  const { GET: entry } =
    await import("../app/showcase/[projectId]/[[...path]]/route");
  const { GET: asset } =
    await import("../app/api/projects/[projectId]/preview-assets/[capability]/[...path]/route");
  const { assetCapability, validAssetCapability } =
    await import("../lib/preview-access");
  const old = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "admin-fixture-signing";
  try {
    const capability = assetCapability(original, "showcase");
    assert.equal(validAssetCapability(original, capability), true);
    await changeShowcase(admin, "hide", original);
    assert.equal(
      (
        await entry(
          new Request("https://fixture.invalid/showcase/" + original),
          { params: Promise.resolve({ projectId: original }) },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await asset(new Request("https://fixture.invalid/asset"), {
          params: Promise.resolve({
            projectId: original,
            capability,
            path: ["_next", "static", "app.js"],
          }),
        })
      ).status,
      403,
    );
  } finally {
    if (old === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = old;
  }
});
