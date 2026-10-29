[CmdletBinding()]
param(
    [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$DestinationRoot = (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.yttimeline.premiere'),
    [switch]$EnableDebugMode
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Assert-File {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Label is missing: $Path"
    }
}

if ($env:OS -ne 'Windows_NT') { throw 'YT Timeline supports Windows 10/11 only.' }

$manifestPath = Join-Path $SourceRoot 'CSXS\manifest.xml'
Assert-File $manifestPath 'CEP manifest'
Assert-File (Join-Path $SourceRoot 'index.html') 'Panel entry point'
Assert-File (Join-Path $SourceRoot 'browser\dist\Salos.YouTubeBrowser.exe') 'Windows YouTube browser (run browser\build.ps1 first)'
$payloadManifest = Join-Path $SourceRoot 'installer\payload-files.sha256'
Assert-File $payloadManifest 'Payload checksum manifest'
foreach ($line in Get-Content -LiteralPath $payloadManifest) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+)$') { throw "Invalid payload checksum entry: $line" }
    $expectedHash = $Matches[1].ToUpperInvariant()
    $relativePath = $Matches[2]
    $payloadPath = Join-Path $SourceRoot $relativePath
    Assert-File $payloadPath $relativePath
    if ((Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash -ne $expectedHash) { throw "Payload checksum mismatch: $relativePath" }
}

Write-Host "Installing YT Timeline to:`n$DestinationRoot" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null

$entries = @('CSXS', 'css', 'js', 'jsx', 'assets', 'index.html', '.debug', 'README.md')
foreach ($entry in $entries) {
    $source = Join-Path $SourceRoot $entry
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination $DestinationRoot -Recurse -Force
    }
}
New-Item -ItemType Directory -Path (Join-Path $DestinationRoot 'browser\dist') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $SourceRoot 'browser\dist\Salos.YouTubeBrowser.exe') -Destination (Join-Path $DestinationRoot 'browser\dist') -Force
New-Item -ItemType Directory -Path (Join-Path $DestinationRoot 'downloads') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $DestinationRoot 'logs') -Force | Out-Null

$legacyBin = Join-Path $DestinationRoot 'bin'
if (Test-Path -LiteralPath $legacyBin -PathType Container) {
    Write-Warning 'A legacy bin folder is present from an older build. YT Timeline no longer uses yt-dlp or FFmpeg; remove that folder manually after confirming it contains nothing you need.'
}

if ($EnableDebugMode) {
    foreach ($version in 9..12) {
        $key = "HKCU:\Software\Adobe\CSXS.$version"
        New-Item -Path $key -Force | Out-Null
        New-ItemProperty -Path $key -Name 'PlayerDebugMode' -PropertyType String -Value '1' -Force | Out-Null
    }
    Write-Host 'CEP PlayerDebugMode enabled for CSXS 9-12 (current user).' -ForegroundColor Yellow
} else {
    Write-Host 'Unsigned development build: rerun with -EnableDebugMode if Premiere hides the panel.' -ForegroundColor Yellow
}

Write-Host "`nInstallation complete." -ForegroundColor Green
Write-Host '1. Fully close and restart Premiere Pro.'
Write-Host '2. Open Window > Extensions (Legacy) > YT Timeline (menu wording varies by version).'
Write-Host '3. Open and save a project, then activate the target sequence.'
Write-Host '4. The YouTube window requires Microsoft Edge WebView2 Runtime (separate from the included .NET runtime).'
