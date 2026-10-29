(function (global) {
  "use strict";

  var elements = {};
  var downloader = null;
  var premiere = null;
  var busy = false;
  var extensionPath = "";
  var destinationPath = "";
  var lastProgressPaint = 0;
  var lastProgressPercent = -1;
  var progressResetTimer = null;
  var stageTimer = null;
  var currentStage = "";
  var stageStartedAt = 0;
  var stageMessage = "";
  var library = null;
  var currentProject = null;
  var projectTimer = null;
  var projectRefresh = null;
  var legacyCheckedKey = "";
  var browser = null;
  var projectWasUnavailable = false;

  function byId(id) { return document.getElementById(id); }

  function initialize() {
    ["statusBadge", "statusText", "urlInput", "clearUrlButton", "destinationPath", "chooseFolderButton", "downloadButton", "downloadButtonLabel", "cancelButton", "progressStage", "progressPercent", "progressBar", "message", "historyList", "emptyHistory", "clearHistoryButton", "openLogsButton", "projectName", "openDownloadsButton", "openBrowserButton"].forEach(function (id) { elements[id] = byId(id); });

    try {
      var cs = new global.CSInterface();
      extensionPath = normalizeCepPath(cs.getSystemPath(global.SystemPath.EXTENSION));
      global.YT.Logger.initialize(extensionPath);
      var settings = global.YT.Storage.getSettings();
      library = new global.YT.ProjectLibrary({ basePath: settings.libraryBasePath || "" });
      destinationPath = library.basePath;
      downloader = new global.YT.Downloader({ extensionPath: extensionPath, destinationPath: destinationPath, logger: global.YT.Logger });
      premiere = new global.YT.PremiereBridge();
      browser = new global.YT.BrowserBridge({ extensionPath: extensionPath, onSelect: function (url) {
        if (busy) { return; }
        elements.urlInput.value = url;
        elements.urlInput.focus();
        if (currentProject) { setStatus("Tayyor", "ready"); }
        setProgress("Tayyor", null, currentProject ? "Video tanlandi. Audioni olish uchun YUKLASH → TIMELINE tugmasini bosing." : "Video tanlandi. Avval Premiere loyihasini oching va saqlang.");
      } });
      updateDestination();
      bindEvents();
      renderHistory();
      preflight();
      projectTimer = global.setInterval(function () { if (!busy && !premiere.busy) { refreshProject().catch(function () {}); } }, 2000);
    } catch (error) {
      showError(global.YT.Utils.friendlyError(error));
      elements.downloadButton.disabled = true;
    }
  }

  function normalizeCepPath(value) {
    var path = String(value || "").replace(/^\/+([A-Za-z]:)/, "$1").replace(/\//g, "\\");
    return path.replace(/\\$/, "");
  }

  function joinPath(left, right) { return String(left).replace(/[\\\/]$/, "") + "\\" + right; }

  function bindEvents() {
    elements.openBrowserButton.addEventListener("click", function () {
      elements.openBrowserButton.disabled = true;
      elements.openBrowserButton.textContent = "YouTube ochilmoqda…";
      browser.open().catch(function (error) { if (!busy) { showError(global.YT.Utils.friendlyError(error)); } }).then(function () {
        elements.openBrowserButton.disabled = busy;
        elements.openBrowserButton.textContent = "YouTube'ni ochish";
      });
    });
    elements.downloadButton.addEventListener("click", startDownload);
    elements.cancelButton.addEventListener("click", cancelDownload);
    elements.clearUrlButton.addEventListener("click", function () { elements.urlInput.value = ""; elements.urlInput.focus(); });
    elements.urlInput.addEventListener("keydown", function (event) { if (event.key === "Enter" && !busy) { startDownload(); } });
    elements.chooseFolderButton.addEventListener("click", chooseFolder);
    elements.clearHistoryButton.addEventListener("click", function () { if (currentProject) { global.YT.Storage.clearHistory(currentProject.key); renderHistory(); } });
    elements.openDownloadsButton.addEventListener("click", function () {
      if (!currentProject) { return; }
      try { library.ensureDestination(currentProject); downloader.openFolder(currentProject.destinationPath); }
      catch (error) { showError(global.YT.Utils.friendlyError(error)); }
    });
    elements.openLogsButton.addEventListener("click", function () { if (downloader) { downloader.openFolder(joinPath(extensionPath, "logs")); } });
    global.addEventListener("focus", function () { if (!busy && premiere && !premiere.busy) { refreshProject().catch(function () {}); } });
    global.addEventListener("beforeunload", function () { stopStageTimer(); global.clearInterval(projectTimer); if (browser) { browser.dispose(); } if (downloader) { downloader.cancel(); } });
  }

  function preflight() {
    refreshProject().then(function () {
      setStatus("Tayyor", "ready");
    }).catch(function (error) {
      showError(global.YT.Utils.friendlyError(error));
    });
  }

  function refreshProject() {
    if (projectRefresh) { return projectRefresh; }
    projectRefresh = premiere.getProjectInfo().then(function (project) {
      var context = library.context(project);
      var changed = !currentProject || currentProject.key !== context.key || currentProject.destinationPath !== context.destinationPath;
      currentProject = context;
      destinationPath = context.destinationPath;
      if (changed) { updateDestination(); renderHistory(); }
      var legacyPaths = global.YT.Storage.getLegacyPaths(context.key);
      var migration = Promise.resolve();
      if (legacyCheckedKey !== context.key && legacyPaths.length) {
        migration = premiere.matchProjectMediaPaths(legacyPaths, context.projectPath).then(function (result) {
          global.YT.Storage.importLegacy(context.key, result.paths);
          renderHistory();
        });
      }
      return migration.then(function () {
        legacyCheckedKey = context.key;
        elements.downloadButton.disabled = busy;
        if (projectWasUnavailable && !busy) {
          setStatus("Tayyor", "ready");
          setProgress("Tayyor", null, "Loyiha ochildi. Audio tanlashingiz mumkin.");
        }
        projectWasUnavailable = false;
        return context;
      });
    }).catch(function (error) {
      currentProject = null;
      projectWasUnavailable = true;
      legacyCheckedKey = "";
      destinationPath = library.basePath;
      updateDestination();
      renderHistory();
      elements.emptyHistory.textContent = global.YT.Utils.friendlyError(error);
      elements.downloadButton.disabled = true;
      throw error;
    }).then(function (context) { projectRefresh = null; return context; }, function (error) { projectRefresh = null; throw error; });
    return projectRefresh;
  }

  function startDownload() {
    if (busy) { return; }
    var checked = global.YT.Utils.validateYouTubeUrl(elements.urlInput.value);
    if (!checked.valid) { showError(checked.message); return; }

    cancelProgressReset();
    busy = true;
    setControlsBusy(true);
    lastProgressPaint = 0;
    lastProgressPercent = -1;
    setProgress("Tayyorlanmoqda", null, "Premiere loyihasi va faol sequence tekshirilmoqda…");
    setStatus("Tayyorlanmoqda", "working");
    var expectedSequenceId = "";
    var downloaded = null;
    var downloadProject = null;

    (projectRefresh || Promise.resolve()).then(function () { return premiere.getActiveSequenceInfo(); })
      .then(function (sequence) {
        expectedSequenceId = sequence.sequenceId;
        downloadProject = library.context(sequence);
        library.ensureDestination(downloadProject);
        downloader.setDestination(downloadProject.destinationPath);
        downloader.cleanupStalePartials();
        currentProject = downloadProject;
        destinationPath = downloadProject.destinationPath;
        updateDestination();
        renderHistory();
        return downloader.download(checked.url, {
          onStage: function (stage, details) {
            if (stage === "preparing") { setProgress("Tayyorlanmoqda", null, "Samplecut so'rovi tayyorlanmoqda…"); setStatus("Tayyorlanmoqda", "working"); }
            if (stage === "processing") { setProgress("Audio tayyorlanmoqda", null, "Samplecut audioni tayyorlamoqda. Server javobi kutilmoqda…"); setStatus("Ishlanmoqda", "working"); }
            if (stage === "retrying") { setProgress("Qayta urinilmoqda", null, "Samplecut orqali qayta urinilmoqda (" + details.attempt + "/" + details.maxAttempts + ")…"); setStatus("Qayta urinilmoqda", "working"); }
            if (stage === "downloading") { setProgress("Audio yuklanmoqda", null, "Tayyor audio kompyuterga saqlanmoqda…"); setStatus("Yuklanmoqda", "working"); }
          },
          onProgress: updateDownloadProgress
        });
      })
      .then(function (result) {
        downloaded = result;
        elements.cancelButton.hidden = true;
        global.YT.Storage.addHistory({ id: result.id, title: result.title, path: result.path, duration: result.duration, size: result.size, status: "Yuklandi" }, downloadProject.key);
        renderHistory();
        setProgress("Premiere'ga import", null, "Audio faol loyihaga import qilinmoqda…");
        setStatus("Import qilinmoqda", "working");
        return premiere.importAudioFile(result.path, expectedSequenceId, downloadProject.projectPath);
      })
      .then(function () {
        setProgress("Timeline'ga qo'shish", null, "Audio yo'llar va joriy playhead tekshirilmoqda…");
        setStatus("Qo'shilmoqda", "working");
        return premiere.addAudioToTimeline(downloaded.path, expectedSequenceId, 0, downloadProject.projectPath);
      })
      .then(function (placement) {
        var placementTrack = "A" + (Number(placement.trackIndex) + 1);
        global.YT.Storage.addHistory({ id: downloaded.id, title: downloaded.title, path: downloaded.path, duration: downloaded.duration, size: downloaded.size, status: placementTrack + " ga qo'shildi" }, downloadProject.key);
        renderHistory();
        setProgress("Tayyor", 100, "Audio " + placementTrack + " ga " + (placement.timecode || "playhead") + " nuqtasida qo'shildi.");
        setStatus("Tayyor", "ready");
        elements.message.className = "message success";
        scheduleProgressReset();
        global.YT.Logger.info("Download and timeline placement completed.");
      })
      .catch(function (error) {
        if (downloaded) {
          global.YT.Storage.addHistory({ id: downloaded.id, title: downloaded.title, path: downloaded.path, duration: downloaded.duration, size: downloaded.size, status: error.code === "TIMELINE_CONFLICT" ? "Yuklandi — A1 band" : "Yuklandi — qo'shilmadi" }, downloadProject.key);
          renderHistory();
        }
        global.YT.Logger.error(error.code + " " + error.message);
        showError(global.YT.Utils.friendlyError(error));
      })
      .then(function () {
        busy = false;
        setControlsBusy(false);
        refreshProject().catch(function () {});
      });
  }

  function cancelDownload() {
    if (downloader && downloader.cancel()) {
      elements.cancelButton.disabled = true;
      setProgress("Bekor qilinmoqda", null, "So'rov va fayl yuklanishi to'xtatilmoqda…");
    }
  }

  function addAgain(item) {
    if (busy) { return; }
    var itemProject = currentProject;
    if (!itemProject || item.projectKey !== itemProject.key) { return; }
    if (!downloader.fileExists(item.path)) { showError("Audio fayli topilmadi. Uni qayta yuklang."); renderHistory(); return; }
    cancelProgressReset();
    busy = true;
    setControlsBusy(true);
    var sequenceId = "";
    setProgress("Tayyorlanmoqda", null, "Faol sequence tekshirilmoqda…");
    setStatus("Tayyorlanmoqda", "working");
    (projectRefresh || Promise.resolve()).then(function () { return premiere.getActiveSequenceInfo(); })
      .then(function (sequence) {
        if (library.context(sequence).key !== itemProject.key) { var error = new Error("Project changed."); error.code = "PROJECT_CHANGED"; throw error; }
        sequenceId = sequence.sequenceId;
        setProgress("Premiere'ga import", null, "Mavjud audio topilmoqda yoki import qilinmoqda…");
        return premiere.importAudioFile(item.path, sequenceId, itemProject.projectPath);
      })
      .then(function () { setProgress("Timeline'ga qo'shish", null, "Joriy playhead va audio yo'llar tekshirilmoqda…"); return premiere.addAudioToTimeline(item.path, sequenceId, 0, itemProject.projectPath); })
      .then(function (placement) {
        var placementTrack = "A" + (Number(placement.trackIndex) + 1);
        global.YT.Storage.addHistory({ id: item.id, title: item.title, path: item.path, duration: item.duration, size: item.size, status: placementTrack + " ga qo'shildi" }, itemProject.key);
        renderHistory();
        setProgress("Tayyor", 100, "Audio " + placementTrack + " ga " + (placement.timecode || "playhead") + " nuqtasida qo'shildi.");
        setStatus("Tayyor", "ready");
        elements.message.className = "message success";
        scheduleProgressReset();
      })
      .catch(function (error) { global.YT.Logger.error(error.code + " " + error.message); showError(global.YT.Utils.friendlyError(error)); })
      .then(function () { busy = false; setControlsBusy(false); refreshProject().catch(function () {}); });
  }

  function chooseFolder() {
    if (busy || !global.cep || !global.cep.fs || !global.cep.fs.showOpenDialog) { return; }
    var result = global.cep.fs.showOpenDialog(false, true, "Loyiha papkalari saqlanadigan joyni tanlang", library.basePath, []);
    if (result && result.err === 0 && result.data && result.data.length) {
      var selected = normalizeCepPath(result.data[0]);
      var previousBase = library.basePath;
      var previousProject = currentProject;
      try {
        library.basePath = selected;
        var context = currentProject ? library.context(currentProject) : null;
        if (!context) { var projectError = new Error("Save a project first."); projectError.code = "PROJECT_NOT_SAVED"; throw projectError; }
        library.ensureDestination(context);
        downloader.setDestination(context.destinationPath);
        downloader.checkEnvironment();
        var settings = global.YT.Storage.getSettings();
        settings.libraryBasePath = selected;
        global.YT.Storage.saveSettings(settings);
        currentProject = context;
        destinationPath = context.destinationPath;
        updateDestination();
        setProgress("Tayyor", 0, "Saqlash papkasi yangilandi.");
        setStatus("Tayyor", "ready");
      } catch (error) { library.basePath = previousBase; currentProject = previousProject; downloader.setDestination(destinationPath); showError(global.YT.Utils.friendlyError(error)); }
    }
  }

  function renderHistory() {
    var history = currentProject ? global.YT.Storage.getHistory(currentProject.key) : [];
    elements.historyList.textContent = "";
    elements.emptyHistory.hidden = history.length > 0;
    elements.emptyHistory.textContent = currentProject ? "Bu loyiha uchun hali audio yuklanmagan." : "Avval loyihani oching va saqlang.";
    elements.projectName.textContent = currentProject ? currentProject.projectName : "Loyiha tanlanmagan";
    elements.projectName.title = currentProject ? currentProject.projectPath : "";
    elements.clearHistoryButton.disabled = !currentProject || busy;
    elements.openDownloadsButton.disabled = !currentProject;
    history.forEach(function (item) {
      var exists = downloader ? downloader.fileExists(item.path) : false;
      var row = document.createElement("div"); row.className = "history-item";
      var main = document.createElement("div"); main.className = "history-main";
      var title = document.createElement("div"); title.className = "history-title"; title.textContent = item.title || "Audio"; title.title = item.title || "Audio";
      if (!exists) { row.className += " missing"; title.title = "Fayl topilmadi — " + title.title; }
      var button = document.createElement("button"); button.className = "secondary-button add-again"; button.type = "button"; button.textContent = "+"; button.title = "Timeline'ga qayta qo'shish"; button.setAttribute("aria-label", "Timeline'ga qayta qo'shish"); button.disabled = !exists || busy;
      button.addEventListener("click", function () { addAgain(item); });
      main.appendChild(title); row.appendChild(main); row.appendChild(button); elements.historyList.appendChild(row);
    });
  }

  function updateDestination() {
    elements.destinationPath.textContent = global.YT.Utils.basename(destinationPath) || destinationPath;
    elements.destinationPath.title = destinationPath;
  }

  function updateDownloadProgress(percent) {
    var normalized = Math.max(0, Math.min(100, Number(percent) || 0));
    var rounded = Math.floor(normalized);
    var now = Date.now();
    if (rounded < 100 && rounded === lastProgressPercent) { return; }
    if (rounded < 100 && now - lastProgressPaint < 120) { return; }
    lastProgressPaint = now;
    lastProgressPercent = rounded;
    setProgress("Audio yuklanmoqda", normalized, "Tayyor audio kompyuterga saqlanmoqda…");
  }

  function setControlsBusy(isBusy) {
    elements.openBrowserButton.disabled = isBusy;
    elements.downloadButton.disabled = isBusy || !currentProject;
    elements.urlInput.disabled = isBusy;
    elements.chooseFolderButton.disabled = isBusy;
    elements.clearUrlButton.disabled = isBusy;
    elements.cancelButton.hidden = !isBusy;
    elements.cancelButton.disabled = false;
    elements.downloadButtonLabel.textContent = isBusy ? "ISHLANMOQDA…" : "YUKLASH → TIMELINE";
    renderHistory();
  }

  function setStatus(label, state) { elements.statusText.textContent = label; elements.statusBadge.setAttribute("data-state", state || "ready"); }

  function setProgress(stage, percent, message) {
    if (stage !== currentStage) {
      if (stageStartedAt && currentStage !== "Tayyor" && currentStage !== "Xato") {
        global.YT.Logger.info("Stage " + currentStage + " finished after " + (Date.now() - stageStartedAt) + " ms.");
      }
      currentStage = stage;
      stageStartedAt = Date.now();
    }
    stopStageTimer();
    stageMessage = message || "";
    elements.progressStage.textContent = stage;
    var hasPercent = typeof percent === "number" && isFinite(percent);
    var normalized = hasPercent ? Math.max(0, Math.min(100, percent)) : 0;
    var isIndeterminate = !hasPercent && stage !== "Tayyor" && stage !== "Xato";
    var track = elements.progressBar.parentNode;
    track.className = "progress-track" + (isIndeterminate ? " indeterminate" : "");
    elements.progressPercent.textContent = hasPercent ? Math.round(normalized) + "%" : "";
    elements.progressBar.style.width = isIndeterminate ? "28%" : (hasPercent ? normalized + "%" : "0");
    track.setAttribute("aria-valuenow", hasPercent ? String(Math.round(normalized)) : "0");
    if (isIndeterminate) {
      track.setAttribute("aria-valuetext", stage + " — davom etmoqda");
    } else {
      track.removeAttribute("aria-valuetext");
    }
    elements.message.textContent = message || "";
    elements.message.title = message || "";
    elements.message.className = "message";
    if (isIndeterminate) {
      updateStageElapsed();
      stageTimer = global.setInterval(updateStageElapsed, 1000);
    }
  }

  function stopStageTimer() {
    if (stageTimer !== null) { global.clearInterval(stageTimer); stageTimer = null; }
  }

  function updateStageElapsed() {
    var seconds = Math.max(0, Math.floor((Date.now() - stageStartedAt) / 1000));
    elements.progressPercent.textContent = global.YT.Utils.formatDuration(seconds);
    elements.progressBar.parentNode.setAttribute("aria-valuetext", currentStage + " — " + seconds + " soniya");
    var message = stageMessage;
    if (seconds >= 30 && (currentStage === "Audio tayyorlanmoqda" || currentStage === "Qayta urinilmoqda")) {
      message = "Samplecut javobi cho'zilmoqda. Kutishingiz yoki yuklashni bekor qilishingiz mumkin.";
    }
    elements.message.textContent = message;
    elements.message.title = message;
  }

  function cancelProgressReset() {
    if (progressResetTimer !== null) {
      global.clearTimeout(progressResetTimer);
      progressResetTimer = null;
    }
  }

  function scheduleProgressReset() {
    cancelProgressReset();
    progressResetTimer = global.setTimeout(function () {
      progressResetTimer = null;
      if (busy) { return; }
      var track = elements.progressBar.parentNode;
      track.className = "progress-track";
      track.setAttribute("aria-valuenow", "0");
      track.removeAttribute("aria-valuetext");
      elements.progressBar.style.width = "0";
      elements.progressPercent.textContent = "";
    }, 1800);
  }

  function showError(message) {
    setStatus("Xato", "error");
    setProgress("Xato", null, message);
    elements.message.className = "message error";
  }

  document.addEventListener("DOMContentLoaded", initialize);
}(window));
