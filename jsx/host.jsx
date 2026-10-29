/* YT Timeline — Premiere Pro ExtendScript host bridge. ES3-compatible. */
(function () {
  if (!$._YTT_) { $._YTT_ = {}; }

  var TICKS_PER_SECOND = 254016000000;

  function quote(value) {
    return '"' + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/[\u0000-\u001f]/g, " ") + '"';
  }

  function stringify(value) {
    if (value === null || typeof value === "undefined") { return "null"; }
    if (typeof value === "string") { return quote(value); }
    if (typeof value === "number") { return isFinite(value) ? String(value) : "null"; }
    if (typeof value === "boolean") { return value ? "true" : "false"; }
    var output = [];
    var i;
    if (value instanceof Array) {
      for (i = 0; i < value.length; i += 1) { output.push(stringify(value[i])); }
      return "[" + output.join(",") + "]";
    }
    for (var key in value) {
      if (value.hasOwnProperty(key) && typeof value[key] !== "function") { output.push(quote(key) + ":" + stringify(value[key])); }
    }
    return "{" + output.join(",") + "}";
  }

  function ok(data) { return stringify({ ok: true, data: data || {} }); }
  function fail(code, message, details) { return stringify({ ok: false, code: code, message: message, details: details || null }); }

  function parseRequest(encoded) {
    var decoded = decodeURIComponent(encoded);
    if (typeof JSON !== "undefined" && JSON.parse) { return JSON.parse(decoded); }
    return eval("(" + decoded + ")");
  }

  function getProject() {
    try {
      if (app && app.project && app.project.rootItem) { return app.project; }
    } catch (error) { /* handled below */ }
    return null;
  }

  function getSequenceId(sequence) {
    try { return String(sequence.sequenceID); } catch (error) { return String(sequence.name); }
  }

  function getCollectionLength(collection, namedLength) {
    try {
      if (typeof collection[namedLength] === "number") { return collection[namedLength]; }
      if (typeof collection.numItems === "number") { return collection.numItems; }
      if (typeof collection.length === "number") { return collection.length; }
    } catch (error) { /* Return zero. */ }
    return 0;
  }

  function normalizePath(path) {
    try { return File(path).fsName.replace(/\//g, "\\").toLowerCase(); }
    catch (error) { return String(path).replace(/\//g, "\\").toLowerCase(); }
  }

  function findByPathRecursive(item, targetPath) {
    if (!item) { return null; }
    try {
      if (item.getMediaPath && normalizePath(item.getMediaPath()) === targetPath) { return item; }
    } catch (ignoreMediaPath) { /* Bins and generated items have no media path. */ }
    try {
      var children = item.children;
      var count = getCollectionLength(children, "numItems");
      for (var i = 0; i < count; i += 1) {
        var found = findByPathRecursive(children[i], targetPath);
        if (found) { return found; }
      }
    } catch (ignoreChildren) { /* Leaf item. */ }
    return null;
  }

  function findProjectItem(rootItem, mediaPath) {
    try {
      if (rootItem.findItemsMatchingMediaPath) {
        var matches = rootItem.findItemsMatchingMediaPath(File(mediaPath).fsName, 1);
        var matchCount = getCollectionLength(matches, "numItems");
        if (matchCount > 0) { return matches[0]; }
      }
    } catch (nativeSearchError) { /* Fall back to recursive search. */ }
    return findByPathRecursive(rootItem, normalizePath(mediaPath));
  }

  function currentSequence(expectedId) {
    var project = getProject();
    if (!project) { return { error: fail("NO_PROJECT", "Avval Premiere Pro loyihasini oching.") }; }
    var sequence = project.activeSequence;
    if (!sequence) { return { error: fail("NO_ACTIVE_SEQUENCE", "Avval sequence'ni oching yoki faollashtiring.") }; }
    var sequenceId = getSequenceId(sequence);
    if (expectedId && String(expectedId) !== sequenceId) {
      return { error: fail("SEQUENCE_CHANGED", "Faol sequence o'zgardi. Kerakli timeline'da qayta urining.") };
    }
    return { project: project, sequence: sequence, sequenceId: sequenceId };
  }

  function getPremiereStatus() {
    var project = getProject();
    if (!project) { return fail("NO_PROJECT", "Avval Premiere Pro loyihasini oching."); }
    return ok({ application: "Premiere Pro", projectName: String(project.name || "Nomsiz loyiha"), hasActiveSequence: !!project.activeSequence });
  }

  function getActiveSequenceInfo() {
    var state = currentSequence("");
    if (state.error) { return state.error; }
    var audioTrackCount = getCollectionLength(state.sequence.audioTracks, "numTracks");
    var position = state.sequence.getPlayerPosition();
    return ok({
      sequenceId: state.sequenceId,
      name: String(state.sequence.name || "Sequence"),
      playheadTicks: String(position.ticks),
      playheadSeconds: Number(position.seconds),
      audioTrackCount: audioTrackCount
    });
  }

  function getSequencePlayhead() {
    var state = currentSequence("");
    if (state.error) { return state.error; }
    var position = state.sequence.getPlayerPosition();
    return ok({ sequenceId: state.sequenceId, ticks: String(position.ticks), seconds: Number(position.seconds) });
  }

  function importAudioFile(payload) {
    var state = currentSequence(payload.expectedSequenceId || "");
    if (state.error) { return state.error; }
    var file = File(payload.path || "");
    if (!file.exists) { return fail("FILE_NOT_FOUND", "Yuklangan audio fayli topilmadi."); }
    var target = normalizePath(file.fsName);
    var existing = findProjectItem(state.project.rootItem, file.fsName);
    if (existing) {
      $._YTT_._lastAudioItem = existing;
      $._YTT_._lastAudioPath = target;
      return ok({ imported: false, reused: true, nodeId: String(existing.nodeId || ""), name: String(existing.name || file.name) });
    }

    var imported = false;
    try { imported = state.project.importFiles([file.fsName], true, state.project.rootItem, false); }
    catch (error) { return fail("IMPORT_FAILED", "Premiere audio faylini import qila olmadi.", String(error)); }
    if (!imported) { return fail("IMPORT_FAILED", "Premiere audio faylini import qila olmadi."); }

    var item = findProjectItem(state.project.rootItem, file.fsName);
    if (!item) { return fail("IMPORT_NOT_FOUND", "Audio import qilindi, lekin Project panelida aniqlanmadi."); }
    $._YTT_._lastAudioItem = item;
    $._YTT_._lastAudioPath = target;
    return ok({ imported: true, reused: false, nodeId: String(item.nodeId || ""), name: String(item.name || file.name) });
  }

  function sourceDurationTicks(projectItem) {
    try {
      var inPoint = projectItem.getInPoint(2);
      var outPoint = projectItem.getOutPoint(2);
      var duration = Number(outPoint.ticks) - Number(inPoint.ticks);
      if (duration > 0) { return duration; }
    } catch (audioError) { /* Try the all-media points. */ }
    try {
      var anyIn = projectItem.getInPoint();
      var anyOut = projectItem.getOutPoint();
      var anyDuration = Number(anyOut.ticks) - Number(anyIn.ticks);
      if (anyDuration > 0) { return anyDuration; }
    } catch (allMediaError) { /* Return zero. */ }
    return 0;
  }

  function trackHasOverlap(track, startTicks, endTicks) {
    var clips = track.clips;
    var count = getCollectionLength(clips, "numItems");
    for (var i = 0; i < count; i += 1) {
      var clipStart = Number(clips[i].start.ticks);
      var clipEnd = Number(clips[i].end.ticks);
      if (clipStart < endTicks && clipEnd > startTicks) { return true; }
    }
    return false;
  }

  function verifyPlacement(track, projectItem, startTicks) {
    var clips = track.clips;
    var count = getCollectionLength(clips, "numItems");
    for (var i = 0; i < count; i += 1) {
      var clip = clips[i];
      try {
        if (Math.abs(Number(clip.start.ticks) - startTicks) < 2 && clip.projectItem && String(clip.projectItem.nodeId) === String(projectItem.nodeId)) { return true; }
      } catch (error) { /* Continue searching. */ }
    }
    return false;
  }

  function formatSeconds(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    function pad(value) { return value < 10 ? "0" + value : String(value); }
    return (hours ? pad(hours) + ":" : "") + pad(minutes) + ":" + pad(secs);
  }

  function addBottomAudioTrack(sequence) {
    var beforeAudio = getCollectionLength(sequence.audioTracks, "numTracks");
    var beforeVideo = getCollectionLength(sequence.videoTracks, "numTracks");
    try {
      app.enableQE();
      var qeSequence = qe.project.getActiveSequence();
      if (!qeSequence || !qeSequence.addTracks) {
        return { ok: false, message: "Premiere yangi audio yo'l yarata olmadi." };
      }
      qeSequence.addTracks(0);
    } catch (error) {
      return { ok: false, message: "Premiere yangi audio yo'l yarata olmadi.", details: String(error) };
    }
    var afterAudio = getCollectionLength(sequence.audioTracks, "numTracks");
    var afterVideo = getCollectionLength(sequence.videoTracks, "numTracks");
    if (afterAudio !== beforeAudio + 1 || afterVideo !== beforeVideo) {
      return { ok: false, message: "Yangi audio yo'l natijasini xavfsiz tekshirib bo'lmadi." };
    }
    return { ok: true, trackIndex: afterAudio - 1 };
  }

  function freeAudioTrackIndices(sequence, startTicks, endTicks) {
    var indices = [];
    var count = getCollectionLength(sequence.audioTracks, "numTracks");
    for (var i = count - 1; i >= 0; i -= 1) {
      if (!trackHasOverlap(sequence.audioTracks[i], startTicks, endTicks)) { indices.push(i); }
    }
    return indices;
  }

  function addAudioToTimeline(payload) {
    var state = currentSequence(payload.expectedSequenceId || "");
    if (state.error) { return state.error; }

    var file = File(payload.path || "");
    if (!file.exists) { return fail("FILE_NOT_FOUND", "Yuklangan audio fayli topilmadi."); }
    var targetPath = normalizePath(file.fsName);
    var item = null;
    if ($._YTT_._lastAudioItem && $._YTT_._lastAudioPath === targetPath) { item = $._YTT_._lastAudioItem; }
    if (!item) { item = findProjectItem(state.project.rootItem, file.fsName); }
    if (!item) { return fail("NOT_IMPORTED", "Timeline'ga qo'shishdan oldin audioni loyihaga import qiling."); }

    var playhead = state.sequence.getPlayerPosition();
    var startTicks = Number(playhead.ticks);
    var durationTicks = sourceDurationTicks(item);
    if (!durationTicks) { return fail("DURATION_UNAVAILABLE", "Premiere audio davomiyligini aniqlay olmadi."); }
    var endTicks = startTicks + durationTicks;
    var candidates = freeAudioTrackIndices(state.sequence, startTicks, endTicks);
    var createdTrack = false;

    while (true) {
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        var trackIndex = candidates[candidateIndex];
        var track = state.sequence.audioTracks[trackIndex];
        var beforeCount = getCollectionLength(track.clips, "numItems");
        var result = false;
        try { result = track.overwriteClip(item, String(playhead.ticks)); }
        catch (placementError) { result = false; }
        var afterCount = getCollectionLength(track.clips, "numItems");
        if (afterCount > beforeCount && verifyPlacement(track, item, startTicks)) {
          return ok({
            added: true,
            trackIndex: trackIndex,
            trackName: String(track.name || ("A" + (trackIndex + 1))),
            createdTrack: createdTrack,
            ticks: String(playhead.ticks),
            seconds: Number(playhead.seconds),
            timecode: formatSeconds(Number(playhead.seconds)),
            durationSeconds: durationTicks / TICKS_PER_SECOND
          });
        }
        if (afterCount > beforeCount || result === true) {
          return fail("PLACEMENT_UNVERIFIED", "Audio qo'shildi, lekin natijani xavfsiz tekshirib bo'lmadi.");
        }
      }

      if (createdTrack) { break; }
      var created = addBottomAudioTrack(state.sequence);
      if (!created.ok) { return fail("TRACK_CREATE_FAILED", created.message, created.details || null); }
      createdTrack = true;
      candidates = [created.trackIndex];
    }

    return fail("PLACEMENT_FAILED", "Audio uchun yozish mumkin bo'lgan yo'l topilmadi.");
  }

  $._YTT_.getPremiereStatus = getPremiereStatus;
  $._YTT_.getActiveSequenceInfo = getActiveSequenceInfo;
  $._YTT_.getSequencePlayhead = getSequencePlayhead;
  $._YTT_.importAudioFile = importAudioFile;
  $._YTT_.addAudioToTimeline = addAudioToTimeline;

  $._YTT_.dispatch = function (encodedRequest) {
    try {
      var request = parseRequest(encodedRequest);
      var payload = request.payload || {};
      if (request.action === "getPremiereStatus") { return getPremiereStatus(); }
      if (request.action === "getActiveSequenceInfo") { return getActiveSequenceInfo(); }
      if (request.action === "getSequencePlayhead") { return getSequencePlayhead(); }
      if (request.action === "importAudioFile") { return importAudioFile(payload); }
      if (request.action === "addAudioToTimeline") { return addAudioToTimeline(payload); }
      return fail("UNKNOWN_ACTION", "Noma'lum Premiere amali.");
    } catch (error) {
      return fail("HOST_EXCEPTION", "Premiere ichki amalni bajara olmadi.", String(error));
    }
  };
}());
