"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const TICKS = 254016000000;
const mediaPath = "C:\\Audio\\test.mp3";
let playheadSeconds = 20;
let nativeSearches = 0;

global.$ = {};
global.File = function File(value) { return { exists: true, fsName: value, name: "test.mp3" }; };

const item = {
  nodeId: "node-audio",
  name: "test.mp3",
  children: { numItems: 0 },
  getMediaPath() { return mediaPath; },
  getInPoint() { return { ticks: "0" }; },
  getOutPoint() { return { ticks: String(10 * TICKS) }; }
};

function makeClips() { return { numItems: 0 }; }

function appendClip(track, projectItem, startSeconds, durationSeconds) {
  const index = track.clips.numItems;
  track.clips[index] = {
    start: { ticks: String(startSeconds * TICKS) },
    end: { ticks: String((startSeconds + durationSeconds) * TICKS) },
    projectItem
  };
  track.clips.numItems += 1;
}

function makeTrack(name) {
  const track = {
    name,
    clips: makeClips(),
    overwriteClip(projectItem, ticks) {
      appendClip(track, projectItem, Number(ticks) / TICKS, 10);
      return true;
    }
  };
  return track;
}

const audioTracks = { numTracks: 3 };
audioTracks[0] = makeTrack("A1");
audioTracks[1] = makeTrack("A2");
audioTracks[2] = makeTrack("A3");
appendClip(audioTracks[0], { nodeId: "other-1" }, 20, 10);

const sequence = {
  sequenceID: "seq-1",
  name: "Main",
  audioTracks,
  videoTracks: { numTracks: 1 },
  getPlayerPosition() { return { ticks: String(playheadSeconds * TICKS), seconds: playheadSeconds }; }
};

const rootItem = {
  children: { 0: item, numItems: 1 },
  findItemsMatchingMediaPath(value) { nativeSearches += 1; return String(value).toLowerCase() === mediaPath.toLowerCase() ? [item] : []; }
};

global.app = {
  project: { name: "Demo", path: "C:\\Projects\\Demo.prproj", rootItem, activeSequence: sequence, importFiles() { return true; } },
  enableQE() {}
};

global.qe = {
  project: {
    getActiveSequence() {
      return {
        addTracks(videoCount) {
          assert.strictEqual(videoCount, 0);
          const index = audioTracks.numTracks;
          audioTracks[index] = makeTrack("A" + (index + 1));
          audioTracks.numTracks += 1;
        }
      };
    }
  }
};

eval(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"));

function call(action, payload) {
  return JSON.parse($._YTT_.dispatch(encodeURIComponent(JSON.stringify({ action, payload: payload || {} }))));
}

const imported = call("importAudioFile", { path: mediaPath, expectedSequenceId: "seq-1" });
assert.strictEqual(imported.ok, true);
assert.strictEqual(imported.data.reused, true);
assert.strictEqual(nativeSearches, 1);

const lowestExisting = call("addAudioToTimeline", { path: mediaPath, expectedSequenceId: "seq-1" });
assert.strictEqual(lowestExisting.ok, true);
assert.strictEqual(lowestExisting.data.trackIndex, 2);
assert.strictEqual(lowestExisting.data.trackName, "A3");
assert.strictEqual(lowestExisting.data.createdTrack, false);
assert.strictEqual(nativeSearches, 1, "cached ProjectItem should avoid another project-tree scan");

playheadSeconds = 40;
for (let i = 0; i < audioTracks.numTracks; i += 1) {
  appendClip(audioTracks[i], { nodeId: "occupied-" + i }, 40, 10);
}

const newTrack = call("addAudioToTimeline", { path: mediaPath, expectedSequenceId: "seq-1" });
assert.strictEqual(newTrack.ok, true);
assert.strictEqual(newTrack.data.trackIndex, 3);
assert.strictEqual(newTrack.data.trackName, "A4");
assert.strictEqual(newTrack.data.createdTrack, true);
assert.strictEqual(audioTracks.numTracks, 4);
assert.strictEqual(sequence.videoTracks.numTracks, 1);

assert.strictEqual(call("getProjectInfo").data.projectPath, "C:\\Projects\\Demo.prproj");
assert.strictEqual(call("getActiveSequenceInfo").data.projectPath, "C:\\Projects\\Demo.prproj");
const expectedProjectPath = app.project.path;
assert.deepStrictEqual(call("matchProjectMediaPaths", { expectedProjectPath, paths: [mediaPath, "C:\\Other\\unrelated.mp3"] }).data.paths, [mediaPath]);
app.project.path = "C:\\Projects\\Other.prproj";
const trackCountBefore = audioTracks.numTracks;
assert.strictEqual(call("importAudioFile", { path: mediaPath, expectedSequenceId: "seq-1", expectedProjectPath }).code, "PROJECT_CHANGED");
assert.strictEqual(call("addAudioToTimeline", { path: mediaPath, expectedSequenceId: "seq-1", expectedProjectPath }).code, "PROJECT_CHANGED");
assert.strictEqual(audioTracks.numTracks, trackCountBefore);
app.project = { path: expectedProjectPath, rootItem: { children: { numItems: 0 } }, activeSequence: sequence };
assert.strictEqual(call("addAudioToTimeline", { path: mediaPath, expectedSequenceId: "seq-1", expectedProjectPath }).code, "NOT_IMPORTED", "a reopened project must not reuse a cached ProjectItem from the previous project instance");

console.log("PASS host placement: lowest free track, cached media lookup, verified new audio track");
