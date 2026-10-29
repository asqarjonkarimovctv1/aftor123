(function (global) {
  "use strict";

  function ProjectLibrary(options) {
    var nodeRequire = global.cep_node && global.cep_node.require ? global.cep_node.require : global.require;
    this.fs = nodeRequire("fs");
    this.path = nodeRequire("path");
    this.crypto = nodeRequire("crypto");
    this.basePath = options && options.basePath || this.defaultDownloads(nodeRequire);
  }

  ProjectLibrary.prototype.defaultDownloads = function (nodeRequire) {
    var os = nodeRequire("os");
    var process = nodeRequire("process");
    var root = this.path.join(os.homedir(), "Downloads");
    if (process.platform === "win32") {
      try {
        var powershell = this.path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        var script = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'); try { [Console]::Write($key.GetValue('{374DE290-123F-4565-9164-39C4925E467B}')) } finally { if ($key) { $key.Dispose() } }";
        var output = nodeRequire("child_process").execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 2000 }).trim();
        if (this.path.isAbsolute(output) && output.indexOf("%") < 0) { root = output; }
      } catch (ignoreRegistry) { /* Fall back to the user's Downloads folder. */ }
    }
    return this.path.join(root, "YT Timeline");
  };

  ProjectLibrary.prototype.context = function (project) {
    var projectPath = String(project && project.projectPath || "");
    if (!projectPath || !this.path.win32.isAbsolute(projectPath)) {
      var error = new Error("Save the Premiere project before downloading audio.");
      error.code = "PROJECT_NOT_SAVED";
      throw error;
    }
    var canonical = this.path.win32.normalize(projectPath).replace(/\\+$/, "").toLowerCase();
    var key = this.crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
    var name = this.path.win32.basename(projectPath).replace(/\.prproj$/i, "") || "Loyiha";
    var folderName = global.YT.Utils.sanitizeFileName(name).substring(0, 40).replace(/[. ]+$/, "") + " [" + key.substring(0, 12) + "]";
    return { key: key, projectName: name, projectPath: projectPath, destinationPath: this.path.join(this.basePath, folderName) };
  };

  ProjectLibrary.prototype.ensureDestination = function (context) {
    var fs = this.fs;
    var path = this.path;
    function ensure(directory) {
      if (fs.existsSync(directory)) {
        if (!fs.statSync(directory).isDirectory()) { throw new Error("The selected download destination is not a folder."); }
        return;
      }
      var parent = path.dirname(directory);
      if (parent !== directory) { ensure(parent); }
      try { fs.mkdirSync(directory); }
      catch (error) { if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) { throw error; } }
    }
    ensure(context.destinationPath);
    return context.destinationPath;
  };

  global.YT = global.YT || {};
  global.YT.ProjectLibrary = ProjectLibrary;
}(window));
