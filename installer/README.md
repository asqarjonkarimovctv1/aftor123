# Salos YT Timeline Windows installer

This directory builds YT Timeline 1.6.0 and its Windows x64 WebView2 companion into a per-user Windows installer.

The checked-in `output\Salos-YT-Timeline-Setup-1.5.3.exe` is an older build. It does not contain the YouTube companion, per-project library or waiting-time fixes. The current payload manifest describes 1.6.0, not that old executable. A 1.6.0 Windows ZIP can instead be installed through its `Install-Windows.cmd` launcher.

## Build

Install .NET SDK 10.0.403 (see `browser/global.json`) and Inno Setup 6, then build the companion and installer:

```powershell
.\browser\build.ps1
.\installer\build.ps1
```

The build stops if any frozen plugin payload file differs from `payload-files.sha256`.

The companion is published self-contained for Windows x64, so end users need no separate .NET installation. They do need Microsoft Edge WebView2 Evergreen Runtime. Rebuilding the companion with a different SDK can change the binary hash; review and regenerate the frozen payload manifest for an intentional release instead of skipping validation.

## Verify install and uninstall

```powershell
.\installer\verify-installer.ps1
```

The verifier installs into an isolated temporary directory, checks every plugin file hash, uninstalls it, confirms plugin code was removed, and confirms `downloads` and `logs` were preserved.

## Distribution

Distribute a freshly built `output\Salos-YT-Timeline-Setup-1.6.0.exe` together with its `.sha256` checksum file, or the Windows ZIP containing `Install-Windows.cmd`. Installation uses the current user's account without administrator privileges. It enables Adobe CEP PlayerDebugMode because this development CEP extension is unsigned. It installs no background service or startup task. Browsing data and project downloads are kept outside the extension directory and remain after uninstall.

The executable is not code-signed unless a trusted publisher certificate is supplied separately. An unsigned download may trigger Windows SmartScreen reputation warnings.
