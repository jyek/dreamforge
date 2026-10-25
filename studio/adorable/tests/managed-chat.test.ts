import { test } from "node:test";
import assert from "node:assert/strict";
import { managedChat } from "../lib/managed-chat";
const projectId = "vm-test",
  conversationId = "00000000-0000-4000-8000-000000000001";
const keys = [
  "DREAMFORGE_AUTH_ENABLED",
  "STUDENT_LOGIN_ENABLED",
  "SAFETY_ENABLED",
  "STUDENT_AI_PROVIDER_APPROVED",
  "STUDENT_MODERATION_URL",
  "STUDENT_MODERATION_KEY",
] as const;
for (const mode of ["platform", "classroom", "protected-demo"] as const)
  test(`${mode}: direct chat HTTP requests cannot relax child policy`, async () => {
    const saved = keys.map((k) => process.env[k]);
    let calls = 0;
    const handler = async () => {
      calls++;
      return Response.json({ ok: true });
    };
    const request = (extra: object = {}) =>
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: {
          origin: "https://app.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          conversationId,
          revision: 0,
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Build a counter" }],
            },
          ],
          safetyEnabled: false,
          policy: { images: true, shell: true },
          ...extra,
        }),
      });
    const services = {
      authorize: async () => true,
      identity: async () => true,
    };
    try {
      process.env.DREAMFORGE_AUTH_ENABLED =
        mode === "platform" ? "true" : "false";
      process.env.STUDENT_LOGIN_ENABLED =
        mode === "protected-demo" ? "false" : "true";
      process.env.SAFETY_ENABLED = mode === "protected-demo" ? "true" : "false";
      delete process.env.STUDENT_AI_PROVIDER_APPROVED;
      delete process.env.STUDENT_MODERATION_URL;
      delete process.env.STUDENT_MODERATION_KEY;
      assert.equal(
        (await managedChat(request(), handler, services)).status,
        403,
      );
      process.env.STUDENT_AI_PROVIDER_APPROVED = "true";
      assert.equal(
        (await managedChat(request(), handler, services)).status,
        403,
      );
      process.env.STUDENT_MODERATION_URL = "https://moderation.test";
      process.env.STUDENT_MODERATION_KEY = "fixture";
      assert.equal(
        (
          await managedChat(
            request({
              messages: [
                {
                  role: "user",
                  parts: [{ type: "file", url: "data:image/png;base64,AA==" }],
                },
              ],
            }),
            handler,
            services,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await managedChat(request(), handler, {
            ...services,
            identity: async () => false,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await managedChat(request(), handler, {
            ...services,
            authorize: async () => false,
          })
        ).status,
        404,
      );
      const cross = request();
      cross.headers.set("origin", "https://hostile.test");
      assert.equal((await managedChat(cross, handler, services)).status, 403);
      assert.equal(calls, 0);
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      });
    }
  });

test("protected anonymous demo cannot create, enumerate or open student projects through direct APIs", async () => {
  const saved = keys.map((k) => process.env[k]);
  try {
    process.env.DREAMFORGE_AUTH_ENABLED = "false";
    process.env.STUDENT_LOGIN_ENABLED = "false";
    process.env.SAFETY_ENABLED = "true";
    const { GET, POST } = await import("../app/api/projects/route");
    const list = await GET(new Request("https://app.test/api/projects"));
    assert.equal(list.status, 401);
    assert.deepEqual((await list.json()).projects, []);
    const create = await POST(
      new Request("https://app.test/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Unfunded project",
          policy: { enabled: false },
        }),
      }),
    );
    assert.equal(create.status, 401);
    const { authorizeProject } = await import("../lib/project-access");
    assert.equal(await authorizeProject("vm-fixture", true), null);
  } finally {
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});
