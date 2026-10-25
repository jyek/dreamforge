import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProjectReadiness } from "../lib/project-readiness";
test("warm probe and lease run concurrently with no VM repair", async () => {
  let leaseStarted = false,
    repairs = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ready = await checkProjectReadiness({
    capturing: async () => false,
    recordActivity: async () => {
      leaseStarted = true;
      await gate;
    },
    probe: async () => {
      assert(leaseStarted);
      release();
      return true;
    },
    repair: async () => {
      repairs++;
    },
  });
  assert.equal(ready, true);
  assert.equal(repairs, 0);
});
test("snapshots prevent readiness side effects and are rechecked before recovery", async () => {
  let effects = 0;
  assert.equal(
    await checkProjectReadiness({
      capturing: async () => true,
      recordActivity: async () => {
        effects++;
      },
      probe: async () => {
        effects++;
        return true;
      },
      repair: async () => {
        effects++;
      },
    }),
    false,
  );
  assert.equal(effects, 0);
  let checks = 0;
  assert.equal(
    await checkProjectReadiness({
      capturing: async () => ++checks > 1,
      recordActivity: async () => {},
      probe: async () => false,
      repair: async () => {
        effects++;
      },
    }),
    false,
  );
  assert.equal(effects, 0);
});
test("failed probe repairs once and asks the browser to recheck readiness", async () => {
  let repairs = 0;
  assert.equal(
    await checkProjectReadiness({
      capturing: async () => false,
      recordActivity: async () => {},
      probe: async () => false,
      repair: async () => {
        repairs++;
      },
    }),
    false,
  );
  assert.equal(repairs, 1);
});
test("successful recovery returns ready in the same request", async () => {
  let probes = 0;
  assert.equal(
    await checkProjectReadiness({
      capturing: async () => false,
      recordActivity: async () => {},
      probe: async () => ++probes > 1,
      repair: async () => {},
    }),
    true,
  );
  assert.equal(probes, 2);
});
test("a snapshot starting during recovery blocks the final probe", async () => {
  let capturing = false,
    probes = 0;
  assert.equal(
    await checkProjectReadiness({
      capturing: async () => capturing,
      recordActivity: async () => {},
      probe: async () => {
        probes++;
        return false;
      },
      repair: async () => {
        capturing = true;
      },
    }),
    false,
  );
  assert.equal(probes, 1);
});
