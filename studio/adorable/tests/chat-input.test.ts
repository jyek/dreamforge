import { test } from "node:test";
import assert from "node:assert/strict";
import { convertToModelMessages, type UIMessage } from "ai";
import { demoChatInput, withoutImageData } from "../lib/chat-input";
import { createModelRouting } from "../lib/model-routing";
const image = {
  type: "file" as const,
  mediaType: "image/png",
  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  filename: "reference.png",
};
const message = (text: string): UIMessage => ({
  id: "test",
  role: "user",
  parts: [{ type: "text", text }, image],
});
test("long text plus image is counted separately and reaches the model as an image", async () => {
  const latest = message("a".repeat(5000));
  const input = demoChatInput(latest, "deepseek");
  assert.equal(input.prompt.length, 5000);
  assert.equal(input.images[0].url, image.url);
  const converted = await convertToModelMessages([latest]);
  const content = converted[0].content;
  assert.ok(Array.isArray(content));
  assert.ok(
    content.some((p) => p.type === "file" && p.mediaType === "image/png"),
  );
  assert.ok(!JSON.stringify(withoutImageData(latest)).includes("iVBOR"));
  assert.ok(
    JSON.stringify(withoutImageData(latest)).includes(
      "[Attached reference image]",
    ),
  );
});
test("image-only requests work; unsupported models and oversize text fail clearly", () => {
  const only = { id: "i", role: "user" as const, parts: [image] };
  assert.ok(demoChatInput(only, "glm").prompt);
  for (const choice of ["auto", "free", "qwen"] as const)
    assert.throws(
      () => demoChatInput(message("short"), choice),
      /Choose DeepSeek/,
    );
  assert.throws(
    () => demoChatInput(message("a".repeat(32001)), "deepseek"),
    /32,000/,
  );
  assert.throws(
    () =>
      demoChatInput(
        { ...only, parts: [{ ...image, url: "https://example.test/a.png" }] },
        "deepseek",
      ),
    /PNG/,
  );
  assert.throws(
    () =>
      demoChatInput(
        {
          ...only,
          parts: [
            { ...image, url: "data:image/png;base64," + "A".repeat(3_000_000) },
          ],
        },
        "deepseek",
      ),
    /2 MB/,
  );
});
test("vision routing preserves image payload and explicit model selection", async () => {
  let body: any;
  const routing = createModelRouting("deepseek", "test", {
    request: async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return new Response("{}");
    },
  });
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Describe this" },
        { type: "image_url", image_url: { url: image.url } },
      ],
    },
  ];
  await routing.fetch("https://example.test", {
    body: JSON.stringify({ model: "untrusted", messages }),
  });
  assert.equal(body.model, "deepseek/deepseek-v4.1-flash");
  assert.equal(body.messages[0].content[1].image_url.url, image.url);
});
