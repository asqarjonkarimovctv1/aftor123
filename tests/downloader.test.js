"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

global.window = global;
global.require = require;
const memory = {};
global.localStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
  setItem(key, value) { memory[key] = String(value); },
  removeItem(key) { delete memory[key]; }
};
global.YT = {
  Utils: {
    sanitizeFileName(value) { return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().substring(0, 110) || "audio"; },
    basename(value) { return path.basename(value); }
  }
};
const logger = { info() {}, error() {} };

const sourcePath = path.join(__dirname, "..", "js", "downloader.js");
const source = fs.readFileSync(sourcePath, "utf8");
eval(source);

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yttimeline-test-"));
  try {
    const client = new global.YT.Downloader({ extensionPath: path.join(__dirname, ".."), destinationPath: tempRoot, logger });
    const environment = client.checkEnvironment();
    assert.strictEqual(environment.apiHost, "api.samplecut.app");
    assert.strictEqual(environment.timeoutMs, 120000);

    const valid = {
      id: "969cb27b-1111-2222-3333-444444444444",
      download_url: "https://api.samplecut.app/d/969cb27b-test",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      title: "Test title",
      filename: "samplecut-test-title.mp3",
      format: "mp3",
      full: true,
      track_duration_sec: 19.05,
      editor_url: "https://samplecut.app/"
    };
    assert.strictEqual(client._validateDownloadResponse(valid), valid);

    assert.throws(() => client._validateDownloadResponse({ ...valid, download_url: "https://evil.example/file.mp3" }), /unexpected download host/i);
    assert.throws(() => client._validateDownloadResponse({ ...valid, expires_at: new Date(Date.now() - 1000).toISOString() }), /expired/i);
    assert.throws(() => client._validateDownloadResponse({ ...valid, title: undefined }), /missing title/i);

    const rateLimit = client._apiError(429, { error: { code: "rate_limited", message: "Wait", retryable: true } }, { "retry-after": "37" });
    assert.strictEqual(rateLimit.code, "RATE_LIMITED");
    assert.strictEqual(rateLimit.retryAfter, 37);
    assert.match(rateLimit.message, /37 seconds/);

    const unreachable = client._apiError(502, { error: { code: "source_unreachable", message: "No source", retryable: true } }, {});
    assert.strictEqual(unreachable.code, "SOURCE_UNREACHABLE");
    assert.strictEqual(unreachable.retryable, true);

    const disabled = client._apiError(503, { error: { code: "api_disabled", message: "Off", retryable: false } }, {});
    assert.strictEqual(disabled.code, "API_DISABLED");
    assert.match(disabled.message, /temporarily unavailable/i);

    const base = client._uniqueBase("A title", valid.id);
    assert.strictEqual(path.dirname(base), tempRoot);
    assert.match(path.basename(base), /\[sc-969cb27b-1111-22\]/);

    let attempts = 0;
    client._wait = () => Promise.resolve();
    client._jsonRequest = () => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.resolve({ statusCode: 502, headers: {}, body: { error: { code: "source_unreachable", message: "Try again", retryable: true } } });
      }
      return Promise.resolve({ statusCode: 201, headers: {}, body: valid });
    };
    const metadata = await client._createDownload("https://www.youtube.com/watch?v=jNQXAC9IVRw", { cancelled: false }, {}, 1);
    assert.strictEqual(metadata.id, valid.id);
    assert.strictEqual(attempts, 3);

    const lowerSource = source.toLowerCase();
    assert.strictEqual(lowerSource.includes("yt-dlp"), false);
    assert.strictEqual(lowerSource.includes("ffmpeg"), false);

    console.log("PASS downloader: contract, expiry, host allowlist, errors, retries, filenames, no external binaries");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
