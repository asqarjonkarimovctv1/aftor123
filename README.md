# YT Timeline

YT Timeline is a Windows CEP panel for Adobe Premiere Pro. It sends a user-authorized YouTube URL to the free Samplecut API, immediately downloads the returned temporary MP3 to a local folder, imports it into the current Premiere project, and places it on A1 at the current playhead.

The panel UI and user-facing errors are in Uzbek. The fixed 2:1 horizontal composition places the single download action on the left and up to five recent items on the right. It has no internal scrolling, repeated labels, nested cards, button outlines, or MP3 metadata details.

Use it only with audio you own or have permission to download and reuse. The panel does not bypass private-video access, DRM, age or regional restrictions, login requirements, or source-platform permissions.

## Architecture

```text
CEP panel UI
    │
    ├─ CEP Node.js core https module
    │    POST https://api.samplecut.app/v1/downloads
    │    GET the short-lived download_url immediately
    │    stream to local .mp3.part → atomic rename to .mp3
    │
    └─ CSInterface.evalScript()
         Premiere ExtendScript import + verified A1 placement
```

The API request is made from CEP's Node context, not the browser context. Samplecut intentionally blocks cross-origin browser calls through CORS. No account, API key, local server, or external executable is required.

## Samplecut contract used

The implementation was written against the official [developer documentation](https://samplecut.app/developers) and [OpenAPI 3.1 contract](https://api.samplecut.app/v1/openapi.json):

- Endpoint: `POST https://api.samplecut.app/v1/downloads`
- Request: `{"url":"…","format":"mp3","response":"url"}`
- Headers: `Content-Type: application/json`, `X-Client-Name: YT Timeline`
- Success: HTTP `201` with `id`, `download_url`, `expires_at`, `title`, `filename`, `format`, and `track_duration_sec`
- Request timeout: 120 seconds
- Temporary link: expires after about one hour and is never persisted; the MP3 is downloaded immediately
- Limits: 10 API calls per 10 minutes per IP and sources up to 60 minutes
- No SLA: the service is free and best effort

HTTP 500 and 502 responses are retried twice with short backoff. A 429 is not blindly retried because `Retry-After` can be several minutes; the exact wait is shown to the user. A 503/`api_disabled` response is reported as temporary service unavailability.

## Workflow

1. Validate a single YouTube video, Shorts, live, embed, or `youtu.be` URL.
2. Verify that a Premiere project, active sequence, A1, CEP Node.js, and a writable local destination exist.
3. Call Samplecut synchronously and wait for the MP3 metadata.
4. Validate that the temporary URL is HTTPS on `api.samplecut.app` and has not expired.
5. Stream the MP3 to a unique `.mp3.part` file with real byte progress when `Content-Length` is available.
6. Rename the completed file atomically to `.mp3`.
7. Import or reuse the same absolute media path in Premiere.
8. Recheck that the active sequence has not changed.
9. Scan audio tracks from the bottom upward and select the lowest track whose target range is empty.
10. If every existing audio track is occupied or unwritable, create one bottom audio track through a guarded QE fallback and verify the audio/video track counts.
11. Place with `Track.overwriteClip()` only on an empty range and verify the resulting TrackItem.

## Project layout

```text
yt-timeline/
├── CSXS/manifest.xml          CEP bundle and Node.js runtime flags
├── index.html                 Panel UI
├── css/styles.css             Premiere-style responsive theme
├── js/
│   ├── CSInterface.js         Minimal CEP bridge used by this panel
│   ├── app.js                 UI and workflow controller
│   ├── downloader.js          Samplecut API and streamed local download
│   ├── logger.js              Redacted rotating diagnostic log
│   ├── premiere.js            Async evalScript bridge
│   ├── storage.js             Local settings and recent-audio history
│   └── utils.js               Validation, filenames, and formatting
├── jsx/host.jsx               Premiere ExtendScript integration
├── downloads/                 Default MP3 destination
├── logs/                      Local redacted diagnostic log
├── tests/downloader.test.js   Samplecut contract/error unit tests
└── scripts/
    ├── check-environment.ps1
    └── install.ps1
```

## Requirements

- Windows 10 or 11
- A CEP-capable Adobe Premiere Pro version 14.0 or newer
- Internet access to `api.samplecut.app`
- An open Premiere project and active sequence with an A1 track
- Permission to download and use the source material

No separate Node.js installation is required for the extension. CEP provides its own Node runtime, enabled by `--enable-nodejs` and `--mixed-context` in the manifest. The code uses Node core `https` instead of built-in `fetch`, which keeps it compatible with older CEP Node versions.

## Check and install

```powershell
Set-Location 'D:\2\bot\yt-timeline'
.\scripts\check-environment.ps1
.\scripts\install.ps1 -EnableDebugMode
```

The installer uses the current-user CEP folder:

```text
%APPDATA%\Adobe\CEP\extensions\com.yttimeline.premiere
```

`-EnableDebugMode` sets `PlayerDebugMode=1` for the current user under CSXS 9 through 12. It is required for this unsigned development build and is deliberately opt-in.

After installation, fully restart Premiere Pro and open:

```text
Window > Extensions (Legacy) > YT Timeline
```

The exact menu label varies between Premiere releases.

## Usage

1. Open a project and activate the intended sequence.
2. Put the playhead over an empty range on A1.
3. Paste a permitted YouTube URL.
4. Select a local download folder if desired.
5. Click **DOWNLOAD + ADD TO TIMELINE**.

Samplecut processing does not expose a percentage, so the panel shows a moving activity bar instead of inventing a number. During the MP3 transfer it switches to a real percentage when the server supplies a total byte size; otherwise the activity bar keeps moving. The completed `100%` indicator clears automatically after a short confirmation.

## Cancellation and interrupted panels

Cancellation destroys the active HTTPS request/response and the local write stream. Partial files are removed. The panel stores only an exact local active-job marker—not the YouTube URL or temporary download URL—so a panel reload can remove its own interrupted `.mp3.part` file. Completed MP3 files are never automatically deleted.

The temporary Samplecut URL is held in memory only long enough to fetch the file. History stores the title, final local path, duration, size, time, and placement status. It never stores the source URL or Samplecut URL.

## API errors shown to users

- `invalid_request` / `unsupported_url` — request or link rejected
- `set_not_track` — playlist or album instead of one video
- `too_long` — source exceeds 60 minutes
- `extract_failed` — private, removed, age-restricted, or region-blocked
- `drm` / `preview_only` — source cannot yield the requested complete audio
- `rate_limited` / HTTP 429 — displays `Retry-After`
- `source_unreachable` / HTTP 502 — retried twice, then reported
- `api_disabled` / HTTP 503 — service temporarily unavailable
- `internal` / HTTP 500 — retried twice, then reported
- invalid or expired `download_url` — asks the user to start again
- API or MP3 transfer timeout — 120-second timeout
- network, disk, permissions, empty file, and oversized response failures

Sanitized diagnostics are written to `logs/yt-timeline.log`. The logger redacts all HTTP(S) URLs.

## Timeline safety behavior

The panel does not create a sequence. At placement time it scans existing audio tracks from the bottom upward, so A3 is preferred over A2 and A1 when all three are empty at the playhead. An occupied track is skipped without moving or overwriting its clips.

Before placement, `host.jsx` obtains the source duration and checks every candidate track for overlap with `[playhead, playhead + duration)`. On an empty range, `overwriteClip()` avoids insert/ripple behavior. Premiere's clip count, start time, and ProjectItem identity are verified afterward.

If no existing track can accept the clip, the panel uses Premiere's undocumented QE `addTracks(0)` fallback to add one bottom audio track. This fallback runs only in that case and placement proceeds only when the standard DOM confirms exactly one audio track was added and no video track was added. QE is not a public supported API and can change between Premiere versions.

If placement fails, the MP3 can remain imported and available through **ADD AGAIN**. Import alone is never reported as successful timeline placement.

## Security notes

- The YouTube URL is passed as JSON through Node `https`; no shell command is constructed.
- Only recognized YouTube hosts and 11-character video IDs are accepted by the panel.
- Samplecut responses are schema-checked before use.
- Temporary download URLs must be HTTPS and remain on `api.samplecut.app`; redirects are bounded.
- JSON responses are capped at 1 MB and audio transfers at 512 MB.
- Files are written with exclusive-create mode to avoid overwriting existing data.
- Metadata is rendered with `textContent`, never `innerHTML`.
- No API key, browser cookie, login session, token, localhost service, yt-dlp, or FFmpeg is used.

## Testing

Run unit/static checks:

```powershell
node .\tests\downloader.test.js
node .\tests\ui-localization.test.js
node .\tests\host-placement.test.js
.\scripts\check-environment.ps1
```

The downloader test verifies the required Samplecut response fields, expiry and host rejection, 429/502/503 mapping, unique local names, and the absence of yt-dlp/FFmpeg requirements. The UI test verifies Uzbek labels, metadata removal, and throttled progress rendering. The host test verifies bottom-up track selection, cached ProjectItem lookup, and guarded creation of one new audio track.

Automated tests can verify the API client and a mocked Premiere DOM. Only an interactive Premiere smoke test can prove host-specific import and timeline behavior:

1. Start Premiere and open a disposable test project.
2. Activate a sequence with an empty A1 range.
3. Download a short permitted source.
4. Confirm the MP3 appears in the Project panel and at the playhead on A1.
5. Move the playhead over existing A1 audio and use **ADD AGAIN**; confirm collision refusal without timeline changes.
6. Lock A1 and repeat; confirm the imported MP3 remains while placement is reported as failed.
7. Start a download and cancel it; confirm no matching `.mp3.part` remains.

## CEP compatibility

This project intentionally uses legacy CEP + ExtendScript. Adobe's PProPanel sample notes that Premiere Pro 25.6 introduced UXP as CEP's successor while CEP remained available during a transition. A future release without **Extensions (Legacy)** will require a UXP migration.

Adobe references:

- [Adobe CEP resources](https://github.com/Adobe-CEP/CEP-Resources)
- [Adobe Premiere Pro PProPanel sample](https://github.com/Adobe-CEP/Samples/tree/master/PProPanel)
- [Premiere Pro ExtendScript API guide](https://ppro-scripting.docsforadobe.dev/)
