# Salos YT Timeline Windows installer

This directory builds the unchanged YT Timeline 1.5.3 CEP payload into a per-user Windows installer.

## Build

Install Inno Setup 6, then run:

```powershell
.\installer\build.ps1
```

The build stops if any frozen plugin payload file differs from `payload-files.sha256`.

## Verify install and uninstall

```powershell
.\installer\verify-installer.ps1
```

The verifier installs into an isolated temporary directory, checks every plugin file hash, uninstalls it, confirms plugin code was removed, and confirms `downloads` and `logs` were preserved.

## Distribution

Distribute `output\Salos-YT-Timeline-Setup-1.5.3.exe` together with its `.sha256` checksum file. It installs without administrator privileges. The installer enables Adobe CEP PlayerDebugMode for the current user because this development CEP extension is unsigned. It does not install tracking, background services, startup tasks, or third-party software.

The executable is not code-signed unless a trusted publisher certificate is supplied separately. An unsigned download may trigger Windows SmartScreen reputation warnings.
