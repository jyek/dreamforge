import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { terminalInputQueue, type TerminalInput } from "../lib/terminal-input";

test("slow network coalesces queued typing instead of making one request per keystroke", async () => {
  const sent: TerminalInput[] = [];
  let release!: () => void;
  let started!: () => void;
  let completed!: () => void;
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  const secondSent = new Promise<void>((resolve) => { completed = resolve; });
  const queue = terminalInputQueue(async (input) => {
    sent.push(input);
    if (sent.length === 1) {
      await new Promise<void>((resolve) => { release = resolve; started(); });
    } else completed();
  }, (error) => { throw error; }, 0);
  try {
    queue.write("p");
    await firstStarted;
    for (const character of "rintf 'hello'\r") queue.write(character);
    queue.resize(80, 24);
    queue.resize(100, 30);
    assert.equal(sent.length, 1);
    release();
    await secondSent;
    assert.deepEqual(sent, [
      { data: "p" },
      { data: "rintf 'hello'\r", cols: 100, rows: 30 },
    ]);
    assert.equal(sent.map((input) => input.data || "").join(""), "printf 'hello'\r");
  } finally { queue.dispose(); }
});

test("an ambiguous failed write is never replayed or followed by a partial queued command", async () => {
  const sent: TerminalInput[] = [];
  let fail!: () => void;
  let started!: () => void;
  let reported!: () => void;
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  const errorReported = new Promise<void>((resolve) => { reported = resolve; });
  const queue = terminalInputQueue(async (input) => {
    sent.push(input);
    await new Promise<void>((_resolve, reject) => {
      fail = () => reject(Error("Response lost after input was accepted")); started();
    });
  }, () => reported(), 0);
  queue.write("echo hello");
  await firstStarted;
  queue.write("\r");
  fail();
  await errorReported;
  queue.write("another command\r");
  await setImmediate();
  assert.deepEqual(sent, [{ data: "echo hello" }]);
  queue.dispose();
});

test("closing a terminal cancels unsent typing and resize work", async () => {
  const sent: TerminalInput[] = [];
  const queue = terminalInputQueue(async (input) => { sent.push(input); }, assert.fail, 1000);
  queue.write("unsent");
  queue.resize(80, 24);
  queue.dispose();
  await setImmediate();
  assert.deepEqual(sent, []);
});
