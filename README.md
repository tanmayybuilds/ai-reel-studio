# AI Reel Studio

> **You are on the `tanmay` branch:** Tanmay Builds' own studio, pre-configured with the brand kit, creator notes, editing style, reference studies and four approved reels (`Approved Videos/`). To set it up on a new computer, give your agent:
>
> ```
> Set up my AI reel editing studio from https://github.com/tanmayybuilds/ai-reel-studio/tree/tanmay
> Clone the tanmay branch, read AGENTS.md (the tanmay-branch box at the top), ask me only the workstation
> questions one at a time, install everything, run the smoke test, then tell me how to edit my next video.
> ```
>
> For a blank studio with the full guided interview, use the [`main` branch](https://github.com/tanmayybuilds/ai-reel-studio).

A local, AI-operated video-editing studio for talking-head reels. Give an AI coding agent (Claude Code, Codex, Cursor, Gemini CLI and others) the link to this repo. It installs everything, interviews you about your brand and style, and then edits your raw recordings into finished vertical reels, for Instagram Reels, YouTube Shorts and TikTok.

- **Best takes, automatically:** every retake of every line is transcribed and compared, and the best one is used.
- **Voiceover sync** to 1 ms, with video and audio cut from the same frames.
- **Word-timed captions** in your language and script (for example Romanized Hinglish), with a big hero word per line.
- **Camera moves:** punch-ins on key words, slow pushes, and a blur-in on every cut.
- **Motion graphics only on spoken words**, built from your real screenshots and screen recordings.
- **Layered sound design**, mixed to -14 LUFS.
- **A storyboard dashboard first,** with Approve, Reject and Feedback on every beat, and a final render only after you approve.
- Runs **entirely on your computer:** no API keys, no subscriptions, no GPU needed.

## Quick start: give this to your AI agent

Paste this into your agent (Claude Code, Codex and so on), in an empty folder or your Documents folder:

```
Set up my AI reel editing studio from https://github.com/tanmayybuilds/ai-reel-studio
Read AGENTS.md first and follow Part A: clone the repo, interview me one question at a time,
install everything, write my brand kit, run the smoke test, then tell me how to edit my first video.
```

The agent will:

1. Ask where to put the studio, then clone the repo.
2. Interview you, one question at a time: your brand, platforms, spoken and caption language, caption style, accent colour, fonts, house style, background, reference videos, pacing, recording setup, sound and review process (`setup/INTERVIEW.md`).
3. Install FFmpeg, Node.js, Python 3.11, Chrome, whisper.cpp with its models, yt-dlp, puppeteer-core and a Python vision environment, checking every download's SHA-256 hash (`setup/install.ps1` or `setup/install.sh`).
4. Write your studio profile (`studio.json`), brand kit and new-reel prompt, and apply your accent colour.
5. Run a smoke test (FFmpeg, Whisper, MediaPipe, headless Chrome) and report.

## Branches

| Branch | What it is |
| --- | --- |
| `main` | **Guided setup.** A blank studio. The agent asks every question and builds your brand kit from your answers and reference videos. |
| `tanmay` | **Pre-configured studio.** The creator's own brand kit, editing style, reference studies and approved reels, exactly as used in production. The agent only installs the tools and checks a few workstation questions. |

To clone a specific branch: `git clone -b tanmay https://github.com/tanmayybuilds/ai-reel-studio.git`

## Editing a video (after setup)

1. Make a folder `Raw/<video name>/` and put in it the camera file, an optional separate voiceover, and an `Assets/` folder of screenshots and screen recordings of everything you mention.
2. Open your agent on the studio folder and paste the prompt from `Editing Style/New Reel Prompt.md`.
3. Review the storyboard dashboard it opens (`http://127.0.0.1:<port>`). Approve, reject or comment on each beat.
4. Say **"start render"**. Review the export, then approve it to move it into `Approved Videos/`.

## Two looks

| Skill | The look |
| --- | --- |
| `talking-head-reel` | Full-frame talking head, either your real room lightly blurred or a cutout on a dark set. Two-tier captions, punch-in camera, bright graphics on the spoken word (typing hooks, price strikes, browser link reveals, repo cards, tiles, comment-CTA sheets, token meters and more). |
| `podcast-window-reel` | A black 9:16 canvas, fixed headline, one video window, small lowercase subtitles, serif hero words behind the speaker, fire light-leak transitions, slow-push cards. |

## Manual setup (without an agent)

```powershell
# Windows (PowerShell), from the repo folder
powershell -ExecutionPolicy Bypass -File setup\install.ps1
Tools\vision-venv\Scripts\python.exe setup\smoke_test.py
```

```bash
# macOS / Linux
bash setup/install.sh
Tools/vision-venv/bin/python setup/smoke_test.py
```

Then copy `setup/templates/studio.template.json` to `studio.json` and `setup/templates/brand-kit.template.md` to `Brand Kit/brand-kit.md`, and fill them in. `setup/INSTALL.md` has the full tool list, versions and troubleshooting.

## Requirements

- Windows 10/11 (tested), macOS 13+ or Ubuntu 22.04+ (installer provided, not yet tested on those systems)
- 8 GB RAM minimum (16 GB recommended), about 2 GB free disk for the tools, plus your footage
- An internet connection for the first install only

## Repository layout

```
AGENTS.md            instructions for AI agents (setup protocol and daily rules)
CLAUDE.md            Claude Code entry point (imports AGENTS.md)
studio.json          your studio profile (written by the setup interview)
setup/               installers, interview, templates, smoke test, pinned versions
.claude/skills/      the two editing skills: workflow, scripts, dashboard template
Brand Kit/           brand-kit.md plus logos and fonts
Editing Style/       the new-reel prompt and reference studies
Raw/  Exports/  References/  Approved Videos/   your media (git-ignored except READMEs)
Tools/               installed tools (git-ignored), activation scripts
```

## Third-party software

The installer downloads these from their official sources, under their own licences: [FFmpeg](https://ffmpeg.org/) (LGPL/GPL), [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and its models (MIT), [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense), [MediaPipe](https://github.com/google-ai-edge/mediapipe) (Apache-2.0), [OpenCV](https://opencv.org/) (Apache-2.0), [Puppeteer](https://pptr.dev/) (Apache-2.0), [HyperFrames](https://hyperframes.app/), and optionally [Remotion](https://www.remotion.dev/) (its own licence: companies may need a paid licence). The bundled fonts, Archivo and Instrument Sans, are under the SIL Open Font License. The bundled `gsap.min.js` is under the GSAP standard licence.

Only download reference videos you are allowed to use, and use them for private style study.
