(function (global) {
  "use strict";

  function validateYouTubeUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) { return { valid: false, message: "Avval YouTube havolasini kiriting." }; }
    if (raw.length > 2048) { return { valid: false, message: "Havola juda uzun." }; }

    var anchor = document.createElement("a");
    anchor.href = raw;
    var protocol = String(anchor.protocol || "").toLowerCase();
    var host = String(anchor.hostname || "").toLowerCase().replace(/\.$/, "");
    var path = String(anchor.pathname || "");

    if (protocol !== "https:" && protocol !== "http:") {
      return { valid: false, message: "To'liq http:// yoki https:// havola kiriting." };
    }
    if (anchor.username || anchor.password || anchor.port) {
      return { valid: false, message: "Bu YouTube havola formati qo'llab-quvvatlanmaydi." };
    }

    var youtubeHosts = { "youtube.com": true, "www.youtube.com": true, "m.youtube.com": true, "music.youtube.com": true };
    var shortHosts = { "youtu.be": true, "www.youtu.be": true };
    var idPattern = /^[A-Za-z0-9_-]{11}$/;
    var videoId = "";

    if (shortHosts[host]) {
      videoId = path.split("/")[1] || "";
    } else if (youtubeHosts[host]) {
      var routeMatch = path.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      if (routeMatch) {
        videoId = routeMatch[1];
      } else if (path === "/watch" || path === "/watch/") {
        var query = String(anchor.search || "").replace(/^\?/, "").split("&");
        for (var i = 0; i < query.length; i += 1) {
          var pair = query[i].split("=");
          if (safeDecode(pair[0] || "") === "v") {
            videoId = safeDecode((pair[1] || "").replace(/\+/g, "%20"));
            break;
          }
        }
      }
    }

    if (!idPattern.test(videoId)) {
      return { valid: false, message: "YouTube video, Shorts, jonli efir yoki youtu.be havolasini kiriting." };
    }
    return { valid: true, url: "https://www.youtube.com/watch?v=" + videoId, videoId: videoId };
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (error) { return ""; }
  }

  function sanitizeFileName(value) {
    var name = String(value || "audio")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
      .replace(/[. ]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) { name = "audio"; }
    var reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
    if (reserved.test(name)) { name = "_" + name; }
    return name.substring(0, 110).replace(/[. ]+$/g, "") || "audio";
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    return hours ? hours + ":" + pad(minutes) + ":" + pad(secs) : minutes + ":" + pad(secs);
  }

  function pad(number) { return number < 10 ? "0" + number : String(number); }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) { return value + " B"; }
    var units = ["KB", "MB", "GB"];
    var index = -1;
    do { value /= 1024; index += 1; } while (value >= 1024 && index < units.length - 1);
    return value.toFixed(value >= 10 ? 1 : 2) + " " + units[index];
  }

  function basename(path) {
    return String(path || "").replace(/\\/g, "/").split("/").pop();
  }

  function friendlyError(error) {
    var code = error && error.code ? String(error.code).toUpperCase() : "";
    var retryAfter = error && Number(error.retryAfter) > 0 ? Number(error.retryAfter) : 0;
    var messages = {
      CANCELLED: "Yuklash bekor qilindi.",
      JOB_RUNNING: "Boshqa yuklash hali tugamagan.",
      NO_PROJECT: "Avval Premiere Pro loyihasini oching.",
      NO_ACTIVE_SEQUENCE: "Avval kerakli sequence'ni oching yoki faollashtiring.",
      SEQUENCE_CHANGED: "Faol sequence o'zgardi. Kerakli timeline'da qayta urinib ko'ring.",
      NO_AUDIO_TRACK: "Faol sequence'da A1 audio yo'li mavjud emas.",
      FILE_NOT_FOUND: "Yuklangan audio fayli topilmadi.",
      IMPORT_FAILED: "Premiere audio faylini import qila olmadi.",
      IMPORT_NOT_FOUND: "Audio import qilindi, lekin Project panelida aniqlanmadi.",
      NOT_IMPORTED: "Avval audioni Premiere loyihasiga import qilish kerak.",
      DURATION_UNAVAILABLE: "Premiere audio davomiyligini aniqlay olmadi.",
      TIMELINE_CONFLICT: "Bu oraliqda A1 band. Playhead'ni bo'sh joyga ko'chiring.",
      PLACEMENT_FAILED: "Audio import qilindi, ammo A1 ga qo'shilmadi. A1 qulflanmaganini tekshiring.",
      PLACEMENT_UNVERIFIED: "Audio qo'shildi, lekin natijani xavfsiz tekshirib bo'lmadi.",
      TRACK_CREATE_FAILED: "Bo'sh audio yo'li topilmadi va yangi yo'l yaratib bo'lmadi.",
      API_RESPONSE_TOO_LARGE: "Samplecut kutilmagan darajada katta javob qaytardi.",
      INVALID_API_RESPONSE: "Samplecut noto'g'ri javob qaytardi.",
      DOWNLOAD_URL_EXPIRED: "Vaqtinchalik yuklash havolasi eskirdi. Qayta yuklang.",
      INVALID_DOWNLOAD_URL: "Samplecut noto'g'ri yuklash havolasini qaytardi.",
      TOO_MANY_REDIRECTS: "Yuklash havolasi juda ko'p marta yo'naltirildi.",
      FILE_DOWNLOAD_FAILED: "Audio faylini yuklab bo'lmadi.",
      INVALID_AUDIO_RESPONSE: "Samplecut audio fayli o'rniga boshqa ma'lumot qaytardi.",
      AUDIO_TOO_LARGE: "Audio fayli xavfsiz yuklash uchun juda katta.",
      EMPTY_AUDIO: "Samplecut bo'sh audio fayli qaytardi.",
      API_TIMEOUT: "Samplecut 120 soniya ichida javob bermadi.",
      DOWNLOAD_TIMEOUT: "Audio 120 soniya ichida yuklanmadi.",
      NETWORK_ERROR: "Tarmoq xatosi. Internet aloqasini tekshiring.",
      INVALID_REQUEST: "Samplecut so'rovni qabul qilmadi.",
      UNSUPPORTED_URL: "Samplecut bu havolani qo'llab-quvvatlamaydi.",
      SET_NOT_TRACK: "Playlist emas, bitta video havolasini kiriting.",
      TOO_LONG: "Samplecut bu videoni davomiylik cheklovi sabab qabul qilmadi. Qisqaroq video havolasini sinab ko'ring.",
      EXTRACT_FAILED: "Video yopiq, o'chirilgan yoki hududiy cheklangan bo'lishi mumkin.",
      DRM: "DRM bilan himoyalangan audioni yuklab bo'lmaydi.",
      PREVIEW_ONLY: "Samplecut faqat qisqa preview oldi, to'liq audio mavjud emas.",
      SOURCE_UNREACHABLE: "Manba xizmatiga ulanib bo'lmadi. Keyinroq qayta urinib ko'ring.",
      API_DISABLED: "Samplecut xizmati vaqtincha o'chirilgan. Keyinroq urinib ko'ring.",
      INTERNAL: "Samplecut serverida vaqtinchalik xato yuz berdi.",
      HOST_EXCEPTION: "Premiere ichki amalni bajara olmadi.",
      HOST_ERROR: "Premiere amali bajarilmadi."
    };
    if (code === "RATE_LIMITED") {
      return retryAfter ? "Samplecut limiti tugadi. " + retryAfter + " soniyadan keyin qayta urining." : "Samplecut limiti tugadi. Keyinroq qayta urining.";
    }
    if (messages[code]) { return messages[code]; }

    var message = error && error.message ? error.message : String(error || "Noma'lum xato.");
    if (/cancel/i.test(message)) { return "Yuklash bekor qilindi."; }
    if (/ENOSPC|no space/i.test(message)) { return "Diskda yetarli bo'sh joy yo'q."; }
    if (/not writable|cannot be created/i.test(message)) { return "Tanlangan papkaga fayl yozib bo'lmaydi."; }
    if (/CEP Node\.js is unavailable/i.test(message)) { return "CEP Node.js ishlamayapti. Extension manifestini tekshiring."; }
    if (/Premiere did not respond/i.test(message)) { return "Premiere javob bermadi. Qayta urinib ko'ring."; }
    if (/network|internet|timed out|timeout|resolve host|connection/i.test(message)) { return "Tarmoq xatosi. Internet aloqasini tekshiring."; }
    return "Amalni bajarib bo'lmadi. Jurnalni tekshiring.";
  }

  global.YT = global.YT || {};
  global.YT.Utils = {
    validateYouTubeUrl: validateYouTubeUrl,
    sanitizeFileName: sanitizeFileName,
    formatDuration: formatDuration,
    formatBytes: formatBytes,
    basename: basename,
    friendlyError: friendlyError
  };
}(window));
