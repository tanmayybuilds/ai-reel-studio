# Installing the studio tools

The installers do all of this for you: `setup/install.ps1` on Windows, `setup/install.sh` on macOS and Linux. This page lists what they install, so you can do it by hand, fix a failed step, or install on a machine where the scripts don't work.

**Tested on:** Windows 11 x64 (FFmpeg 9.0.2, Node 26.8.1, Python 3.11.9). The macOS and Linux installer mirrors the Windows steps but has not been run on those systems yet.

**Disk:** about 1.5 GB for the tools (Python venv 700 MB, models 190 MB, node_modules 150 MB, whisper.cpp 30 MB, yt-dlp 25 MB), plus room for footage and renders.
**RAM:** 8 GB works (renders use one worker; close other apps). 16 GB is comfortable.
**GPU:** not needed. Everything runs on the CPU.

## What gets installed

| # | Tool | Version | Where | Used for |
| --- | --- | --- | --- | --- |
| 1 | FFmpeg + FFprobe | 5.1 or newer (tested 9.0.2) | system PATH | every cut, encode, loudness and contact sheet |
| 1 | Node.js | 20.19 or newer | system PATH | the storyboard server and the overlay renderer |
| 1 | Python | 3.10 to 3.12 (tested 3.11) | system | only to create the venv (MediaPipe 0.10.14 has no 3.13 wheels) |
| 1 | Google Chrome | any recent | system, or Chrome for Testing in `Tools/chrome` | headless rendering of the motion layer |
| 2 | whisper.cpp | v1.9.2 | `Tools/whisper.cpp/Release` (Windows zip) or `Tools/whisper.cpp/build/bin` (source build) or Homebrew | local speech-to-text with word times |
| 3 | Whisper models | small q5_1, Silero VAD v6.2.0, optional base | `Tools/models` | transcription and voice-activity detection |
| 4 | yt-dlp | 2026.10.26 | `Tools/bin` | downloading reference videos |
| 5 | npm packages | puppeteer-core 25.16, HyperFrames 0.9.4 | `Tools/node_modules` (`npm ci`) | driving Chrome; HyperFrames is an optional HTML video tool |
| 5 | Remotion (optional) | 4.0.540 | `Tools/Remotion/node_modules` | optional React video studio |
| 6 | Python venv | see `setup/requirements.txt` | `Tools/vision-venv` | numpy, OpenCV, MediaPipe (face tracking, matte), SciPy (SFX synthesis), Pillow |
| 7 | `Tools/paths.json` | — | written by the installer | tells every script where whisper-cli, Chrome and Python are |

URLs and SHA-256 hashes for every download are in `setup/versions.json`.

## Manual install, Windows

```powershell
winget install Gyan.FFmpeg OpenJS.NodeJS.LTS Python.Python.3.11 Google.Chrome
# open a NEW terminal so PATH updates, then from the studio folder:
powershell -ExecutionPolicy Bypass -File setup\install.ps1 -SkipSystem
```

## Manual install, macOS

```bash
brew install ffmpeg node python@3.11 whisper-cpp
brew install --cask google-chrome
bash setup/install.sh --skip-system
```

## Manual install, Ubuntu / Debian

```bash
sudo apt update && sudo apt install -y ffmpeg git cmake g++ curl python3.11 python3.11-venv
# Node 20.19+: https://nodejs.org (or nvm). Chrome: https://www.google.com/chrome/ (or let the installer fetch Chrome for Testing)
bash setup/install.sh --skip-system
```

## Check and test

```
<venv python> .claude/skills/talking-head-reel/scripts/check_setup.py   # every line "ok", then "ready"
<venv python> setup/smoke_test.py                                       # four PASS lines
```

`check_setup.py` also reports `studio.json` and `Brand Kit/brand-kit.md`. Those are written by the first-run interview (`AGENTS.md`, Part A), not by the installer.

## Common problems

| Symptom | Fix |
| --- | --- |
| `winget` not found | Install "App Installer" from the Microsoft Store, or install the tools by hand and use `-SkipSystem`. |
| A tool is still "not found" after winget | Open a new terminal. winget updates PATH only for new sessions. |
| `running scripts is disabled` | Use `powershell -ExecutionPolicy Bypass -File setup\install.ps1`, and `npm.cmd` / `npx.cmd` instead of `npm` / `npx`. |
| `SHA-256 mismatch` | The download was corrupted or the file changed upstream. Delete the `.part` file and re-run. If it keeps failing, check the release page and update `setup/versions.json`. |
| MediaPipe fails to install | The venv was made with Python 3.13 or newer. Delete `Tools/vision-venv` and re-run with Python 3.11 installed. |
| `json.loads` error about a BOM | A JSON file was saved by PowerShell `Set-Content -Encoding utf8`. Re-save it as UTF-8 without BOM. |
| Overlay render can't find Chrome | Set `"chrome"` in `Tools/paths.json` (and in the project's `project.json`) to the browser executable. |
| Renders crash or freeze on 8 GB RAM | Close other apps. The scripts already render with one worker. |
