# AI Reel Studio: instructions for AI agents

This repository is a complete local video-editing studio that an AI agent operates. It turns a raw talking-head recording into a finished vertical reel (1080x1920, Instagram Reels / YouTube Shorts / TikTok). The agent picks the best takes, syncs a separate voiceover, cuts on whole frames, writes word-timed captions, adds camera moves, motion graphics and layered sound effects, and shows a storyboard for approval before it renders.

Everything runs on the user's own computer. No API keys and no paid services are needed.

**If the user gave you only the link to this repo, read this whole file first, then follow Part A.**

---

## Which part to follow

| Situation | Do this |
| --- | --- |
| The repo is not on this computer yet | Part A, from step A1 |
| The repo is here, but `studio.json` or `Tools/paths.json` is missing | Part A, from step A2 |
| Both exist and `check_setup.py` prints `ready` | Part B (daily use) |

Check with:

```
python .claude/skills/talking-head-reel/scripts/check_setup.py
```

(On Windows, `py` or the full path to Python works too. Use the venv Python once it exists: `Tools\vision-venv\Scripts\python.exe` on Windows, `Tools/vision-venv/bin/python` on macOS and Linux.)

---

## Part A: First-run setup

Work through A1 to A7 in order. **Ask the interview questions one at a time** and wait for each answer. Do not dump the whole list on the user. Keep a running summary as you go, and confirm it at the end before you install or write anything.

### A1. Get the repo onto the computer

1. Ask: *"Where should I put the studio? I suggest `<Documents>/AI Reel Studio`."* Use their answer.
2. Make sure `git` exists (`git --version`). If it doesn't, install it (Windows: `winget install Git.Git`; macOS: `xcode-select --install`; Linux: `sudo apt install git`), or ask the user to.
3. Clone the branch you were given. The default branch is the guided setup. A named branch (for example `tanmay`) is a pre-configured studio with a finished brand kit:
   ```
   git clone https://github.com/tanmayybuilds/ai-reel-studio.git "<folder>"
   git clone -b <branch> https://github.com/tanmayybuilds/ai-reel-studio.git "<folder>"
   ```
4. From now on, run every command from that folder (the *studio folder*).

### A2. Interview the user

Open `setup/INTERVIEW.md` and ask its questions **one at a time, in order**. Each question says why it matters, what the options are, the default, and where the answer is saved. Detect what you can yourself (OS, RAM, GPU, free disk, what is already installed) instead of asking.

If this branch already has a filled-in `studio.json` (a pre-configured branch), skip the brand and style questions. Ask only the questions marked **[always]**, then show the user the existing profile and ask whether anything has changed.

### A3. Confirm the plan

Show the user a short summary: the install folder, what will be installed (with sizes, about 1.5 GB in total), their brand and style choices, and the accent colour. Ask: *"Shall I go ahead?"* Install nothing before they say yes.

### A4. Install the tools

Read `setup/INSTALL.md` if anything below fails.

- **Windows:** `powershell -ExecutionPolicy Bypass -File setup\install.ps1` (add `-SkipSystem` if the user can't or won't let you install system software, `-WithRemotion` and `-BaseModel` for the optional extras).
- **macOS / Linux:** `bash setup/install.sh` (flags: `--skip-system`, `--with-remotion`, `--base-model`).

The installer is safe to re-run. It checks every download against a SHA-256 hash, and it ends by running `check_setup.py`. Installs through winget, Homebrew or apt can open an admin or password prompt. Tell the user to expect it. A full first install takes 10 to 30 minutes, depending on the connection, so run it in the background if your harness allows that.

### A5. Write the studio profile from the answers

1. **`studio.json`**: copy `setup/templates/studio.template.json` to `studio.json` at the repo root and fill in every field from the interview. New projects read their defaults from it: whisper language, background mode, loudness and model.
2. **`Brand Kit/brand-kit.md`**: copy `setup/templates/brand-kit.template.md` and fill in every `{{...}}` placeholder. Delete sections that don't apply. Put logo, font and colour files the user gives you in `Brand Kit/`.
3. **Accent colour:** apply it to the reel template so every new project starts in it:
   ```
   <venv python> .claude/skills/talking-head-reel/scripts/set_accent.py --preset cyan|amber|lime
   <venv python> .claude/skills/talking-head-reel/scripts/set_accent.py --hex "#RRGGBB" --name <oneword>
   ```
   Then copy the palette it prints into the Colour table of the brand kit.
4. **`Editing Style/New Reel Prompt.md`**: copy `setup/templates/new-reel-prompt.template.md` and fill it in, so the user has a ready prompt for each new video.
5. **References:** if the user gave reference links, download them with `yt-dlp -P References "<url>"` (after `. .\Tools\Activate.ps1` or `source Tools/activate.sh`). Only download videos the user has the right to use for private study. Then study each one:
   ```
   <venv python> .claude/skills/talking-head-reel/scripts/study_reference.py "References/<file>.mp4" --language <code>
   ```
   **Look at** the sheets and motion-run images it writes into `Editing Style/Reference Analysis/<name>/`, and update the brand kit with what you see. That covers pacing, caption placement, hero-word style, transitions and sound. Never invent details you didn't see.

### A6. Smoke test

```
<venv python> setup/smoke_test.py
```

It encodes a test video with FFmpeg, transcribes a speech sample with whisper.cpp, runs MediaPipe face detection, and renders a page in headless Chrome through puppeteer-core. All four must print `PASS`. Fix anything that fails before you report success.

### A7. Report

Tell the user, briefly:

- What was installed and where, what passed and what didn't.
- Their profile: brand, language, captions, accent, house style.
- **How to start a video:** put the footage in `Raw/<video name>/` (camera file, optional voiceover, and an `Assets/` folder of screenshots and screen recordings), then paste the prompt from `Editing Style/New Reel Prompt.md` into a new chat opened on the studio folder.
- Anything you could not do or verify.

---

## Part B: Daily use

### The skills

The workflow lives in two skills under `.claude/skills/`. Claude Code loads them automatically. **Other agents (Codex, Cursor, Gemini CLI, Copilot and so on): before an editing task, open the matching `SKILL.md` and follow it step by step,** reading each `references/*.md` file when the skill says to.

| Skill | Use it for |
| --- | --- |
| `.claude/skills/talking-head-reel/SKILL.md` | The house style: full-frame talking head with the real room lightly blurred (or a cutout on a dark set), two-tier word-timed captions, punch-in camera, motion graphics on spoken words, layered SFX. A storyboard dashboard with Approve, Reject and Feedback on every beat. |
| `.claude/skills/podcast-window-reel/SKILL.md` | The "podcast window" look: a black 9:16 canvas, fixed headline, one video window, serif hero words behind the speaker, fire light-leak transitions, slow-push cards. |

### Rules that apply to every edit

1. **Two approval gates.** Show the storyboard before any final render, and render only after the user says so. Nothing goes into `Approved Videos/` until the user approves the final, because approved videos become style examples for later edits.
2. **Graphics only for spoken words.** Every motion graphic has a trigger word in the dialogue.
3. **Best takes, complete sentences.** Check every take of every line, choose the best one (usually a later take), and never cut mid-sentence.
4. **Real over invented.** Product screens, numbers and links come from the user's assets or the real page. Flag any on-screen fact that nobody said.
5. **Never delete or overwrite the user's material.** Version every output (`-v1`, `-v2`). Old brand kits are moved, never deleted.
6. **Say what you could not check.** You can't hear the audio, so lip sync, SFX balance and audio joins need the user's ears.
7. **Follow the profile.** Read `studio.json`, `Brand Kit/brand-kit.md` and, if present, `Brand Kit/creator-notes.md` at the start of every edit. They override any default in the skills.

### Folder layout

| Path | What it holds | In git? |
| --- | --- | --- |
| `Raw/<Video>/` | Footage, optional voiceover, `Assets/`; each edit project in `Raw/<Video>/Edit*/` | No (only the README) |
| `Exports/<Video>/` | Every render, versioned | No |
| `Approved Videos/<Video>/` | User-approved finals plus their SRTs (also style examples) | Your choice |
| `References/` | Videos whose style the user wants | No (video files) |
| `Editing Style/` | The new-reel prompt and `Reference Analysis/` studies | Yes |
| `Brand Kit/` | `brand-kit.md` plus logo, fonts, colours | Yes |
| `Tools/` | Installed tools (ignored) plus `Activate.ps1`, `activate.sh`, `package.json` and `paths.json` (machine-specific, ignored) | Partly |
| `setup/` | Installers, the interview, templates, the smoke test | Yes |
| `studio.json` | The studio profile from the interview | Yes |

### Shell notes

- **Windows PowerShell 5.1:** chain commands with `;` (not `&&`), use `npm.cmd` and `npx.cmd`, and pass multi-line text in single-quoted here-strings. `Set-Content -Encoding utf8` writes a BOM that breaks `json.loads`, so use the Edit tool or Python to write JSON.
- **Python:** always use the venv Python. System Python lacks OpenCV and MediaPipe.
- Run long renders in the background, and watch RAM on 8 GB machines (close other apps; renders use one worker).

### Keeping the studio healthy

- If a script misbehaves on new footage, fix it in the skill's `template/`, not only in the project copy, so the next video benefits.
- After a style change the user approves (a new accent, a new graphic builder), update `Brand Kit/brand-kit.md` and, if it's a reusable builder, the template.
- To change the accent later, run `set_accent.py` (see A5) on the template. A project already in progress keeps its own colour unless you pass `--target "Raw/<Video>/Edit"`.
