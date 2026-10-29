[CmdletBinding()]
param(
    [string]$InstallerPath = (Join-Path $PSScriptRoot 'output\Salos-YT-Timeline-Setup-1.6.0.exe')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
    throw "Installer not found: $InstallerPath"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$hashManifestPath = Join-Path $PSScriptRoot 'payload-files.sha256'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'Salos-YT-Timeline-Installer-Verify'
$resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$resolvedTest = [System.IO.Path]::GetFullPath($testRoot).TrimEnd('\')
if (-not $resolvedTest.StartsWith($resolvedTemp + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $resolvedTest) -ne 'Salos-YT-Timeline-Installer-Verify') {
    throw "Unsafe verification directory: $resolvedTest"
}

if (Test-Path -LiteralPath $resolvedTest) {
    Remove-Item -LiteralPath $resolvedTest -Recurse -Force
}
$installDir = Join-Path $resolvedTest 'extension'
$installLog = Join-Path $resolvedTest 'install.log'
New-Item -ItemType Directory -Path (Join-Path $installDir 'downloads') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir 'logs') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $installDir 'downloads\preserve-test.txt') -Value 'keep' -Encoding ASCII
Set-Content -LiteralPath (Join-Path $installDir 'logs\preserve-test.txt') -Value 'keep' -Encoding ASCII

$installArgs = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$installDir", "/LOG=$installLog")
$installProcess = Start-Process -FilePath $InstallerPath -ArgumentList $installArgs -Wait -PassThru -WindowStyle Hidden
if ($installProcess.ExitCode -ne 0) { throw "Silent install failed with exit code $($installProcess.ExitCode). See $installLog" }

foreach ($line in Get-Content -LiteralPath $hashManifestPath) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+)$') { throw "Invalid hash line: $line" }
    $expectedHash = $Matches[1].ToUpperInvariant()
    $relativePath = $Matches[2]
    $installedPath = Join-Path $installDir $relativePath
    if (-not (Test-Path -LiteralPath $installedPath -PathType Leaf)) { throw "Installed file is missing: $relativePath" }
    $actualHash = (Get-FileHash -LiteralPath $installedPath -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) { throw "Installed file hash mismatch: $relativePath" }
}

$uninstallerPath = Join-Path $installDir 'unins000.exe'
if (-not (Test-Path -LiteralPath $uninstallerPath -PathType Leaf)) { throw 'Uninstaller was not created.' }
$uninstallLog = Join-Path $resolvedTest 'uninstall.log'
$uninstallProcess = Start-Process -FilePath $uninstallerPath -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$uninstallLog") -Wait -PassThru -WindowStyle Hidden
if ($uninstallProcess.ExitCode -ne 0) { throw "Silent uninstall failed with exit code $($uninstallProcess.ExitCode). See $uninstallLog" }

foreach ($relativePath in @('CSXS\manifest.xml', 'index.html', 'js\app.js', 'css\styles.css', 'browser\dist\Salos.YouTubeBrowser.exe')) {
    if (Test-Path -LiteralPath (Join-Path $installDir $relativePath)) { throw "Plugin file remained after uninstall: $relativePath" }
}
foreach ($relativePath in @('downloads\preserve-test.txt', 'logs\preserve-test.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $installDir $relativePath) -PathType Leaf)) { throw "User data was removed during uninstall: $relativePath" }
}

Write-Host 'PASS: install payload hashes match the frozen plugin.' -ForegroundColor Green
Write-Host 'PASS: uninstaller removed plugin code and preserved downloads/logs.' -ForegroundColor Green
Write-Host "Logs: $resolvedTest" -ForegroundColor Cyan
