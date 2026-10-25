import test from "node:test";
import assert from "node:assert/strict";
import {
  paymentKeyMatchesMode,
  paymentEventMatchesMode,
} from "../lib/payment-mode";
test("sandbox rejects live credentials and events", () => {
  assert.ok(paymentKeyMatchesMode("sk_test_fixture", "sandbox"));
  assert.equal(paymentKeyMatchesMode("sk_live_fixture", "sandbox"), false);
  assert.ok(
    paymentEventMatchesMode(
      { livemode: false, data: { object: { livemode: false } } },
      "sandbox",
    ),
  );
  assert.equal(
    paymentEventMatchesMode(
      { livemode: true, data: { object: { livemode: true } } },
      "sandbox",
    ),
    false,
  );
  assert.equal(
    paymentEventMatchesMode(
      { livemode: false, data: { object: { livemode: true } } },
      "sandbox",
    ),
    false,
  );
});
test("missing mode cannot credit tokens", () => {
  assert.equal(
    paymentEventMatchesMode({ data: { object: {} } }, "sandbox"),
    false,
  );
  assert.ok(
    paymentEventMatchesMode(
      { livemode: true, data: { object: { livemode: true } } },
      "live",
    ),
  );
});
