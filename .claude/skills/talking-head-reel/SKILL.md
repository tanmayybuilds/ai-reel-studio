---
name: talking-head-reel
description: Edit a raw talking-head recording from this studio's Raw folder into a vertical 1080x1920 reel for Instagram, Shorts or TikTok. It studies the reference and approved videos, writes or reuses the brand kit, finds the best takes, syncs a separate voiceover, and makes the cuts. It builds a storyboard dashboard with Approve, Reject and Feedback on every beat, then, after approval, renders camera zooms, word-timed captions in the creator's caption language, motion graphics and sound effects. Use it whenever the user asks to edit, cut or make a video, reel, short or talking-head clip, or mentions a storyboard, brand kit, references, B-roll, captions, motion graphics or zoom effects. Also use it when they give feedback on a storyboard or a render, or say "start render", even if they never name the skill.
---

# Talking-head reel

This skill turns one locked-off camera recording, plus an optional voiceover and assets, into a fast, premium vertical reel. Every camera move, caption and graphic lands on a spoken word. The workflow was built and proven over several reels the creator approved as final. One of them is a worked example in `references/examples/`: `voicestudio-storyboard.json` (13 beats) and `build_storyboard_muse.py` (a storyboard generated from speech evidence).

There are two gates, and the user expects both:

1. **Storyboard approval before any final render.** Show the dashboard first. Do not export a video until the user says to render.
2. **Final approval before anything goes to `Approved Videos`.** Approved videos become style examples for future edits, so only the user decides what goes in.

## Read first, every time

- `studio.json` (repo root): the creator's profile from the first-run interview. It covers the spoken and caption language, caption style, accent, background mode, pacing, SFX, music, things to avoid and notes. **It overrides the defaults in this skill.**
- `Brand Kit/brand-kit.md`: colours, type, captions, camera, pacing, motion kit, audio and safe area.
- `Brand Kit/creator-notes.md`, if present: the creator's standing preferences and the history of past reels (what was approved, rejected and why).
- `Approved Videos/`: finished edits the user approved. Match them.

If `studio.json` is missing, the studio has not been set up yet. Follow Part A of `AGENTS.md` first.

## What the user cares about

These came from real review notes on past edits. Treat them as the brief behind every request, unless the profile says otherwise.

- **Graphics only for what is spoken.** Every motion graphic has a trigger word in the dialogue, listed on its storyboard card. If nobody says it, it does not appear. Filler graphics get called out as unnecessary.
- **The best takes, not the first ones.** Creators record retakes. Pick takes where every word is right and the delivery is confident, which is usually a later take. Check the wording against what the creator meant, not just what Whisper heard. For example, "clone sakte ho" was rejected because the intended line was "clone kar sakte ho". If the user believes a better take exists, scan both tracks end to end before saying it doesn't.
- **Complete thoughts.** Never end a beat mid-sentence.
- **Beautiful captions in the profile's caption language.** Caption every spoken word. In the default two-tier style, a small lead line reveals word by word, and one big hero word carries the key idea. For Romanized captions (such as Hinglish), use Latin script, with English words in English spelling.
- **A camera that moves.** Use punch-ins on key words, slow pushes on tension, a different framing on every cut, and a short blur-in at each cut.
- **Premium, real visuals.** Use real screenshots, real repos and real numbers from the supplied assets. Key moments get standout graphics, such as a link spoken aloud or a comment call to action. "Not up to the mark" feedback meant the graphic looked plain.
- **Hooks that grab in the first 3 seconds.** If the speaker's face looks wrong in a hook (cropped, awkward), replace that beat with a full motion graphic.
- **Feedback lives in the text, not the status.** Users write notes even on beats they approve. Read every note in `reviews.json` before rendering.

## Studio layout

Run everything from the studio folder (the repo root).

| Path | What it holds |
| --- | --- |
| `Raw/<Video>/` | Camera file, optional separate voiceover, `Assets/` (screen recordings, screenshots) |
| `Raw/<Video>/Edit*/` | The project this skill creates: config, plan, storyboard, scripts, dashboard, media |
| `References/` | Videos whose style the user wants |
| `Approved Videos/` | Finished, user-approved edits, which are also style examples |
| `Brand Kit/brand-kit.md` | Colours, type, captions, camera, pacing, motion kit, audio, safe area |
| `Editing Style/Reference Analysis/<name>/` | Frames, sheets and notes from studying a reference |
| `Exports/<Video>/` | Every render, versioned (`-v1`, `-v2`), never overwritten |
| `Tools/` | whisper.cpp, models, yt-dlp, `node_modules` (puppeteer-core), `vision-venv`, and `paths.json` (where each tool is on this machine) |

**Python:** use the venv for every script, because system Python lacks OpenCV and MediaPipe. In the commands below, `$py` is `Tools\vision-venv\Scripts\python.exe` on Windows and `Tools/vision-venv/bin/python` on macOS and Linux (use the absolute path when running from an edit folder). If anything is missing, run `scripts/check_setup.py`. It says what to fix, and `--install-venv` rebuilds the venv.

**Shell:** on Windows PowerShell 5.1, chain with `;` (not `&&`) and pass multi-line text in single-quoted here-strings, because double quotes expand `$` and `${}`. Run long renders in the background. Paths below use `/`, and Windows accepts them in Python and Node.

## Workflow

Tell the user what you are doing as you go. Then work through the phases in order. Each phase lists the reference file to read when you reach it.

### 1. Set up the project

```
$py .claude/skills/talking-head-reel/scripts/check_setup.py
$py .claude/skills/talking-head-reel/scripts/new_project.py "Raw/<Video>" --title "<Reel title>"
```

`new_project.py` picks the camera file (the largest video), a voiceover (an audio-only file, if there is one), the `Assets` folder, the frame rate and a free port. It copies `template/` into `Raw/<Video>/Edit` (or `Edit-v2` and so on, never overwriting). It writes `project.json` with the profile's defaults (language, background, loudness, model) and the Chrome path from `Tools/paths.json`. It also points the studio's launcher (`Start Storyboard.cmd` on Windows, `start-storyboard.sh` elsewhere) at the new project. Check its choices against the folder. If the user named a folder that doesn't exist, look at what is in `Raw/`, pick the right one and say which you used.

### 2. Learn the style

Read `references/style-study.md`. In short:

- Run `scripts/study_reference.py` on each reference the user points to, and on approved videos you haven't studied yet. Then **look at** the sheets, motion runs and frames, by opening the images. Studying means looking at the frames, not just extracting them.
- Brand kit: if the user gives a new reference or says to ignore the old kit, write a new `Brand Kit/brand-kit.md` and move the old one into the previous project's folder, never delete it. Otherwise reuse the current kit and the approved videos as the house style.
- Accent: if the user asks for a new colour for this video, run `scripts/set_accent.py --preset <name>` or `--hex "#RRGGBB" --name <word>` with `--target "Raw/<Video>/Edit"`. Run it on the template too if the change is meant to last. Then update the brand kit's Colour table, and save the old kit first.

### 3. Understand the raw footage

From the edit folder, run `$py -X utf8 scripts/prepare.py`. It extracts the audio and measures the voiceover sync offset to 1 ms, with a drift check. It also tracks the face every second, finds an empty-room moment for a clean plate, and makes contact sheets of the A-roll and every video asset. Look at the sheets.

Then read `references/takes-and-cuts.md` and run `scripts/list_takes.py vo` (and `cam`) to list every take, island by island. Build a take map, `analysis/take-map.md`: each script line, every take of it, and which one wins and why.

### 4. Plan the beats and cut

Write `edit-plan.json` (dialogue segments per beat) and the storyboard. For more than a few beats, generate the storyboard with a `scripts/build_storyboard.py` (see `references/examples/build_storyboard_muse.py`) rather than editing `storyboard.json` by hand. Read `references/storyboard.md` for both formats, the camera model, the full motion-graphics catalogue and the layout map.

Run `scripts/cut_audio.py`. It cuts the dialogue on whole frames, loudness-normalises it, re-transcribes every beat into `analysis/speech-evidence/`, and writes the beat timings into the storyboard. **Read the evidence line for every beat.** It is the only proof that no word was lost, doubled or wrong. Use its word times for caption and graphic timing. Repeat until every beat says exactly the intended line.

### 5. Build the storyboard dashboard

- Crop the real asset images the graphics need into `storyboard/assets/`. Use `scripts/stitch_scroll.py` to turn a scrolling screen recording into one tall page image.
- Run `scripts/render_scene.py --height 1280` to make 720p previews of every beat. This also builds `media/rough-cut.mp4` for the "Play the full cut" button.
- Start the dashboard in the background: `node storyboard/server.cjs` from the edit folder.
- Check your own work before the user sees it. Run `node scripts/qa_sheet.cjs analysis/qa 0.3 0.7 0.95` and look at the sheets. Fix text collisions, captions over the mouth, graphics off the safe area and anything that looks plain.
- Open `http://127.0.0.1:<port>` in a browser you control if you have one, and give the user the link and a short summary: beat count, length, what each hook does, and what you need from them. Mention that the launcher in the studio folder reopens it later. **Stop and wait for the review.**

### 6. Review rounds

When the user has reviewed, read `reviews.json`, including the feedback on approved beats, plus anything they wrote in chat. Apply each round as a patch script (`scripts/apply_round2.py`, and so on) or as edits to `build_storyboard.py`, so the history is reproducible. Re-run `cut_audio.py` if any segment changed, and re-render only the changed beats with `--only`. Run QA again. Tell the user, beat by beat, what changed for each note. Say plainly when a note could not be done and why.

### 7. Render, only after the user says to

Read `references/render-and-deliver.md`. In order:

1. `render_scene.py --height 1920` for **all** beats, so every scene has the same size. In room mode, check `analysis/talk-plate.jpg` and one preview frame first: it must show the room, not the dark set.
2. `node scripts/render_overlay.cjs`, with the dashboard server running.
3. `scripts/make_sfx.py` (skip it, or keep it subtle, if the profile says `sfx: none` or `subtle`).
4. `scripts/assemble.py`.

Run each long step in the background. `assemble.py` prints the checks (size, frames, A/V durations, loudness, black frames, decode errors) and writes `analysis/export-sheet.jpg`. Look at that sheet before you send anything.

### 8. Deliver

Send the export to the user, or give its path. Report what changed, what you verified, and what you could not verify. You cannot hear, so lip sync, SFX balance and audio joins need the user's ears. Also flag any claim on screen that nobody said, and any number that may go out of date. When the user approves, copy the export and its SRT to `Approved Videos/<Video>/<slug>-final.mp4`, check the copies match, and record what was approved (and any new style decisions) in the brand kit or your memory.

## Hard-won rules

- **Sync once, cut once.** Camera time = dialogue time + `syncOffset`. Cut video and audio from the same frame-quantised list (`cut_audio.py` does this). Never nudge one side by hand.
- **Whisper on long audio is unreliable.** Whole-file passes merge retakes, loop on repetition and invent text in the middle. Use islands (`list_takes.py`) to find takes, and per-beat evidence (`cut_audio.py`) to verify cuts. whisper.cpp can split a multibyte character, so always decode its JSON with `errors="replace"`. Word times can drift by up to 0.5 s, so cut on silencedetect pauses, not on word starts. When a beat opens on silence, Whisper pins the first word to 0 s, so measure the real onset.
- **One timeline drives everything.** Overlays live in `storyboard.json` and `motion.js`. The dashboard preview and the final frame-by-frame render run the same code, so what the user approves is what renders. Do not hand-animate anything outside it.
- **Every overlay animation is paused and seeked.** With the Web Animations API (WAAPI), keyframes using `fill: both` show their first frame before the start time. Builders that must stay invisible until their time need a leading `opacity: 0` keyframe.
- **The server re-reads `storyboard.json` on every request.** After an edit, reload the page. The final overlay render loads from the same server, so it must be running on the project's port.
- **Room mode needs a talk plate.** `render_scene.py` writes `analysis/talk-plate.jpg` (`talkPlate: true`). Without it, room mode silently falls back to the dark set. Choose a clean-plate frame with settled exposure, because cameras start dark.
- **The camera keeps rolling.** Speakers stand up or reach for the camera after the last line, so end the last beat before that, or cover it with an end card.
- **FFmpeg 5.1+ is needed.** FFmpeg 9 removed `-vsync`, so use `-fps_mode`.
- **Non-ASCII in scripts.** Edit `.py` files with an editor tool, not with PowerShell `Get-Content`/`Set-Content`, which turns `₹`, `–` and `’` into mojibake.
- **Never delete or overwrite the user's material.** That covers raw files, old brand kits, earlier exports and old projects. Version new outputs. If a cleanup is blocked by a safety check, leave the file and say so.
- **Real over invented.** Product screens, star counts and commands come from the supplied assets or the real page. If a graphic needs a fact nobody said, put it on the card and flag it to the user. Use logos unaltered.

## Bundled files

- `scripts/check_setup.py`, `new_project.py`, `study_reference.py`, `set_accent.py`, `studio_paths.py`: run from the studio folder.
- `template/`: copied into every new project.
  - `scripts/`: `prepare`, `list_takes`, `cut_audio`, `render_scene` (room mode, MatteV3, talk plate), `render_overlay.cjs`, `qa_sheet.cjs`, `make_sfx` (layered stereo SFX; `make_sfx_basic` is the plainer first version), `assemble`, `stitch_scroll`, and the shared `project.py`.
  - `storyboard/`: the dashboard and motion layer, with fonts. Its accent (cyan by default) is recorded in `storyboard/accent.json`. Builders include `typer`, `price`, `tokenMeter`, `codeFlap`, `timeline`, `stepRail` and `offerTimer`.
  - Defaults: the real room lightly blurred (`bgMode: "room"`) and layered SFX. They are already in the template, so don't copy scripts from an older project.
- `references/style-study.md`: studying references and writing the brand kit.
- `references/takes-and-cuts.md`: sync, the take map, choosing takes, `edit-plan.json`, evidence.
- `references/storyboard.md`: `storyboard.json`, the camera, the overlay catalogue, layout and design rules, review rounds.
- `references/render-and-deliver.md`: final render, QA, the delivery message, approval.
- `references/examples/`: a complete approved storyboard and a storyboard generator.
