[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'Install the .NET 10 SDK before building the YouTube browser.' }
Push-Location $PSScriptRoot
try {
    & dotnet publish (Join-Path $PSScriptRoot 'Salos.YouTubeBrowser.csproj') --configuration Release --runtime win-x64 --self-contained true --output (Join-Path $PSScriptRoot 'dist') -p:RestoreLockedMode=true
    if ($LASTEXITCODE -ne 0) { throw "Browser build failed: $LASTEXITCODE" }
} finally { Pop-Location }
Write-Host 'Windows x64 YouTube browser built in browser\dist.' -ForegroundColor Green
