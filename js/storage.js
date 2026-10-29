(function (global) {
  "use strict";
  var HISTORY_KEY = "ytTimeline.history.v1";
  var SETTINGS_KEY = "ytTimeline.settings.v1";
  var MAX_HISTORY = 10;

  function readJson(key, fallback) {
    try {
      var parsed = JSON.parse(global.localStorage.getItem(key) || "null");
      return parsed === null ? fallback : parsed;
    } catch (error) { return fallback; }
  }

  function getHistory() {
    var items = readJson(HISTORY_KEY, []);
    return Object.prototype.toString.call(items) === "[object Array]" ? items.slice(0, MAX_HISTORY) : [];
  }

  function addHistory(item) {
    var clean = {
      id: String(item.id || "").substring(0, 64),
      title: String(item.title || "Audio").substring(0, 180),
      path: String(item.path || "").substring(0, 1024),
      duration: Number(item.duration) || 0,
      size: Number(item.size) || 0,
      addedAt: new Date().toISOString(),
      status: String(item.status || "Yuklandi").substring(0, 80)
    };
    var history = getHistory().filter(function (entry) { return entry.path !== clean.path; });
    history.unshift(clean);
    global.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    return history;
  }

  function clearHistory() { global.localStorage.removeItem(HISTORY_KEY); }
  function getSettings() { return readJson(SETTINGS_KEY, {}); }
  function saveSettings(settings) { global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {})); }

  global.YT = global.YT || {};
  global.YT.Storage = { getHistory: getHistory, addHistory: addHistory, clearHistory: clearHistory, getSettings: getSettings, saveSettings: saveSettings };
}(window));
