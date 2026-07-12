param(
  [string]$SourcePath = (Join-Path $PSScriptRoot "..\assets\brand\xingluotab-icon-master.png"),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\public\icon")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
$master = [System.Drawing.Bitmap]::new($resolvedSource)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

try {
  foreach ($size in @(16, 32, 48, 64, 96, 128)) {
    $target = [System.Drawing.Bitmap]::new(
      $size,
      $size,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($master, 0, 0, $size, $size)
      $target.Save((Join-Path $OutputDirectory "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $graphics.Dispose()
      $target.Dispose()
    }
  }
}
finally {
  $master.Dispose()
}
