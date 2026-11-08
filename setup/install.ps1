<#
.SYNOPSIS
  Installs everything the AI reel studio needs on Windows 10/11. Safe to re-run: finished steps are skipped.

.DESCRIPTION
  Run from the studio folder (the repo root) in Windows PowerShell 5.1 or PowerShell 7:
    powershell -ExecutionPolicy Bypass -File setup\install.ps1
  Options:
    -SkipSystem     do not install FFmpeg, Node.js, Python or Chrome with winget (you install them yourself)
    -WithRemotion   also install the optional Remotion studio in Tools\Remotion
    -BaseModel      also download the smaller ggml-base.bin Whisper model (used by HyperFrames)

  What it does (every download is checked against the SHA-256 in setup\versions.json):
    1. winget: FFmpeg, Node.js LTS, Python 3.11, Google Chrome (only those that are missing)
    2. whisper.cpp v1.9.2 CPU build    -> Tools\whisper.cpp\Release
    3. Whisper models                   -> Tools\models
    4. yt-dlp                           -> Tools\bin
    5. npm ci (puppeteer-core, HyperFrames) -> Tools\node_modules
    6. Python venv with OpenCV, MediaPipe, SciPy -> Tools\vision-venv
    7. Tools\paths.json (where each tool is), then the setup check
#>
param([switch]$SkipSystem, [switch]$WithRemotion, [switch]$BaseModel)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is 10x slower with the progress bar on PS 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Studio = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Tools = Join-Path $Studio 'Tools'
$V = Get-Content (Join-Path $PSScriptRoot 'versions.json') -Raw | ConvertFrom-Json
Set-Location $Studio

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    ok  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    !!  $text" -ForegroundColor Yellow }

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Get-Verified($url, $dest, $sha) {
    if ((Test-Path $dest) -and ((Get-FileHash $dest -Algorithm SHA256).Hash.ToLower() -eq $sha)) { Ok "$(Split-Path $dest -Leaf) (already here, hash ok)"; return }
    $tmp = "$dest.part"
    Write-Host "    downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    $got = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $sha) { Remove-Item $tmp -Force; throw "SHA-256 mismatch for $url (got $got, expected $sha)" }
    Move-Item $tmp $dest -Force
    Ok "$(Split-Path $dest -Leaf) (hash ok)"
}

function Winget-Install($id, $label) {
    if (-not (Have 'winget')) { throw "winget is not available. Install $label yourself, then re-run with -SkipSystem." }
    Write-Host "    winget install $id"
    winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Host
    Refresh-Path
}

function Find-Python {
    # MediaPipe 0.10.14 needs Python 3.9-3.12. Prefer 3.11 (tested).
    foreach ($ver in '3.11', '3.12', '3.10') {
        if (Have 'py') {
            $exe = & py "-$ver" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $exe) { return $exe.Trim() }
        }
    }
    foreach ($p in "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
                   "C:\Program Files\Python311\python.exe", "C:\Program Files\Python312\python.exe") {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Find-Chrome {
    foreach ($p in "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                   "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

# ---------------------------------------------------------------------------------------------------------------
Step '1/7  System tools: FFmpeg, Node.js, Python, Chrome'
Refresh-Path
if (-not $SkipSystem) {
    if (-not (Have 'ffmpeg')) { Winget-Install 'Gyan.FFmpeg' 'FFmpeg' }
    if (-not (Have 'node')) { Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js' }
    if (-not (Find-Python)) { Winget-Install 'Python.Python.3.11' 'Python 3.11' }
    if (-not (Find-Chrome)) { Winget-Install 'Google.Chrome' 'Google Chrome' }
}
foreach ($c in 'ffmpeg', 'ffprobe', 'node', 'npm') {
    if (Have $c) { Ok "$c -> $((Get-Command $c).Source)" } else { throw "$c not found on PATH. Install it (see setup\INSTALL.md), open a new terminal and re-run." }
}
$Python = Find-Python
if (-not $Python) { throw 'Python 3.10-3.12 not found. Install Python 3.11 (winget install Python.Python.3.11) and re-run.' }
Ok "python -> $Python"

New-Item -ItemType Directory -Force (Join-Path $Tools 'bin'), (Join-Path $Tools 'models'), (Join-Path $Tools 'downloads') | Out-Null

# ---------------------------------------------------------------------------------------------------------------
Step "2/7  whisper.cpp $($V.whisper.version)"
$whisperExe = Join-Path $Tools 'whisper.cpp\Release\whisper-cli.exe'
if (Test-Path $whisperExe) { Ok 'whisper-cli.exe already installed' } else {
    $zip = Join-Path $Tools 'downloads\whisper-bin-x64.zip'
    Get-Verified $V.whisper.windowsZip $zip $V.whisper.windowsZipSha256
    Expand-Archive -Path $zip -DestinationPath (Join-Path $Tools 'whisper.cpp') -Force
    if (-not (Test-Path $whisperExe)) { throw 'whisper-cli.exe not found after unzipping' }
    Ok 'whisper-cli.exe'
}

# ---------------------------------------------------------------------------------------------------------------
Step '3/7  Whisper models'
foreach ($m in $V.models) {
    if ($m.file -eq 'ggml-base.bin' -and -not $BaseModel) { Write-Host "    skip ggml-base.bin (optional; re-run with -BaseModel)"; continue }
    Get-Verified $m.url (Join-Path $Tools "models\$($m.file)") $m.sha256
}

# ---------------------------------------------------------------------------------------------------------------
Step "4/7  yt-dlp $($V.ytdlp.version)"
Get-Verified ($V.ytdlp.base + 'yt-dlp.exe') (Join-Path $Tools 'bin\yt-dlp.exe') $V.ytdlp.sha256.'yt-dlp.exe'
Set-Content -Path (Join-Path $Tools 'bin\yt-dlp.conf') -Value '--js-runtimes node' -Encoding Ascii

# ---------------------------------------------------------------------------------------------------------------
Step '5/7  Node packages (puppeteer-core, HyperFrames)'
Push-Location $Tools
try {
    if (Test-Path 'node_modules\puppeteer-core') { Ok 'Tools\node_modules already installed' }
    else { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci failed in Tools' } ; Ok 'npm ci' }
} finally { Pop-Location }
if ($WithRemotion) {
    Push-Location (Join-Path $Tools 'Remotion')
    try {
        if (Test-Path 'node_modules\remotion') { Ok 'Remotion already installed' }
        else { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci failed in Tools\Remotion' }; Ok 'Remotion' }
    } finally { Pop-Location }
}

# ---------------------------------------------------------------------------------------------------------------
Step '6/7  Python vision venv (numpy, OpenCV, MediaPipe, SciPy, Pillow)'
$venvPy = Join-Path $Tools 'vision-venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
    & $Python -m venv (Join-Path $Tools 'vision-venv')
    if ($LASTEXITCODE) { throw 'could not create the venv' }
}
& $venvPy -m pip install --disable-pip-version-check -q --upgrade pip
& $venvPy -m pip install --disable-pip-version-check -q -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE) { throw 'pip install failed' }
Ok (& $venvPy -c "import numpy, cv2, mediapipe, scipy, PIL; print('numpy', numpy.__version__, '| opencv', cv2.__version__, '| mediapipe', mediapipe.__version__)")

# ---------------------------------------------------------------------------------------------------------------
Step '7/7  Record tool paths and check the setup'
$chrome = Find-Chrome
if (-not $chrome) {
    Warn 'Google Chrome not found; installing Chrome for Testing into Tools\chrome (no admin needed)'
    Push-Location $Tools
    try {
        $out = & npx.cmd --yes '@puppeteer/browsers' install chrome@stable --path (Join-Path $Tools 'chrome') 2>$null
        $chrome = ($out | Select-Object -Last 1) -replace '^\S+\s+', ''
    } finally { Pop-Location }
}
$paths = [ordered]@{
    os      = 'windows'
    whisper = $whisperExe
    python  = $venvPy
    chrome  = $chrome
    ytdlp   = (Join-Path $Tools 'bin\yt-dlp.exe')
    ffmpeg  = (Get-Command ffmpeg).Source
    node    = (Get-Command node).Source
}
# UTF-8 without BOM, so json.loads and JSON.parse both read it.
[IO.File]::WriteAllText((Join-Path $Tools 'paths.json'), ($paths | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Ok 'Tools\paths.json'

& $venvPy (Join-Path $Studio '.claude\skills\talking-head-reel\scripts\check_setup.py')
Write-Host "`nIn each new terminal, run:  . .\Tools\Activate.ps1   (adds whisper-cli, yt-dlp and the npm CLIs to PATH)" -ForegroundColor Cyan
