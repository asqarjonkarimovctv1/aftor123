"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");

const memory = {};
const context = {
  require,
  localStorage: {
    getItem(key) { return memory[key] || null; },
    setItem(key, value) { memory[key] = value; },
    removeItem(key) { delete memory[key]; }
  }
};
context.window = context;
vm.createContext(context);
for (const file of ["utils.js", "storage.js", "library.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "yttimeline-library-"));
try {
  const windowsContext = {
    YT: { Utils: context.YT.Utils },
    require(name) {
      if (name === "path") return path.win32;
      if (name === "os") return { homedir() { return "C:\\Users\\Test"; } };
      if (name === "process") return { platform: "win32", env: { SystemRoot: "C:\\Windows" } };
      if (name === "child_process") return { execFileSync(binary, args, options) {
        assert.ok(path.win32.isAbsolute(binary));
        assert.strictEqual(options.encoding, "utf8");
        return "D:\\Загрузки\\Unicode User";
      } };
      return require(name);
    }
  };
  windowsContext.window = windowsContext;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "library.js"), "utf8"), windowsContext);
  assert.strictEqual(new windowsContext.YT.ProjectLibrary().basePath, "D:\\Загрузки\\Unicode User\\YT Timeline", "respect redirected Downloads paths and non-ASCII user names");
  const library = new context.YT.ProjectLibrary({ basePath: path.join(temp, "Downloads", "YT Timeline") });
  const a = library.context({ projectPath: "D:\\Edits\\Client A\\Film.prproj" });
  const sameA = library.context({ projectPath: "d:/edits/Client A/Film.prproj" });
  const b = library.context({ projectPath: "D:\\Edits\\Client B\\Film.prproj" });
  assert.strictEqual(a.key, sameA.key, "Windows spelling/case changes must preserve project identity");
  assert.notStrictEqual(a.key, b.key, "projects with identical names in different folders stay separate");
  assert.notStrictEqual(a.destinationPath, b.destinationPath);
  assert.strictEqual(library.ensureDestination(a), a.destinationPath);
  assert.strictEqual(library.ensureDestination(a), a.destinationPath, "folder creation is repeatable");
  assert.ok(fs.statSync(a.destinationPath).isDirectory());
  assert.throws(() => library.context({ projectPath: "" }), { code: "PROJECT_NOT_SAVED" });
  assert.throws(() => library.context({ projectPath: "Film.prproj" }), { code: "PROJECT_NOT_SAVED" });

  // Preserve pre-upgrade records without guessing which project they belonged to.
  const legacy = JSON.stringify([{ title: "Old song", path: "C:\\Old\\song.mp3" }]);
  memory["ytTimeline.history.v1"] = legacy;
  const storage = context.YT.Storage;
  assert.strictEqual(storage.getHistory(a.key).length, 0);
  for (let i = 0; i < 30; i += 1) {
    storage.addHistory({ id: "a-" + i, title: "A song " + i, path: path.join(a.destinationPath, i + ".mp3") }, a.key);
  }
  storage.addHistory({ id: "b-1", title: "B song", path: path.join(b.destinationPath, "one.mp3") }, b.key);
  assert.strictEqual(storage.getHistory(a.key).length, 30, "history is not truncated to 5 or 10 entries");
  assert.strictEqual(storage.getHistory(b.key).length, 1);
  storage.addHistory({ title: "Updated", path: path.join(a.destinationPath, "29.mp3").toUpperCase() }, a.key);
  assert.strictEqual(storage.getHistory(a.key).length, 30, "status updates deduplicate case-insensitive Windows paths");
  assert.strictEqual(storage.getHistory(a.key)[0].title, "Updated");

  const audioFile = path.join(a.destinationPath, "keep.mp3");
  fs.writeFileSync(audioFile, "test audio data");
  storage.clearHistory(a.key);
  assert.strictEqual(storage.getHistory(a.key).length, 0);
  assert.strictEqual(storage.getHistory(b.key).length, 1, "clearing project A leaves B's history intact");
  assert.ok(fs.existsSync(audioFile), "clearing history never deletes audio files");
  assert.strictEqual(memory["ytTimeline.history.v1"], legacy);
  assert.strictEqual(storage.getHistory().length, 0);

  const c = library.context({ projectPath: "D:\\Edits\\Legacy.prproj" });
  assert.strictEqual(storage.getLegacyPaths(c.key).length, 1);
  storage.importLegacy(c.key, ["c:/old/song.mp3"]);
  assert.strictEqual(storage.getHistory(c.key).length, 1);
  assert.strictEqual(storage.getLegacyPaths(c.key).length, 0);
  assert.strictEqual(storage.getHistory(b.key).length, 1);
  storage.clearHistory(c.key);
  storage.importLegacy(c.key, ["c:/old/song.mp3"]);
  assert.strictEqual(storage.getHistory(c.key).length, 0, "a late migration response must not undo an explicit history clear");
  assert.strictEqual(storage.getLegacyPaths(c.key).length, 0, "cleared legacy history must not reappear on reload");

  const movedBase = new context.YT.ProjectLibrary({ basePath: path.join(temp, "Other Downloads") });
  assert.strictEqual(movedBase.context({ projectPath: a.projectPath }).key, a.key, "changing download root preserves project history");
  console.log("PASS project library: Windows identities, same-name projects, nested folders, unsaved project, 30-item history, deduplication, per-project clear, preserved audio/legacy data");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
