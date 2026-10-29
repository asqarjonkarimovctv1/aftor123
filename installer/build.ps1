[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$installerRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $installerRoot
$manifestPath = Join-Path $projectRoot 'CSXS\manifest.xml'
$scriptPath = Join-Path $installerRoot 'Salos-YT-Timeline.iss'
$hashManifestPath = Join-Path $installerRoot 'payload-files.sha256'
$logoPath = Join-Path $installerRoot 'assets\salos-logo.png'
$expectedVersion = '1.6.0'

foreach ($requiredPath in @($manifestPath, $scriptPath, $hashManifestPath, $logoPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required installer input is missing: $requiredPath"
    }
}

[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$actualVersion = [string]$manifest.ExtensionManifest.ExtensionBundleVersion
if ($actualVersion -ne $expectedVersion) {
    throw "Plugin version changed from frozen installer version $expectedVersion to $actualVersion. Review and refresh the installer manifest first."
}

$hashErrors = @()
foreach ($line in Get-Content -LiteralPath $hashManifestPath) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+)$') {
        $hashErrors += "Invalid hash line: $line"
        continue
    }
    $expectedHash = $Matches[1].ToUpperInvariant()
    $relativePath = $Matches[2]
    $payloadPath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) {
        $hashErrors += "Missing payload file: $relativePath"
        continue
    }
    $actualHash = (Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) {
        $hashErrors += "Payload changed: $relativePath"
    }
}
if ($hashErrors.Count -gt 0) {
    throw ($hashErrors -join [Environment]::NewLine)
}

$isccCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
)
$iscc = $isccCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $iscc) {
    throw 'Inno Setup 6 compiler was not found. Install JRSoftware.InnoSetup from winget.'
}

Write-Host 'Frozen plugin payload verified.' -ForegroundColor Green
& $iscc $scriptPath
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compiler failed with exit code $LASTEXITCODE." }

$outputPath = Join-Path $installerRoot "output\Salos-YT-Timeline-Setup-$expectedVersion.exe"
if (-not (Test-Path -LiteralPath $outputPath -PathType Leaf)) {
    throw "Compiler completed but output is missing: $outputPath"
}

$file = Get-Item -LiteralPath $outputPath
$hash = Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
$signature = Get-AuthenticodeSignature -LiteralPath $outputPath
$checksumPath = $outputPath + '.sha256'
Set-Content -LiteralPath $checksumPath -Value ($hash.Hash + ' *' + $file.Name) -Encoding ASCII
Write-Host "Installer: $outputPath" -ForegroundColor Cyan
Write-Host ("Size: {0:N2} MB" -f ($file.Length / 1MB))
Write-Host "SHA256: $($hash.Hash)"
Write-Host "Checksum: $checksumPath"
Write-Host "Signature: $($signature.Status)"
