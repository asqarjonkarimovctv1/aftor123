# YT Timeline 1.6.0

YT Timeline is a Windows CEP panel for Adobe Premiere Pro. Its WebView2 YouTube window lets you browse, search and watch videos, then send the selected video's URL to the panel. The panel sends that user-authorized URL to Samplecut, downloads the returned MP3 into a project-specific folder, imports it into the current Premiere project, and places it on a free audio track at the current playhead.

The panel UI and user-facing errors are in Uzbek. Download controls are on the left and the active saved project's scrollable audio library is on the right. The history is no longer capped at five or ten entries.

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

The API request is made from CEP's Node context, not the browser context. Samplecut intentionally blocks cross-origin browser calls through CORS. The downloader needs no API key, local server, yt-dlp or FFmpeg. The separate YouTube window uses the included Windows x64 executable and the installed Microsoft Edge WebView2 Runtime.

## YouTube window and project library

Click **YouTube'ni ochish**, search or navigate to a video, then click **Yuklash bo'limiga yuborish**. The window hides and the normalized video URL appears in the CEP panel. Click **YUKLASH → TIMELINE** to download. The native browser is a separate companion window, owned by Premiere when its foreground host window can be identified. It is not docked inside the CEP panel, and it does not launch the default system browser. YouTube's full site is not loaded into an iframe.

The remote site runs in WebView2 without CEP Node access or a JavaScript-to-native host object. Only the native toolbar can send a selected video through the subprocess pipe, and the URL is validated again in the CEP panel. Only HTTPS browsing is allowed. New-window links open in the same view; generic browser file downloads are cancelled in favor of the panel's audio workflow. Account sign-in and playback availability remain subject to YouTube and WebView2 support; no login cookies are extracted. The browser profile lives under `%LOCALAPPDATA%\Salos\YT Timeline\Browser`.

Save the Premiere `.prproj` file before downloading. New files default to the Windows Downloads known folder, under `YT Timeline\<project name> [<path hash>]\`. Projects with the same name in different directories get different folders and histories. The folder button changes the parent download directory for future downloads and leaves existing files in place. The library's folder icon opens the current project's directory.

The panel refreshes project identity while idle and after each operation. All history writes capture the project that started the download. Import and timeline commands also verify the expected project path, so switching to another project during a download leaves the MP3 in the original project's library instead of importing it into the wrong project. **+** reuses an existing local audio file. Clearing the history clears only the selected project's list and never deletes its audio files.

Existing unscoped history is preserved. A legacy item is added to a project's new list only when Premiere confirms that the media file is imported in that project. Older audio files are not moved, which preserves existing Premiere media references. Renaming or using Save As to a different `.prproj` path creates a distinct project library.

## Samplecut contract used

The implementation was written against the official [developer documentation](https://samplecut.app/developers) and [OpenAPI 3.1 contract](https://api.samplecut.app/v1/openapi.json):

- Endpoint: `POST https://api.samplecut.app/v1/downloads`
- Request: `{"url":"…","format":"mp3","response":"url"}`
- Headers: `Content-Type: application/json`, `X-Client-Name: YT Timeline`
- Success: HTTP `201` with `id`, `download_url`, `expires_at`, `title`, `filename`, `format`, and `track_duration_sec`
- Processing deadline: 120 seconds total, including DNS, connection setup, response reads, retry delays, and all attempts
- MP3 transfer: 120 seconds to receive response headers across redirects, then a 120-second inactivity timeout while saving the audio
- Temporary link: expires after about one hour and is never persisted; the MP3 is downloaded immediately
- Limits: 10 API calls per 10 minutes per IP and sources up to 60 minutes
- No SLA: the service is free and best effort

HTTP 500 and 502 responses are retried at most twice with short backoff, only when the API explicitly marks the error retryable and the shared processing deadline permits another attempt. A 429 is not blindly retried because `Retry-After` can be several minutes; the exact wait is shown to the user. A 503/`api_disabled` response is reported as temporary service unavailability.

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
- x64 Windows for the YouTube companion, plus Microsoft Edge WebView2 Evergreen Runtime
- A CEP-capable Adobe Premiere Pro version 14.0 or newer
- Internet access to `api.samplecut.app`
- An open Premiere project and active sequence with an A1 track
- Permission to download and use the source material

No separate Node.js installation is required for the extension. CEP provides its own Node runtime, enabled by `--enable-nodejs` and `--mixed-context` in the manifest. The code uses Node core `https` instead of built-in `fetch`, which keeps it compatible with older CEP Node versions.

## Check and install

For the Windows ZIP distribution, extract the whole archive and run `Install-Windows.cmd`. It installs the panel and companion for the current user and enables CEP debug mode for the unsigned extension. Restart Premiere afterward. The included companion is self-contained; users do not need to install the .NET SDK or runtime separately. WebView2 Evergreen Runtime is still required and can be installed from [Microsoft's WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/).

For a source checkout, first build the companion with the .NET 10.0.403 SDK pinned in `browser/global.json`:

```powershell
.\browser\build.ps1
```

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
2. Save the project and put the playhead at the desired insertion time.
3. Paste a permitted YouTube URL, or select one through the plugin's YouTube window.
4. Select a local download folder if desired.
5. Click **DOWNLOAD + ADD TO TIMELINE**.

Samplecut processing does not expose a percentage, so the panel shows a moving activity bar instead of inventing a number. During the MP3 transfer it switches to a real percentage when the server supplies a total byte size; otherwise the activity bar keeps moving. The completed `100%` indicator clears automatically after a short confirmation.

### Long waits

Samplecut must fetch and convert the source before returning a download URL. The panel cannot accelerate that remote work. During stages without a measurable percentage, the progress row shows elapsed time. After 30 seconds of processing, it explains that Samplecut is still being awaited and the download can be cancelled. Automatic retries show the attempt count and share the same two-minute processing budget.

The diagnostic log records the duration of each panel stage and each Samplecut attempt, including HTTP status or connection error, without recording source URLs. Use those timings to distinguish conversion, transfer, import, and timeline delays. Once an audio file has downloaded, use the history item's **+** button to add it again without another download or conversion.

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
- API timeout — shared 120-second processing deadline; MP3 timeout — connection/header deadline or 120 seconds without transfer activity
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
node .\tests\downloader-timing.test.js
node .\tests\ui-localization.test.js
node .\tests\app-progress.test.js
node .\tests\project-library.test.js
node .\tests\browser-bridge.test.js
node .\tests\host-placement.test.js
dotnet run --project .\browser\tests\VideoUrl.Tests.csproj
.\scripts\check-environment.ps1
```

The downloader test verifies the required Samplecut response fields, expiry and host rejection, 429/502/503 mapping, unique local names, and the absence of yt-dlp/FFmpeg requirements. The UI test verifies Uzbek labels, metadata removal, and throttled progress rendering. The host test verifies bottom-up track selection, cached ProjectItem lookup, and guarded creation of one new audio track.

The timing test uses a controlled clock and mocked HTTPS requests to exercise stalled connections, trickling responses, deadline and cancellation cleanup, and the shared retry budget. The progress test exercises elapsed-time rendering, retry counts, stage transitions, and cleanup after success, failure, and cancellation. These tests do not measure the live Samplecut service or real Premiere performance.

Project-library checks exercise same-name projects, Windows path normalization, 30-item histories, scoped clearing and safe legacy migration. Browser bridge tests cover subprocess lifecycle, startup failures and validated URL handoff; C# tests cover the native video URL parser. The companion can be cross-compiled on Linux, but its WebView2 navigation, Premiere window ownership, sign-in behavior and install/uninstall flow require a Windows smoke test.

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
