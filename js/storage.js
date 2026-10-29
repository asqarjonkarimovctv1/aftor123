(function (global) {
  "use strict";
  var HISTORY_PREFIX = "ytTimeline.projectHistory.v2.";
  var SETTINGS_KEY = "ytTimeline.settings.v1";

  function historyKey(projectKey) {
    return /^[a-f0-9]{64}$/.test(String(projectKey || "")) ? HISTORY_PREFIX + projectKey : "";
  }

  function readJson(key, fallback) {
    try {
      var parsed = JSON.parse(global.localStorage.getItem(key) || "null");
      return parsed === null ? fallback : parsed;
    } catch (error) { return fallback; }
  }

  function getHistory(projectKey) {
    var key = historyKey(projectKey);
    if (!key) { return []; }
    var items = readJson(key, []);
    return Object.prototype.toString.call(items) === "[object Array]" ? items.filter(function (item) {
      return item && item.projectKey === projectKey && typeof item.path === "string" && item.path;
    }) : [];
  }

  function addHistory(item, projectKey) {
    var key = historyKey(projectKey);
    if (!key) { throw new Error("A saved project is required for audio history."); }
    var clean = {
      projectKey: projectKey,
      id: String(item.id || "").substring(0, 64),
      title: String(item.title || "Audio").substring(0, 180),
      path: String(item.path || "").substring(0, 1024),
      duration: Number(item.duration) || 0,
      size: Number(item.size) || 0,
      addedAt: String(item.addedAt || new Date().toISOString()),
      status: String(item.status || "Yuklandi").substring(0, 80)
    };
    var canonicalPath = clean.path.replace(/\//g, "\\").toLowerCase();
    var history = getHistory(projectKey).filter(function (entry) { return entry.path.replace(/\//g, "\\").toLowerCase() !== canonicalPath; });
    history.unshift(clean);
    global.localStorage.setItem(key, JSON.stringify(history));
    return history;
  }

  function clearHistory(projectKey) {
    var key = historyKey(projectKey);
    if (key) { global.localStorage.removeItem(key); global.localStorage.setItem(key + ".legacyImported", "true"); }
  }
  function legacyHistory() {
    var items = readJson("ytTimeline.history.v1", []);
    return Object.prototype.toString.call(items) === "[object Array]" ? items.filter(function (item) { return item && typeof item.path === "string" && item.path; }) : [];
  }
  function getLegacyPaths(projectKey) {
    var key = historyKey(projectKey);
    if (key && global.localStorage.getItem(key + ".legacyImported") === "true") { return []; }
    return legacyHistory().map(function (item) { return item.path; });
  }
  function importLegacy(projectKey, mediaPaths) {
    var markerKey = historyKey(projectKey);
    if (!markerKey || global.localStorage.getItem(markerKey + ".legacyImported") === "true") { return; }
    var present = {};
    (mediaPaths || []).forEach(function (path) { present[path.replace(/\//g, "\\").toLowerCase()] = true; });
    var existing = {};
    getHistory(projectKey).forEach(function (item) { existing[item.path.replace(/\//g, "\\").toLowerCase()] = true; });
    legacyHistory().reverse().forEach(function (item) {
      var path = item.path.replace(/\//g, "\\").toLowerCase();
      if (present[path] && !existing[path]) { addHistory(item, projectKey); existing[path] = true; }
    });
    var key = historyKey(projectKey);
    if (key) { global.localStorage.setItem(key + ".legacyImported", "true"); }
  }
  function getSettings() { return readJson(SETTINGS_KEY, {}); }
  function saveSettings(settings) { global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {})); }

  global.YT = global.YT || {};
  global.YT.Storage = { getHistory: getHistory, addHistory: addHistory, clearHistory: clearHistory, getSettings: getSettings, saveSettings: saveSettings, getLegacyPaths: getLegacyPaths, importLegacy: importLegacy };
}(window));
