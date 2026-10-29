(function (global) {
  "use strict";

  function PremiereBridge() {
    if (typeof global.CSInterface !== "function") { throw new Error("CEP va Premiere aloqa moduli topilmadi."); }
    this.csInterface = new global.CSInterface();
    this.busy = false;
  }

  PremiereBridge.prototype.call = function (action, payload, timeoutMs) {
    var self = this;
    if (this.busy) { return Promise.reject(new Error("Premiere boshqa amalni bajarmoqda.")); }
    this.busy = true;
    var request = JSON.stringify({ action: action, payload: payload || {} });
    var encoded = encodeURIComponent(request);
    var script = '$._YTT_.dispatch("' + encoded + '")';

    return new Promise(function (resolve, reject) {
      var finished = false;
      var timer = global.setTimeout(function () {
        if (finished) { return; }
        finished = true;
        self.busy = false;
        reject(new Error("Premiere belgilangan vaqtda javob bermadi."));
      }, timeoutMs || 15000);

      self.csInterface.evalScript(script, function (raw) {
        if (finished) { return; }
        finished = true;
        global.clearTimeout(timer);
        self.busy = false;
        if (!raw || raw === "EvalScript error.") { reject(new Error("Premiere host skriptini ishga tushirib bo'lmadi.")); return; }
        var response;
        try { response = JSON.parse(raw); } catch (error) { reject(new Error("Premiere noto'g'ri javob qaytardi.")); return; }
        if (!response.ok) {
          var hostError = new Error(response.message || "Premiere amali bajarilmadi.");
          hostError.code = response.code || "HOST_ERROR";
          hostError.details = response.details || null;
          reject(hostError);
          return;
        }
        resolve(response.data || {});
      });
    });
  };

  PremiereBridge.prototype.getStatus = function () { return this.call("getPremiereStatus"); };
  PremiereBridge.prototype.getActiveSequenceInfo = function () { return this.call("getActiveSequenceInfo"); };
  PremiereBridge.prototype.getSequencePlayhead = function () { return this.call("getSequencePlayhead"); };
  PremiereBridge.prototype.importAudioFile = function (filePath, expectedSequenceId) {
    return this.call("importAudioFile", { path: filePath, expectedSequenceId: expectedSequenceId || "" }, 30000);
  };
  PremiereBridge.prototype.addAudioToTimeline = function (filePath, expectedSequenceId, trackIndex) {
    return this.call("addAudioToTimeline", { path: filePath, expectedSequenceId: expectedSequenceId || "", trackIndex: Number(trackIndex) || 0 }, 30000);
  };

  global.YT = global.YT || {};
  global.YT.PremiereBridge = PremiereBridge;
}(window));
