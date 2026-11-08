# Studio tools

Everything in this folder except the files listed below is installed by `setup/install.ps1` (Windows) or `setup/install.sh` (macOS/Linux), and is git-ignored. To rebuild it, delete the folder contents (keep the tracked files) and re-run the installer.

**Tracked in git:** `README.md`, `Activate.ps1`, `activate.sh`, `package.json`, `package-lock.json` (puppeteer-core plus HyperFrames, installed with `npm ci`), `Remotion/` (sources only), `HyperFrames/` (sample project).

**Created by the installer:** `bin/` (yt-dlp), `whisper.cpp/`, `models/`, `node_modules/`, `vision-venv/`, `chrome/` (only if no system Chrome), and `paths.json`, which records where each tool is on this machine. Every script reads tool locations from `paths.json`.

## Start a terminal session

```powershell
. .\Tools\Activate.ps1        # Windows PowerShell, from the studio folder
```

```bash
source Tools/activate.sh      # macOS / Linux, from the studio folder
```

This adds whisper-cli, yt-dlp, the venv Python and the npm CLIs to this terminal's PATH, and sets `WHISPER_MODEL`. It does not change the system PATH. On Windows, use `npm.cmd`, `npx.cmd`, `remotion.cmd` and `hyperframes.cmd` to avoid PowerShell execution-policy errors.

## Common commands

```powershell
# Audio suitable for transcription
ffmpeg -i 'Raw/my-video/footage.mp4' -vn -ar 16000 -ac 1 -c:a pcm_s16le 'Raw/my-video/speech.wav'

# Transcribe locally (TXT, SRT and detailed JSON with word times)
whisper-cli -m $env:WHISPER_MODEL -f 'Raw/my-video/speech.wav' -l auto -ml 1 -sow -otxt -osrt -ojf -of 'Raw/my-video/transcript'

# Download a reference video you're allowed to study
yt-dlp -P References 'VIDEO_URL'
```

On macOS and Linux, use `$WHISPER_MODEL` and the same arguments.

## Optional studios

- **Remotion** (React video framework): `setup/install.ps1 -WithRemotion` (or `install.sh --with-remotion`), then `cd Tools/Remotion; npm run dev`. Companies may need a Remotion licence: https://www.remotion.dev/license
- **HyperFrames** (HTML video framework, installed with the base packages): `cd Tools/HyperFrames; npm run dev`, `npm run check`, `npm run render`.

The reel skills don't use either. They render with their own Python and puppeteer pipeline.

## Notes

- yt-dlp uses Node.js to solve YouTube's JavaScript challenges (`bin/yt-dlp.conf` holds `--js-runtimes node`).
- The Whisper `small` q5_1 model is the default for every transcription. `base` is optional, faster and less accurate.
- On 8 GB RAM, close other apps before a long render. The scripts render with one worker.
