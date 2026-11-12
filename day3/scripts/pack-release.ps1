$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root "dist"
if (!(Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}
$stageDir = Join-Path $distDir "course-hub-release"
if (Test-Path $stageDir) {
  Remove-Item -Recurse -Force $stageDir
}
New-Item -ItemType Directory -Path $stageDir | Out-Null

$releaseItems = @(
  "manifest.json",
  "core.js",
  "background.js",
  "content.js",
  "player-rate-core.js",
  "player-enhancer.js",
  "popup.html",
  "popup.js",
  "icons",
  "README.md"
)

foreach ($item in $releaseItems) {
  $src = Join-Path $root $item
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination $stageDir -Recurse -Force
  }
}

$zipPath = Join-Path $distDir "course-hub-extension.zip"
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}
Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force
Write-Host "Release package created: $zipPath"
