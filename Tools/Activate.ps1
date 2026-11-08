# Dot-source from the studio folder:  . .\Tools\Activate.ps1
# Adds the studio tools to THIS terminal's PATH only (the system PATH is not changed).
$env:Path = "$PSScriptRoot\bin;$PSScriptRoot\whisper.cpp\Release;$PSScriptRoot\node_modules\.bin;$PSScriptRoot\Remotion\node_modules\.bin;$PSScriptRoot\vision-venv\Scripts;$env:Path"
$env:WHISPER_MODEL = "$PSScriptRoot\models\ggml-small-q5_1.bin"
$env:HYPERFRAMES_WHISPER_PATH = "$PSScriptRoot\whisper.cpp\Release\whisper-cli.exe"
Write-Host 'Studio tools ready in this terminal: whisper-cli, yt-dlp, python (vision venv), hyperframes.cmd, remotion.cmd.'
