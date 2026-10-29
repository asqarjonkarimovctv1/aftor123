"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  let now = 1000;
  let nextTimer = 0;
  const timers = new Map();
  const nodes = {};
  const infos = [];
  const download = deferred();
  const importing = deferred();
  const placing = deferred();
  let callbacks, initialize;
  function element() {
    return {
      textContent: "", value: "", style: {}, attributes: {}, handlers: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(key, callback) { this.handlers[key] = callback; },
      appendChild() {}, focus() {}
    };
  }
  const context = {
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay, repeat: false }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, delay) { timers.set(++nextTimer, { callback, delay, repeat: true }); return nextTimer; },
    clearInterval(id) { timers.delete(id); },
    addEventListener() {},
    document: {
      getElementById(id) {
        if (!nodes[id]) { nodes[id] = element(); nodes[id].parentNode = element(); }
        return nodes[id];
      },
      addEventListener(event, callback) { initialize = callback; }
    },
    SystemPath: { EXTENSION: "extension" },
    CSInterface: function () { this.getSystemPath = () => "C:\\extension"; },
    YT: {
      Logger: { initialize() {}, info(message) { infos.push(message); }, error() {} },
      Storage: { getSettings() { return {}; }, getHistory() { return []; }, addHistory() {}, getLegacyPaths() { return []; } },
      BrowserBridge: function () { this.open = () => Promise.resolve(); this.dispose = () => {}; },
      Downloader: function () {
        this.checkEnvironment = this.cleanupStalePartials = this.setDestination = () => {};
        this.download = (url, handlers) => {
          callbacks = handlers;
          handlers.onStage("preparing");
          handlers.onStage("processing", { attempt: 1, maxAttempts: 3 });
          return download.promise;
        };
        this.cancel = () => {
          download.reject(Object.assign(new Error("cancelled"), { code: "CANCELLED" }));
          return true;
        };
      },
      ProjectLibrary: function () {
        this.basePath = "C:\\Users\\Test\\Downloads\\YT Timeline";
        this.context = () => ({ key: "a".repeat(64), projectPath: "C:\\Projects\\Test.prproj", projectName: "Test", destinationPath: this.basePath + "\\Test" });
        this.ensureDestination = () => {};
      },
      PremiereBridge: function () {
        this.getStatus = () => Promise.resolve({});
        this.getProjectInfo = () => Promise.resolve({ projectPath: "C:\\Projects\\Test.prproj" });
        this.getActiveSequenceInfo = () => Promise.resolve({ sequenceId: "test" });
        this.importAudioFile = () => importing.promise;
        this.addAudioToTimeline = () => placing.promise;
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["utils.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
  }
  // Validation is covered separately; this harness exercises the workflow's live UI.
  context.YT.Utils.validateYouTubeUrl = () => ({ valid: true, url: "test-source" });
  initialize();
  return {
    nodes, timers, infos, download, importing, placing,
    get callbacks() { return callbacks; },
    tick(seconds) {
      now += seconds * 1000;
      for (const [id, timer] of Array.from(timers)) {
        if (!timer.repeat) { timers.delete(id); }
        timer.callback();
      }
    }
  };
}

async function flush() { for (let i = 0; i < 12; i += 1) { await Promise.resolve(); } }

async function run() {
  const h = harness();
  await flush();
  h.nodes.downloadButton.handlers.click();
  await flush();
  assert.strictEqual(h.nodes.progressPercent.textContent, "0:00");
  h.tick(31);
  assert.strictEqual(h.nodes.progressPercent.textContent, "0:31");
  assert.match(h.nodes.message.textContent, /Samplecut javobi cho'zilmoqda/);
  h.callbacks.onStage("retrying", { attempt: 2, maxAttempts: 3 });
  assert.match(h.nodes.message.textContent, /2\/3/);
  h.callbacks.onStage("downloading");
  h.callbacks.onProgress(25);
  assert.strictEqual(h.nodes.progressPercent.textContent, "25%");
  assert.strictEqual(h.timers.size, 1, "only the project watcher remains");
  h.download.resolve({ id: "one", path: "audio.mp3", title: "Test" });
  await flush();
  assert.strictEqual(h.nodes.progressStage.textContent, "Premiere'ga import");
  h.tick(2);
  assert.strictEqual(h.nodes.progressPercent.textContent, "0:02");
  h.importing.resolve({});
  await flush();
  assert.strictEqual(h.nodes.progressStage.textContent, "Timeline'ga qo'shish");
  h.placing.resolve({ trackIndex: 0 });
  await flush();
  assert.strictEqual(h.nodes.progressPercent.textContent, "100%");
  h.tick(2);
  assert.strictEqual(h.timers.size, 1, "only the project watcher remains");
  assert.strictEqual(h.nodes.downloadButton.disabled, false);
  assert.ok(h.infos.some((message) => /Audio tayyorlanmoqda finished after 31000 ms/.test(message)));

  for (const cancel of [false, true]) {
    const failed = harness();
    await flush();
    failed.nodes.downloadButton.handlers.click();
    await flush();
    if (cancel) { failed.nodes.cancelButton.handlers.click(); }
    else { failed.download.reject({ code: "API_TIMEOUT" }); }
    await flush();
    assert.strictEqual(failed.timers.size, 1, "only the project watcher remains");
    const message = failed.nodes.message.textContent;
    assert.match(message, cancel ? /bekor qilindi/ : /2 daqiqa/);
    failed.tick(1);
    assert.strictEqual(failed.nodes.message.textContent, message);
    assert.strictEqual(failed.nodes.downloadButton.disabled, false);
  }
  console.log("PASS progress: elapsed time, slow-server message, retry count, transfer percent, import/placement stages, success/error/cancel cleanup");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
