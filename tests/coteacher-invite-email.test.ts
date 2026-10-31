import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coTeacherInviteEmail,
  validEmail,
} from "../lib/coteacher-invite-email";
import { EmailNotConfiguredError, sendEmail } from "../lib/email";
test("co-teacher invite email escapes names and carries the link", () => {
  const mail = coTeacherInviteEmail({
    inviterName: '<b>Ms "Tan"</b>',
    className: "Class <script>",
    link: "https://example.test/classrooms/invite/abc",
  });
  assert.ok(!mail.html.includes("<script>") && !mail.html.includes("<b>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.text.includes("https://example.test/classrooms/invite/abc"));
});
test("email addresses are validated conservatively", () => {
  assert.ok(validEmail("a.teacher@school.edu"));
  for (const bad of ["", "no-at", "a@b", "a b@c.d", "a@b.c,d@e.f", 5, null])
    assert.ok(!validEmail(bad), String(bad));
});
test("sendEmail refuses without configuration and posts when configured", async () => {
  const saved = [process.env.RESEND_API_KEY, process.env.EMAIL_FROM];
  const message = { to: "a@b.co", subject: "s", html: "h", text: "t" };
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    await assert.rejects(sendEmail(message), EmailNotConfiguredError);
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "DreamForge <hi@example.test>";
    let sent: any;
    await sendEmail(message, async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({});
    });
    assert.deepEqual(sent.to, ["a@b.co"]);
    await assert.rejects(
      sendEmail(message, async () => new Response("no", { status: 500 })),
    );
  } finally {
    if (saved[0] === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved[0];
    if (saved[1] === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = saved[1];
  }
});
