/* Minimal, dependency-free subset of Adobe's CSInterface used by this panel. */
(function (global) {
  "use strict";

  var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
  };

  function parseHostEnvironment() {
    try {
      return JSON.parse(global.__adobe_cep__.getHostEnvironment());
    } catch (error) {
      return {};
    }
  }

  function CSInterface() {
    this.hostEnvironment = global.__adobe_cep__ ? parseHostEnvironment() : {};
  }

  CSInterface.prototype.evalScript = function (script, callback) {
    if (!global.__adobe_cep__ || typeof global.__adobe_cep__.evalScript !== "function") {
      if (callback) { callback("EvalScript error."); }
      return;
    }
    global.__adobe_cep__.evalScript(script, callback || function () {});
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (!global.__adobe_cep__) { return ""; }
    var path = global.__adobe_cep__.getSystemPath(pathType);
    return decodeURI(path).replace(/^file:\/\//i, "");
  };

  CSInterface.prototype.getOSInformation = function () {
    if (!global.__adobe_cep__) { return "Unknown"; }
    return global.__adobe_cep__.getOSInformation();
  };

  CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    if (global.__adobe_cep__) { global.__adobe_cep__.openURLInDefaultBrowser(url); }
  };

  global.SystemPath = SystemPath;
  global.CSInterface = CSInterface;
}(window));
