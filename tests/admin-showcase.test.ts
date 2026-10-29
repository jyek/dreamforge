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
  demo = "vm-admindemo",
  copy = "vm-admincopy";
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
    let copied = false;
    await assert.rejects(
      () =>
        changeShowcase(id, "feature", original, undefined, async () => {
          copied = true;
          return copy;
        }),
      /Administrator/,
    );
    assert.equal(copied, false);
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
test("show/hide is reversible; private projects use separate copies and never expose their chats or lose edit ownership", async () => {
  await changeShowcase(admin, "feature", demo);
  assert.equal(
    (await pool.query("select is_example from projects where vm_id=$1", [demo]))
      .rows[0].is_example,
    true,
  );
  await changeShowcase(admin, "hide", demo);
  assert.equal(
    (await pool.query("select is_example from projects where vm_id=$1", [demo]))
      .rows[0].is_example,
    false,
  );
  let copies = 0;
  const create = async (source: string, actor: string) => {
    copies++;
    assert.equal(source, original);
    assert.equal(actor, admin);
    await pool.query(
      "insert into projects(vm_id,metadata,is_example) values($1,$2,false)",
      [
        copy,
        JSON.stringify({
          name: "Private game",
          showcaseSourceId: source,
          showcaseCopiedAt: new Date().toISOString(),
        }),
      ],
    );
    return copy;
  };
  await changeShowcase(admin, "feature", original, undefined, create);
  const source = (
    await pool.query(
      "select owner_id,is_example from projects where vm_id=$1",
      [original],
    )
  ).rows[0];
  assert.equal(source.owner_id, child);
  assert.equal(source.is_example, false);
  const data = await loadAdminProjects(admin);
  const row = data.find((x) => x.id === original)!;
  assert.equal(row.exampleId, copy);
  assert.equal(row.featured, true);
  assert.equal(
    data.some((x) => x.id === copy),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(data),
    /private learner chat|private-conversation/,
  );
  await changeShowcase(admin, "hide", original, undefined, create);
  await changeShowcase(admin, "feature", original, undefined, create);
  assert.equal(copies, 1);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from conversations where vm_id=$1",
        [original],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from conversations where vm_id=$1",
        [copy],
      )
    ).rows[0].n,
    0,
  );
});
test("ordering validates the whole current showcase and writes an audit trail without private content", async () => {
  await changeShowcase(admin, "feature", demo);
  const ids = (
    await pool.query("select vm_id from projects where is_example")
  ).rows.map((r) => r.vm_id);
  await assert.rejects(
    () => changeShowcase(admin, "reorder", undefined, [copy, copy]),
    /exactly once/,
  );
  await assert.rejects(
    () => changeShowcase(admin, "reorder", undefined, []),
    /showcase changed/,
  );
  const wanted = [copy, ...ids.filter((id) => id !== copy)];
  await changeShowcase(admin, "reorder", undefined, wanted);
  const order = (
    await pool.query(
      "select vm_id from projects where is_example order by (metadata->>'exampleOrder')::int",
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
test("a showcased copy can still be managed after its original project is deleted", async () => {
  await pool.query("delete from projects where vm_id=$1", [original]);
  const data = await loadAdminProjects(admin);
  assert.equal(data.find((x) => x.id === copy)?.featured, true);
  await changeShowcase(admin, "hide", copy);
  assert.equal(
    (await pool.query("select is_example from projects where vm_id=$1", [copy]))
      .rows[0].is_example,
    false,
  );
});
