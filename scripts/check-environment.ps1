[CmdletBinding()]
param(
    [string]$ExtensionRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$script:Failures = 0

function Write-Check {
    param([string]$Name, [bool]$Passed, [string]$Detail)
    if ($Passed) {
        Write-Host "[OK]   $Name - $Detail" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $Name - $Detail" -ForegroundColor Red
        $script:Failures++
    }
}

Write-Host "YT Timeline environment check" -ForegroundColor Cyan
Write-Host "Root: $ExtensionRoot"

$isWindowsHost = $env:OS -eq 'Windows_NT'
Write-Check 'Windows' $isWindowsHost ($(if ($isWindowsHost) { [System.Environment]::OSVersion.VersionString } else { 'Windows 10/11 is required' }))

$manifestPath = Join-Path $ExtensionRoot 'CSXS\manifest.xml'
$manifestValid = $false
$manifestDetail = 'manifest.xml is missing'
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    try {
        [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
        $manifestValid = $manifest.ExtensionManifest.ExtensionBundleId -eq 'com.yttimeline.premiere'
        $manifestDetail = if ($manifestValid) { 'valid extension bundle ID' } else { 'unexpected extension bundle ID' }
    } catch {
        $manifestDetail = $_.Exception.Message
    }
}
Write-Check 'CEP manifest' $manifestValid $manifestDetail

$requiredFiles = @(
    'index.html',
    'js\CSInterface.js',
    'js\app.js',
    'js\downloader.js',
    'js\premiere.js',
    'js\library.js',
    'js\browser.js',
    'browser\dist\Salos.YouTubeBrowser.exe',
    'jsx\host.jsx'
)
$missingFiles = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $ExtensionRoot $_) -PathType Leaf) })
Write-Check 'Extension files' ($missingFiles.Count -eq 0) ($(if ($missingFiles.Count) { 'missing: ' + ($missingFiles -join ', ') } else { 'all required files are present' }))

$adobeRoots = @(
    (Join-Path $env:ProgramFiles 'Adobe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Adobe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) }
$premiereFolders = @($adobeRoots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Adobe Premiere Pro*' } })
Write-Check 'Premiere Pro installation' ($premiereFolders.Count -gt 0) ($(if ($premiereFolders.Count) { ($premiereFolders.FullName -join '; ') } else { 'not found under Program Files\Adobe' }))

$cepFlags = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction SilentlyContinue
$nodeEnabled = $cepFlags -match '--enable-nodejs'
$mixedContext = $cepFlags -match '--mixed-context'
Write-Check 'CEP Node.js flags' ($nodeEnabled -and $mixedContext) ($(if ($nodeEnabled -and $mixedContext) { 'Node.js and mixed context are enabled' } else { 'manifest must enable Node.js and mixed context' }))

$webviewAvailable = $false
$browserExecutable = Join-Path $ExtensionRoot 'browser\dist\Salos.YouTubeBrowser.exe'
if ($isWindowsHost -and (Test-Path -LiteralPath $browserExecutable -PathType Leaf)) {
    try {
        $runtimeCheck = Start-Process -FilePath $browserExecutable -ArgumentList '--check-runtime' -Wait -PassThru -WindowStyle Hidden
        $webviewAvailable = $runtimeCheck.ExitCode -eq 0
    } catch { $webviewAvailable = $false }
}
Write-Check 'WebView2 Runtime' $webviewAvailable 'Required for the separate YouTube window; install Microsoft Edge WebView2 Evergreen Runtime if missing.'

$samplecutContract = $null
try {
    $samplecutContract = Invoke-RestMethod -Uri 'https://api.samplecut.app/v1/openapi.json' -Method Get -TimeoutSec 15
    $hasDownloadEndpoint = $null -ne $samplecutContract.paths.'/v1/downloads'.post
    $isOpenApi31 = [string]$samplecutContract.openapi -like '3.1*'
    Write-Check 'Samplecut OpenAPI' ($hasDownloadEndpoint -and $isOpenApi31) ($(if ($hasDownloadEndpoint -and $isOpenApi31) { 'OpenAPI 3.1 contract and POST /v1/downloads are reachable' } else { 'unexpected API contract' }))
} catch {
    Write-Check 'Samplecut OpenAPI' $false ('unreachable: ' + $_.Exception.Message)
}

if ($script:Failures -gt 0) {
    Write-Host "`n$script:Failures check(s) failed." -ForegroundColor Red
    exit 1
}

Write-Host "`nEnvironment looks ready. Restart Premiere Pro after installing the extension." -ForegroundColor Green
exit 0
