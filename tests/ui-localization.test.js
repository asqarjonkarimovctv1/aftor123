"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const utilsSource = fs.readFileSync(path.join(root, "js", "utils.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");

assert.match(html, /<html lang="uz">/);
assert.match(html, /YUKLASH → TIMELINE/);
assert.match(html, /LOYIHA AUDIOLARI/);
assert.match(html, /class="folder-label">PAPKA</);
assert.match(html, /class="folder-chevron"[^>]*>›</);
assert.strictEqual(/id="metadata"|metaTitle|metaDuration|metaFile|metaSize/.test(html), false);
assert.strictEqual(/showMetadata|resetMetadata|metaTitle|metaDuration|metaFile|metaSize/.test(appSource), false);
assert.match(appSource, /now - lastProgressPaint < 120/);
assert.match(appSource, /stage === "downloading"\) \{ setProgress\("Audio yuklanmoqda", null/);
assert.match(appSource, /scheduleProgressReset\(\)/);
assert.match(appSource, /}, 1800\)/);
assert.match(cssSource, /\.progress-track\.indeterminate \.progress-bar/);
assert.match(cssSource, /@keyframes progress-indeterminate/);
assert.match(cssSource, /\.folder-button:hover/);
assert.match(cssSource, /border: 1px solid #414141/);
assert.match(cssSource, /overflow-y: auto/);
assert.match(utilsSource, /Samplecut bu videoni davomiylik cheklovi sabab qabul qilmadi/);
assert.doesNotMatch(utilsSource, /60 daqiqalik limitidan uzun/);

const manifest = fs.readFileSync(path.join(root, "CSXS", "manifest.xml"), "utf8");
assert.match(manifest, /<Width>600<\/Width>\s*<Height>300<\/Height>/);

global.window = global;
global.document = {
  createElement() {
    return {
      set href(value) {
        const parsed = new URL(value);
        this.protocol = parsed.protocol;
        this.hostname = parsed.hostname;
        this.pathname = parsed.pathname;
        this.search = parsed.search;
        this.username = parsed.username;
        this.password = parsed.password;
        this.port = parsed.port;
      }
    };
  }
};

eval(fs.readFileSync(path.join(root, "js", "utils.js"), "utf8"));

assert.match(global.YT.Utils.validateYouTubeUrl("").message, /Avval YouTube havolasini kiriting/);
assert.match(global.YT.Utils.friendlyError({ code: "TIMELINE_CONFLICT" }), /A1 band/);
assert.match(global.YT.Utils.friendlyError({ code: "RATE_LIMITED", retryAfter: 42 }), /42 soniyadan keyin/);
assert.match(global.YT.Utils.friendlyError({ code: "NO_ACTIVE_SEQUENCE" }), /sequence/);

console.log("PASS UI: Uzbek localization, live indeterminate progress, compact layout");
