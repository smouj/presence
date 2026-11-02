<#
    Builds the Presence tray application with the in-box C# compiler.
    Usage:  powershell -ExecutionPolicy Bypass -File build.ps1 -SourceDir <repo path>
#>
param(
    [Parameter(Mandatory = $true)][string]$SourceDir,
    [string]$OutputName = "Presence.exe"
)

$ErrorActionPreference = "Stop"

$work = Join-Path $env:TEMP ("presence-build-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null

Copy-Item (Join-Path $SourceDir "desktop\PresenceTray.cs") $work
Copy-Item (Join-Path $SourceDir "assets\branding\presence.ico") $work

$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $csc)) { throw "csc.exe not found" }

$target = Join-Path $work $OutputName
& $csc /nologo /target:winexe /optimize+ /win32icon:"$work\presence.ico" /out:"$target" "$work\PresenceTray.cs" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll
if (-not (Test-Path $target)) { throw "Compilation failed" }

$bin = Join-Path $SourceDir "desktop\bin"
New-Item -ItemType Directory -Path $bin -Force | Out-Null
Copy-Item $target (Join-Path $bin $OutputName) -Force
Write-Output $target
