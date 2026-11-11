Add-Type -AssemblyName System.Drawing

$appRoot = Split-Path -Parent $PSScriptRoot
$electronExe = Join-Path $appRoot "node_modules\electron\dist\electron.exe"
$outIco = Join-Path $appRoot "build\icon.ico"
$outPng = Join-Path $appRoot "build\icon.png"

$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($electronExe)
$fs = [System.IO.File]::OpenWrite($outIco)
$icon.Save($fs)
$fs.Close()

$bmp = $icon.ToBitmap()
$bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$icon.Dispose()

Write-Output "Successfully extracted original electron default icon to $outIco and $outPng"
