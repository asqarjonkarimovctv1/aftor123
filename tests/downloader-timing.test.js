"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

function harness() {
  let now = 1000;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const https = {
    request(options, onResponse) {
      const request = new EventEmitter();
      request.end = () => {};
      request.setTimeout = () => {};
      request.destroy = (error) => {
        request.destroyed = true;
        if (error) { request.emit("error", error); }
      };
      request.respond = () => {
        const response = new EventEmitter();
        response.statusCode = 201;
        response.headers = {};
        response.destroy = () => { response.destroyed = true; };
        onResponse(response);
        return response;
      };
      requests.push(request);
      return request;
    }
  };
  const context = {
    require(name) { return name === "https" ? https : require(name); },
    Buffer,
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { timers.set(++nextTimer, { at: now + delay, callback }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem() { return null; } },
    YT: {}
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "downloader.js"), "utf8"), context);
  const client = new context.YT.Downloader({ logger: { info() {} } });
  return {
    client, requests, timers,
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    }
  };
}

async function run() {
  // DNS/TCP/TLS may never produce a socket timeout; the absolute deadline must still reject.
  for (const trickle of [false, true]) {
    const h = harness();
    const job = {};
    const result = h.client._jsonRequest({}, "{}", job, 2000);
    const rejected = assert.rejects(result, { code: "API_TIMEOUT" });
    const request = h.requests[0];
    let response;
    if (trickle) { response = request.respond(); }
    h.advance(1999);
    assert.ok(job.request);
    if (response) { response.emit("data", Buffer.from("{")); }
    h.advance(1);
    await rejected;
    assert.strictEqual(request.destroyed, true);
    assert.strictEqual(job.request, null);
    assert.strictEqual(job.response, null);
    assert.strictEqual(h.timers.size, 0);
    if (response) { assert.strictEqual(response.destroyed, true); }
  }

  // The audio GET also needs a deadline before a socket or response exists.
  {
    const h = harness();
    const job = {};
    const result = h.client._downloadUrl("https://api.samplecut.app/d/test", "out.mp3", "out.mp3.part", job, {}, 0);
    const rejected = assert.rejects(result, { code: "DOWNLOAD_TIMEOUT" });
    h.advance(120000);
    await rejected;
    assert.strictEqual(h.requests[0].destroyed, true);
    assert.strictEqual(h.timers.size, 0);
  }

  // Success and cancellation must both remove the deadline timer.
  {
    const h = harness();
    const job = {};
    const result = h.client._jsonRequest({}, "{}", job, 2000);
    const response = h.requests[0].respond();
    response.emit("data", Buffer.from('{"ok":true}'));
    response.emit("end");
    assert.strictEqual((await result).body.ok, true);
    assert.strictEqual(h.timers.size, 0);
    h.advance(2000);
    assert.strictEqual(h.requests[0].destroyed, undefined);
  }
  {
    const h = harness();
    const job = {};
    h.client.currentJob = job;
    const result = h.client._jsonRequest({}, "{}", job, 2000);
    const rejected = assert.rejects(result, { code: "CANCELLED" });
    assert.strictEqual(h.client.cancel(), true);
    await rejected;
    assert.strictEqual(h.timers.size, 0);
  }

  // Retry delay and previous attempts count toward the same 120-second budget.
  {
    const h = harness();
    const budgets = [];
    const stages = [];
    h.client._wait = (job, ms) => { h.advance(ms); return Promise.resolve(); };
    h.client._jsonRequest = (options, body, job, remainingMs) => {
      budgets.push(remainingMs);
      h.advance(59000);
      return Promise.resolve({ statusCode: 502, headers: {}, body: { error: { code: "source_unreachable", retryable: true } } });
    };
    await assert.rejects(h.client._createDownload("source", {}, {
      onStage(stage, details) { stages.push([stage, details.attempt]); }
    }, 1), { code: "SOURCE_UNREACHABLE" });
    assert.deepStrictEqual(budgets, [120000, 60000]);
    assert.deepStrictEqual(stages, [["processing", 1], ["retrying", 2]]);
  }

  // A permanent error must never trigger an automatic second conversion request.
  for (const [statusCode, code, retryable] of [[502, "source_unreachable", false], [429, "rate_limited", true], [400, "too_long", false]]) {
    const h = harness();
    let attempts = 0;
    h.client._jsonRequest = () => {
      attempts += 1;
      return Promise.resolve({ statusCode, headers: {}, body: { error: { code, retryable } } });
    };
    await assert.rejects(h.client._createDownload("source", {}, {}, 1), { code: code.toUpperCase() });
    assert.strictEqual(attempts, 1);
  }

  console.log("PASS timing: absolute deadline, stalled connection, trickling response, cancellation, shared retry budget, permanent errors");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
