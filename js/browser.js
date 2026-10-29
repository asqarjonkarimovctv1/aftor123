(function (global) {
  "use strict";

  function BrowserBridge(options) {
    var nodeRequire = global.cep_node && global.cep_node.require ? global.cep_node.require : global.require;
    this.fs = nodeRequire("fs");
    this.path = nodeRequire("path");
    this.childProcess = nodeRequire("child_process");
    this.options = options;
    this.child = null;
    this.pending = null;
  }

  BrowserBridge.prototype.open = function () {
    var self = this;
    if (this.pending) { return this.pending; }
    if (this.child) {
      try { this.child.stdin.write(JSON.stringify({ type: "show" }) + "\n"); }
      catch (error) { this.child = null; return Promise.reject(this.error("BROWSER_CLOSED")); }
      return Promise.resolve();
    }
    var binary = this.path.join(this.options.extensionPath, "browser", "Salos.YouTubeBrowser.exe");
    if (!this.fs.existsSync(binary)) { binary = this.path.join(this.options.extensionPath, "browser", "dist", "Salos.YouTubeBrowser.exe"); }
    if (!this.fs.existsSync(binary)) { return Promise.reject(this.error("BROWSER_NOT_INSTALLED")); }
    this.pending = new Promise(function (resolve, reject) {
      var ready = false;
      var available = false;
      var buffer = "";
      var child;
      var timer;
      function fail(code) {
        if (ready) { return; }
        ready = true;
        global.clearTimeout(timer);
        reject(self.error(code));
        if (self.child === child) { self.child = null; }
        if (child) { child.kill(); }
      }
      try { child = self.childProcess.spawn(binary, [], { shell: false, windowsHide: false, stdio: ["pipe", "pipe", "pipe"] }); }
      catch (error) { fail("BROWSER_START_FAILED"); return; }
      self.child = child;
      timer = global.setTimeout(function () { fail("BROWSER_START_FAILED"); }, 30000);
      child.on("error", function () { fail("BROWSER_START_FAILED"); });
      child.on("close", function () {
        available = false;
        if (self.child === child) { self.child = null; }
        fail("BROWSER_CLOSED");
      });
      child.stdin.on("error", function () { fail("BROWSER_CLOSED"); });
      // Browser diagnostics may contain browsing data; never copy them into the plugin log.
      child.stderr.on("data", function () {});
      child.stdout.on("data", function (chunk) {
        buffer += chunk.toString("utf8");
        if (buffer.length > 65536) { fail("BROWSER_START_FAILED"); buffer = ""; return; }
        var newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          var line = buffer.substring(0, newline);
          buffer = buffer.substring(newline + 1);
          var message;
          try { message = JSON.parse(line); } catch (ignoreInvalidMessage) { continue; }
          if (message.type === "ready" && !ready) { ready = true; available = true; global.clearTimeout(timer); resolve(); }
          if (message.type === "error") { fail(message.code === "BROWSER_RUNTIME_MISSING" ? message.code : "BROWSER_START_FAILED"); }
          if (message.type === "selected" && available) {
            var checked = global.YT.Utils.validateYouTubeUrl(message.url);
            if (checked.valid) { self.options.onSelect(checked.url); }
          }
        }
      });
    }).then(function () { self.pending = null; }, function (error) { self.pending = null; throw error; });
    return this.pending;
  };

  BrowserBridge.prototype.dispose = function () {
    if (this.child) { this.child.stdin.end(); }
  };

  BrowserBridge.prototype.error = function (code) { var error = new Error(code); error.code = code; return error; };

  global.YT = global.YT || {};
  global.YT.BrowserBridge = BrowserBridge;
}(window));
