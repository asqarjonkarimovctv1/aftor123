"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

function harness(installed = true) {
  const children = [], selected = [], timers = new Map();
  let nextTimer = 0;
  const context = {
    require(name) {
      if (name === "fs") return { existsSync() { return installed; } };
      if (name === "child_process") return { spawn(binary, args, options) {
        assert.strictEqual(options.shell, false);
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
        child.sent = [];
        child.stdin.write = line => child.sent.push(JSON.parse(line));
        child.stdin.end = () => { child.ended = true; };
        child.kill = () => { child.killed = true; };
        children.push(child);
        return child;
      } };
      return require(name);
    },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    document: { createElement() { return { set href(value) { const u = new URL(value); for (const key of ["protocol", "hostname", "pathname", "search", "username", "password", "port"]) this[key] = u[key]; } }; } }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["utils.js", "browser.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
  const bridge = new context.YT.BrowserBridge({ extensionPath: "C:\\extension", onSelect(url) { selected.push(url); } });
  return { bridge, children, selected, timers };
}

async function run() {
  const h = harness();
  const pending = h.bridge.open();
  assert.strictEqual(h.bridge.open(), pending, "repeated clicks reuse one browser process");
  const child = h.children[0];
  child.stdout.emit("data", Buffer.from('{"type":"rea'));
  child.stdout.emit("data", Buffer.from('dy"}\n'));
  await pending;
  assert.strictEqual(h.timers.size, 0);
  const send = url => child.stdout.emit("data", Buffer.from(JSON.stringify({ type: "selected", url }) + "\n"));
  send("https://evil.example/watch?v=jNQXAC9IVRw");
  send("file:///C:/secret");
  send("https://www.youtube.com/results?search_query=music");
  assert.strictEqual(h.selected.length, 0);
  send("https://youtu.be/jNQXAC9IVRw?t=3");
  assert.deepStrictEqual(h.selected, ["https://www.youtube.com/watch?v=jNQXAC9IVRw"]);
  await h.bridge.open();
  assert.strictEqual(child.sent[0].type, "show");
  assert.strictEqual(h.children.length, 1);
  h.bridge.dispose();
  assert.strictEqual(child.ended, true);
  child.emit("close", 0);
  assert.strictEqual(h.bridge.child, null);

  for (const code of ["BROWSER_RUNTIME_MISSING", "BROWSER_START_FAILED"]) {
    const failed = harness();
    const opening = failed.bridge.open();
    const rejected = assert.rejects(opening, { code });
    failed.children[0].stdout.emit("data", Buffer.from(JSON.stringify({ type: "error", code }) + "\n"));
    await rejected;
    assert.strictEqual(failed.bridge.child, null);
    assert.strictEqual(failed.children[0].killed, true);
    assert.strictEqual(failed.timers.size, 0);
  }
  const missing = harness(false);
  await assert.rejects(missing.bridge.open(), { code: "BROWSER_NOT_INSTALLED" });
  const stalled = harness();
  const timeout = assert.rejects(stalled.bridge.open(), { code: "BROWSER_START_FAILED" });
  for (const callback of stalled.timers.values()) callback();
  await timeout;
  assert.strictEqual(stalled.bridge.child, null);
  console.log("PASS browser bridge: single process, chunked IPC, validated video handoff, reuse, shutdown, missing runtime, startup deadline");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
