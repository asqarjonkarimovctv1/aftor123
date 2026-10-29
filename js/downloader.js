(function (global) {
  "use strict";

  var ACTIVE_JOB_KEY = "ytTimeline.activeJob.v2";
  var API_HOST = "api.samplecut.app";
  var API_PATH = "/v1/downloads";
  var API_TIMEOUT_MS = 120000;
  var MAX_JSON_BYTES = 1024 * 1024;
  var MAX_AUDIO_BYTES = 512 * 1024 * 1024;
  var MAX_API_ATTEMPTS = 3;

  function Downloader(options) {
    this.extensionPath = options.extensionPath;
    this.destinationPath = options.destinationPath;
    this.logger = options.logger;
    this.currentJob = null;
    this.node = this._loadNode();
    this._recoverInterruptedJob();
  }

  Downloader.prototype._loadNode = function () {
    var nodeRequire = global.cep_node && global.cep_node.require ? global.cep_node.require : global.require;
    if (typeof nodeRequire !== "function") {
      throw new Error("CEP Node.js is unavailable. Check --enable-nodejs in manifest.xml.");
    }
    return {
      fs: nodeRequire("fs"),
      path: nodeRequire("path"),
      https: nodeRequire("https"),
      url: nodeRequire("url"),
      Buffer: global.cep_node && global.cep_node.Buffer ? global.cep_node.Buffer : global.Buffer,
      childProcess: nodeRequire("child_process")
    };
  };

  Downloader.prototype.setDestination = function (destinationPath) {
    this.destinationPath = destinationPath;
  };

  Downloader.prototype.checkEnvironment = function () {
    var fs = this.node.fs;
    if (!fs.existsSync(this.destinationPath)) {
      try { fs.mkdirSync(this.destinationPath); } catch (error) { throw new Error("The selected download folder cannot be created."); }
    }
    var stat = fs.statSync(this.destinationPath);
    if (!stat.isDirectory()) { throw new Error("The selected download destination is not a folder."); }
    try {
      fs.accessSync(this.destinationPath, fs.constants ? fs.constants.W_OK : 2);
    } catch (error) { throw new Error("The selected download folder is not writable."); }
    return { apiHost: API_HOST, timeoutMs: API_TIMEOUT_MS };
  };

  Downloader.prototype.download = function (url, callbacks) {
    var self = this;
    if (this.currentJob) { return Promise.reject(this._error("JOB_RUNNING", "A download is already running.")); }
    try { this.checkEnvironment(); } catch (error) { return Promise.reject(error); }

    var job = {
      cancelled: false,
      completed: false,
      prefix: "",
      destinationPath: this.destinationPath,
      request: null,
      response: null,
      writeStream: null,
      retryTimer: null,
      retryReject: null
    };
    callbacks = callbacks || {};
    this.currentJob = job;
    if (callbacks.onStage) { callbacks.onStage("preparing"); }

    return this._createDownload(url, job, callbacks, 1)
      .then(function (metadata) {
        self._throwIfCancelled(job);
        if (callbacks.onMetadata) {
          callbacks.onMetadata({ id: metadata.id, title: metadata.title, duration: metadata.track_duration_sec });
        }
        var base = self._uniqueBase(metadata.title || metadata.filename || "Samplecut audio", metadata.id);
        var finalPath = base + ".mp3";
        var partialPath = finalPath + ".part";
        job.prefix = self.node.path.basename(base);
        self._saveActiveJob(job, partialPath);
        if (callbacks.onStage) { callbacks.onStage("downloading"); }
        return self._downloadFile(metadata, finalPath, partialPath, job, callbacks).then(function () {
          var stat = self.node.fs.statSync(finalPath);
          job.completed = true;
          return {
            id: String(metadata.id || ""),
            title: String(metadata.title || global.YT.Utils.basename(finalPath)),
            duration: Number(metadata.track_duration_sec) || 0,
            uploader: "",
            path: finalPath,
            size: stat.size
          };
        });
      })
      .then(function (result) {
        self._clearActiveJob();
        self.currentJob = null;
        return result;
      }, function (error) {
        self._cleanupJobFiles(job);
        self._clearActiveJob();
        self.currentJob = null;
        throw error;
      });
  };

  Downloader.prototype._createDownload = function (sourceUrl, job, callbacks, attempt) {
    var self = this;
    this._throwIfCancelled(job);
    if (callbacks.onStage) { callbacks.onStage(attempt > 1 ? "retrying" : "processing"); }
    var payload = JSON.stringify({ url: sourceUrl, format: "mp3", response: "url" });

    return this._jsonRequest({
      hostname: API_HOST,
      port: 443,
      path: API_PATH,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": this.node.Buffer.byteLength(payload, "utf8"),
        "x-client-name": "YT Timeline",
        "accept": "application/json"
      }
    }, payload, job).then(function (result) {
      if (result.statusCode === 201) { return self._validateDownloadResponse(result.body); }

      var apiError = self._apiError(result.statusCode, result.body, result.headers);
      if ((result.statusCode === 500 || result.statusCode === 502) && attempt < MAX_API_ATTEMPTS) {
        var delayMs = attempt === 1 ? 1000 : 2500;
        self.logger.info("Samplecut retryable response " + result.statusCode + "; retrying attempt " + (attempt + 1) + ".");
        return self._wait(job, delayMs).then(function () {
          return self._createDownload(sourceUrl, job, callbacks, attempt + 1);
        });
      }
      throw apiError;
    });
  };

  Downloader.prototype._jsonRequest = function (options, body, job) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var settled = false;
      var request = self.node.https.request(options, function (response) {
        job.response = response;
        var chunks = [];
        var size = 0;
        response.on("data", function (chunk) {
          size += chunk.length;
          if (size > MAX_JSON_BYTES) {
            response.destroy(self._error("API_RESPONSE_TOO_LARGE", "Samplecut returned an unexpectedly large response."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", function () {
          if (settled) { return; }
          settled = true;
          job.request = null;
          job.response = null;
          var text = self.node.Buffer.concat(chunks).toString("utf8");
          var parsed = {};
          if (text) {
            try { parsed = JSON.parse(text); }
            catch (error) { reject(self._error("INVALID_API_RESPONSE", "Samplecut returned an invalid JSON response.", response.statusCode)); return; }
          }
          resolve({ statusCode: response.statusCode, headers: response.headers || {}, body: parsed });
        });
        response.on("error", function (error) {
          if (settled) { return; }
          settled = true;
          job.request = null;
          job.response = null;
          reject(self._networkError(error, job));
        });
      });
      job.request = request;
      request.setTimeout(API_TIMEOUT_MS, function () {
        request.destroy(self._error("API_TIMEOUT", "Samplecut did not respond within 120 seconds."));
      });
      request.on("error", function (error) {
        if (settled) { return; }
        settled = true;
        job.request = null;
        job.response = null;
        reject(self._networkError(error, job));
      });
      request.end(body);
    });
  };

  Downloader.prototype._validateDownloadResponse = function (body) {
    var required = ["id", "download_url", "expires_at", "title", "filename", "format", "track_duration_sec"];
    for (var i = 0; i < required.length; i += 1) {
      if (typeof body[required[i]] === "undefined" || body[required[i]] === null || body[required[i]] === "") {
        throw this._error("INVALID_API_RESPONSE", "Samplecut response is missing " + required[i] + ".");
      }
    }
    if (body.format !== "mp3") { throw this._error("INVALID_API_RESPONSE", "Samplecut did not return the requested MP3 format."); }
    var expiresAt = Date.parse(body.expires_at);
    if (!isFinite(expiresAt)) { throw this._error("INVALID_API_RESPONSE", "Samplecut returned an invalid download expiry time."); }
    if (expiresAt <= Date.now() + 5000) { throw this._error("DOWNLOAD_URL_EXPIRED", "The temporary Samplecut download link expired before it could be saved."); }
    var parsed;
    try { parsed = new this.node.url.URL(body.download_url); }
    catch (error) { throw this._error("INVALID_DOWNLOAD_URL", "Samplecut returned an invalid download URL."); }
    if (parsed.protocol !== "https:" || String(parsed.hostname || "").toLowerCase() !== API_HOST) {
      throw this._error("INVALID_DOWNLOAD_URL", "Samplecut returned an unexpected download host.");
    }
    return body;
  };

  Downloader.prototype._downloadFile = function (metadata, finalPath, partialPath, job, callbacks) {
    return this._downloadUrl(metadata.download_url, finalPath, partialPath, job, callbacks, 0).catch(function (error) {
      if (error && error.code === "DOWNLOAD_URL_EXPIRED") {
        error.message = "The temporary Samplecut link expired. Start the download again.";
      }
      throw error;
    });
  };

  Downloader.prototype._downloadUrl = function (downloadUrl, finalPath, partialPath, job, callbacks, redirectCount) {
    var self = this;
    this._throwIfCancelled(job);
    var parsed;
    try { parsed = new this.node.url.URL(downloadUrl); }
    catch (error) { return Promise.reject(this._error("INVALID_DOWNLOAD_URL", "Samplecut returned an invalid download URL.")); }
    if (parsed.protocol !== "https:" || String(parsed.hostname || "").toLowerCase() !== API_HOST) {
      return Promise.reject(this._error("INVALID_DOWNLOAD_URL", "Samplecut returned an unexpected download host."));
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var request = self.node.https.request({
        hostname: API_HOST,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: { "accept": "audio/mpeg, application/octet-stream", "x-client-name": "YT Timeline" }
      }, function (response) {
        job.response = response;
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          settled = true;
          job.request = null;
          job.response = null;
          if (redirectCount >= 3) { reject(self._error("TOO_MANY_REDIRECTS", "Samplecut download redirected too many times.")); return; }
          var nextUrl;
          try { nextUrl = new self.node.url.URL(response.headers.location, downloadUrl).toString(); }
          catch (error) { reject(self._error("INVALID_DOWNLOAD_URL", "Samplecut returned an invalid redirect URL.")); return; }
          self._downloadUrl(nextUrl, finalPath, partialPath, job, callbacks, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (response.statusCode === 404 || response.statusCode === 410) {
          response.resume();
          settled = true;
          job.request = null;
          job.response = null;
          reject(self._error("DOWNLOAD_URL_EXPIRED", "The temporary Samplecut download link has expired.", response.statusCode));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          settled = true;
          job.request = null;
          job.response = null;
          reject(self._error("FILE_DOWNLOAD_FAILED", "Samplecut file download failed with HTTP " + response.statusCode + ".", response.statusCode));
          return;
        }

        var contentType = String(response.headers["content-type"] || "").toLowerCase();
        if (contentType && contentType.indexOf("audio/") !== 0 && contentType.indexOf("application/octet-stream") !== 0) {
          response.resume();
          settled = true;
          job.request = null;
          job.response = null;
          reject(self._error("INVALID_AUDIO_RESPONSE", "Samplecut returned a non-audio file."));
          return;
        }
        var total = Number(response.headers["content-length"]) || 0;
        if (total > MAX_AUDIO_BYTES) {
          response.resume();
          settled = true;
          job.request = null;
          job.response = null;
          reject(self._error("AUDIO_TOO_LARGE", "The returned audio file is too large to save safely."));
          return;
        }

        var received = 0;
        var stream;
        try { stream = self.node.fs.createWriteStream(partialPath, { flags: "wx" }); }
        catch (error) { reject(error); return; }
        job.writeStream = stream;

        response.on("data", function (chunk) {
          received += chunk.length;
          if (received > MAX_AUDIO_BYTES) {
            response.destroy(self._error("AUDIO_TOO_LARGE", "The returned audio file is too large to save safely."));
            return;
          }
          if (total && callbacks.onProgress) { callbacks.onProgress(Math.min(100, received / total * 100)); }
        });
        response.on("error", function (error) {
          if (settled) { return; }
          settled = true;
          stream.destroy();
          job.request = null;
          job.response = null;
          job.writeStream = null;
          reject(self._networkError(error, job));
        });
        stream.on("error", function (error) {
          if (settled) { return; }
          settled = true;
          response.destroy();
          job.request = null;
          job.response = null;
          job.writeStream = null;
          reject(error);
        });
        stream.on("finish", function () {
          if (settled) { return; }
          settled = true;
          job.request = null;
          job.response = null;
          job.writeStream = null;
          if (job.cancelled) { reject(self._error("CANCELLED", "Download cancelled.")); return; }
          try {
            if (!received) { throw self._error("EMPTY_AUDIO", "Samplecut returned an empty audio file."); }
            self.node.fs.renameSync(partialPath, finalPath);
          } catch (error) { reject(error); return; }
          if (callbacks.onProgress && !total) { callbacks.onProgress(100); }
          resolve(finalPath);
        });
        response.pipe(stream);
      });
      job.request = request;
      request.setTimeout(API_TIMEOUT_MS, function () {
        request.destroy(self._error("DOWNLOAD_TIMEOUT", "The Samplecut MP3 download timed out after 120 seconds."));
      });
      request.on("error", function (error) {
        if (settled) { return; }
        settled = true;
        job.request = null;
        job.response = null;
        if (job.writeStream) { job.writeStream.destroy(); job.writeStream = null; }
        reject(self._networkError(error, job));
      });
      request.end();
    });
  };

  Downloader.prototype._apiError = function (statusCode, body, headers) {
    var details = body && body.error ? body.error : {};
    var code = String(details.code || "samplecut_error");
    var retryable = details.retryable === true;
    var retryAfter = Math.max(0, parseInt(headers && headers["retry-after"], 10) || 0);
    var messages = {
      invalid_request: "Samplecut rejected the request.",
      unsupported_url: "Samplecut does not support this URL.",
      invalid_range: "Samplecut rejected the requested audio range.",
      set_not_track: "Use a single video URL, not a playlist or album.",
      too_long: "The source is longer than Samplecut's 60-minute limit.",
      extract_failed: "Samplecut could not access this video. It may be private, removed, age-restricted, or region-blocked.",
      drm: "Samplecut cannot process DRM-protected media.",
      preview_only: "Samplecut received only a preview, not the complete audio.",
      rate_limited: retryAfter ? "Samplecut rate limit reached. Try again in " + retryAfter + " seconds." : "Samplecut rate limit reached. Try again later.",
      source_unreachable: "The source platform did not respond. Please try again.",
      api_disabled: "Samplecut API is temporarily unavailable. Please try again later.",
      internal: "Samplecut encountered a temporary server error."
    };
    var error = this._error(code.toUpperCase(), messages[code] || String(details.message || "Samplecut request failed."), statusCode);
    error.apiCode = code;
    error.retryable = retryable;
    error.retryAfter = retryAfter;
    return error;
  };

  Downloader.prototype._networkError = function (error, job) {
    if (job && job.cancelled) { return this._error("CANCELLED", "Download cancelled."); }
    if (error && (error.code === "API_TIMEOUT" || error.code === "DOWNLOAD_TIMEOUT" || error.code === "AUDIO_TOO_LARGE")) { return error; }
    var output = this._error("NETWORK_ERROR", "Could not reach Samplecut. Check your internet connection.");
    output.cause = error && error.message ? error.message : "";
    return output;
  };

  Downloader.prototype._wait = function (job, milliseconds) {
    var self = this;
    return new Promise(function (resolve, reject) {
      self._throwIfCancelled(job);
      job.retryReject = reject;
      job.retryTimer = global.setTimeout(function () {
        job.retryTimer = null;
        job.retryReject = null;
        if (job.cancelled) { reject(self._error("CANCELLED", "Download cancelled.")); return; }
        resolve();
      }, milliseconds);
    });
  };

  Downloader.prototype._uniqueBase = function (title, id) {
    var safeId = String(id || "audio").replace(/[^A-Za-z0-9_-]/g, "").substring(0, 16) || "audio";
    var stamp = new Date().toISOString().replace(/[-:T]/g, "").replace(/\..*$/, "");
    var stem = global.YT.Utils.sanitizeFileName(String(title || "Samplecut audio").substring(0, 70) + " [sc-" + safeId + "] " + stamp);
    var base = this.node.path.join(this.destinationPath, stem);
    var counter = 2;
    while (this.node.fs.existsSync(base + ".mp3") || this.node.fs.existsSync(base + ".mp3.part")) {
      base = this.node.path.join(this.destinationPath, stem + " (" + counter + ")");
      counter += 1;
    }
    return base;
  };

  Downloader.prototype._saveActiveJob = function (job, partialPath) {
    try { global.localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ partialPath: partialPath, destinationPath: job.destinationPath, prefix: job.prefix })); }
    catch (error) { this.logger.error("Could not save active-job marker: " + error.message); }
  };

  Downloader.prototype._clearActiveJob = function () {
    try { global.localStorage.removeItem(ACTIVE_JOB_KEY); } catch (ignore) { /* Non-critical. */ }
  };

  Downloader.prototype._recoverInterruptedJob = function () {
    var marker = null;
    try { marker = JSON.parse(global.localStorage.getItem(ACTIVE_JOB_KEY) || "null"); } catch (error) { marker = null; }
    if (!marker || !marker.partialPath || !/\.mp3\.part$/i.test(marker.partialPath)) { return; }
    try {
      var expectedDirectory = this.node.path.resolve(marker.destinationPath || "");
      var resolvedPartial = this.node.path.resolve(marker.partialPath);
      if (this.node.path.dirname(resolvedPartial) === expectedDirectory && this.node.path.basename(resolvedPartial).indexOf(String(marker.prefix || "")) === 0 && this.node.fs.existsSync(resolvedPartial)) {
        this.node.fs.unlinkSync(resolvedPartial);
      }
    } catch (error) { this.logger.error("Interrupted-job recovery failed: " + error.message); }
    this._clearActiveJob();
  };

  Downloader.prototype._cleanupJobFiles = function (job) {
    if (!job || job.completed || !job.prefix) { return; }
    var candidates = [
      this.node.path.join(job.destinationPath, job.prefix + ".mp3.part"),
      this.node.path.join(job.destinationPath, job.prefix + ".mp3")
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      try { if (this.node.fs.existsSync(candidates[i])) { this.node.fs.unlinkSync(candidates[i]); } } catch (ignore) { /* Locked files remain. */ }
    }
  };

  Downloader.prototype.cleanupStalePartials = function () {
    var self = this;
    try {
      var now = Date.now();
      this.node.fs.readdirSync(this.destinationPath).forEach(function (name) {
        if (!/\[sc-[A-Za-z0-9_-]{1,16}\] \d{14}(?: \(\d+\))?\.mp3\.part$/i.test(name)) { return; }
        var fullPath = self.node.path.join(self.destinationPath, name);
        var stat = self.node.fs.statSync(fullPath);
        if (now - stat.mtime.getTime() > 24 * 60 * 60 * 1000) {
          try { self.node.fs.unlinkSync(fullPath); } catch (ignore) { /* Never force-delete locked files. */ }
        }
      });
    } catch (error) { this.logger.error("Stale partial cleanup failed: " + error.message); }
  };

  Downloader.prototype.cancel = function () {
    var job = this.currentJob;
    if (!job) { return false; }
    job.cancelled = true;
    if (job.retryTimer) { global.clearTimeout(job.retryTimer); job.retryTimer = null; }
    if (job.retryReject) { job.retryReject(this._error("CANCELLED", "Download cancelled.")); job.retryReject = null; }
    try { if (job.request) { job.request.destroy(this._error("CANCELLED", "Download cancelled.")); } } catch (ignoreRequest) { /* Already closed. */ }
    try { if (job.response) { job.response.destroy(this._error("CANCELLED", "Download cancelled.")); } } catch (ignoreResponse) { /* Already closed. */ }
    try { if (job.writeStream) { job.writeStream.destroy(); } } catch (ignoreStream) { /* Already closed. */ }
    return true;
  };

  Downloader.prototype._throwIfCancelled = function (job) {
    if (job && job.cancelled) { throw this._error("CANCELLED", "Download cancelled."); }
  };

  Downloader.prototype._error = function (code, message, statusCode) {
    var error = new Error(message);
    error.code = code;
    error.statusCode = statusCode || 0;
    return error;
  };

  Downloader.prototype.fileExists = function (filePath) {
    try { return this.node.fs.existsSync(filePath) && this.node.fs.statSync(filePath).isFile(); } catch (error) { return false; }
  };

  Downloader.prototype.openFolder = function (pathToOpen) {
    this.node.childProcess.spawn("explorer.exe", [pathToOpen], { windowsHide: false, shell: false, detached: true });
  };

  global.YT = global.YT || {};
  global.YT.Downloader = Downloader;
}(window));
