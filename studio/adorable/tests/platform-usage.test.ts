import assert from "node:assert/strict";
import test from "node:test";
import { usageReservationBound } from "../lib/platform-usage";
test("Vision reservations do not miscount large base64 payloads as prompt text", () => {
  const small = [
    {
      role: "user",
      content: [
        { type: "text", text: "Build this" },
        { type: "image", image: "data:image/png;base64,abc" },
      ],
    },
  ];
  const large = [
    {
      role: "user",
      content: [
        { type: "text", text: "Build this" },
        {
          type: "image",
          image: "data:image/png;base64," + "A".repeat(2000000),
        },
      ],
    },
  ];
  assert.equal(
    usageReservationBound(small, "system", 4096),
    usageReservationBound(large, "system", 4096),
  );
  assert.ok(usageReservationBound(large, "system", 4096) < 100000);
  const textOnly = [
    { role: "user", content: [{ type: "text", text: "Build this" }] },
  ];
  assert.ok(
    usageReservationBound(large, "system", 4096) >
      usageReservationBound(textOnly, "system", 4096),
  );
});
