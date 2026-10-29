(function (global) {
  "use strict";
  var fs = null;
  var pathModule = null;
  var logFile = "";

  function initialize(extensionPath) {
    try {
      var nodeRequire = global.cep_node && global.cep_node.require ? global.cep_node.require : global.require;
      fs = nodeRequire("fs");
      pathModule = nodeRequire("path");
      var logDir = pathModule.join(extensionPath, "logs");
      if (!fs.existsSync(logDir)) { fs.mkdirSync(logDir); }
      logFile = pathModule.join(logDir, "yt-timeline.log");
      rotate();
    } catch (error) {
      fs = null;
    }
  }

  function rotate() {
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 512 * 1024) {
        var oldFile = logFile + ".1";
        if (fs.existsSync(oldFile)) { fs.unlinkSync(oldFile); }
        fs.renameSync(logFile, oldFile);
      }
    } catch (error) { /* Logging must never stop the workflow. */ }
  }

  function clean(value) {
    return String(value || "")
      .replace(/https?:\/\/\S+/gi, "[URL REDACTED]")
      .replace(/[\r\n]+/g, " ")
      .substring(0, 1200);
  }

  function write(level, message) {
    if (!fs || !logFile) { return; }
    try {
      fs.appendFileSync(logFile, new Date().toISOString() + " [" + level + "] " + clean(message) + "\r\n", "utf8");
    } catch (error) { /* Ignore logging failures. */ }
  }

  global.YT = global.YT || {};
  global.YT.Logger = { initialize: initialize, info: function (m) { write("INFO", m); }, error: function (m) { write("ERROR", m); }, getPath: function () { return logFile; } };
}(window));
