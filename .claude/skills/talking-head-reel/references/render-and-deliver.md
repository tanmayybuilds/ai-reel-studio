# Final render and delivery

Start only when the user has said to render, for example "Reviewed, start render", "looks good, render it" or an approval button. First apply any feedback still in `reviews.json` and say that you did.

## Steps

Run from the edit folder. `$py` is the venv Python: `<studio>\Tools\vision-venv\Scripts\python.exe` on Windows, `<studio>/Tools/vision-venv/bin/python` on macOS and Linux. Run each long step in the background, and tell the user the rough wait.

1. **Scenes at full size.** `& $py -X utf8 scripts\render_scene.py --height 1920`. Before the first render, check the background (see "Room mode" below). Re-render every beat, not just the changed ones, because the concat needs every scene at the same size. Measured on this machine: about 1.6 s per frame, so roughly 30 minutes for a 45 s reel. Previews at `--height 1280` take about half that. This also rebuilds `media/rough-cut.mp4`.
2. **Motion layer.** The dashboard server must be running on the project port (`node storyboard\server.cjs`, in the background). Then run `node scripts\render_overlay.cjs`. It seeks the real page frame by frame and writes `media/overlay.mov` (PNG frames to qtrle with alpha, about 300 MB for 45 s). Measured: about 0.35 s per frame, so 6 to 7 minutes for 45 s. Spot-check stills first with `node scripts\render_overlay.cjs --stills analysis\stills 1.2 8.4 20` and look at them.
3. **Sound effects.** `& $py scripts\make_sfx.py` writes stereo `media/sfx.wav` from the storyboard, with layered sound design (approved on Whitestair and Handy): panning whooshes on each cut and `blurAt`; a layered impact on each hero word (red is a deeper boom, green adds a success chime); a riser, big hit and sparkle on the brand-name reveal (an `ink` hero word equal to the first word of the title, punctuation ignored, so "Handy:" matches HANDY); climbing pops on tiles and cards; paper swish on white boards; mouse clicks on taps; a key clack on every typed letter (`typer`, `browser`, `commentSheet`); count ticks, slash and boom on `price`; shimmer on `wave`; key clicks on `code`; and chimes on verify, browser load, DM and `notify`. It needs scipy (in the vision venv). It trims its own peak to 0.75, and assemble mixes it at 0.5, which sits about 14 LU under the dialogue. The first, simpler mono version is kept as `scripts\make_sfx_basic.py` if the user ever asks for quieter, plainer SFX. The user asked for no music unless a track is supplied.
4. **Assemble.** `& $py -X utf8 scripts\assemble.py`. It mixes dialogue plus SFX at 0.5 through a limiter, overlays the motion layer, encodes H.264 CRF 18 with BT.709 tags plus AAC 256k, writes the SRT beside the export, and prints the checks.

## Room mode and the talk plate

New projects start with `"bgMode": "room"`, `"bgBlur": 5`, `"matte": "v3"` and `"talkPlate": true` in `project.json`. The user prefers this look: the real room, lightly blurred like a video call and not darkened, because a cutout's broken edges read as a mistake. To switch back to the procedural dark set, remove `bgMode`.

- **MatteV3** (`matte: "v3"`) is the segmentation-led matte: selfie segmentation on a crop around the speaker (`matteCrop` [x0, y0, x1, y1] in source pixels, the full frame by default), a guided filter that snaps the edge to hair and sleeves, speck removal and a light temporal blend that resets at each cut. In room mode it only decides where the sharp speaker sits over the blurred room, so small errors don't show.
- **The talk plate** is `analysis/talk-plate.jpg`: the empty room as it really is during the talk. Each pixel is the median of talk frames where the speaker isn't, and the empty-room frames at `cleanPlate` fill the pixels the speaker always covers. Room mode needs it to patch the band around the speaker before blurring, so no blurred copy of the speaker haloes the edges.
- **Gotcha.** Only the older `Matte` class builds the plate, and MatteV3 never does. On Handy, a fresh project on MatteV3 had no plate, and room mode silently fell back to the dark set, which cost a full re-render. `render_scene.py` now builds the plate itself when the file is missing, and stops with an error if it still can't. It needs `cleanPlate` (set by `prepare.py`) and `sourceDuration`. If `prepare.py` found no empty-room moment, set `cleanPlate` by hand from the contact sheets, or remove `bgMode`.
- **Check before the full render.** Render one beat at preview size (`--only beat-01 --height 1280`). Then look at `analysis/talk-plate.jpg` (the room with no speaker, no ghost of a head, and no furniture where it no longer stands) and at a frame of the scene (the room visible and lightly blurred, not the dark set). If furniture moved between the empty-room frames and the talk, the talk plate handles it. If the room still looks wrong around the speaker, delete `talk-plate.jpg` and render again so it is rebuilt.
- **Exposure.** Cameras often start dark and settle within a second, and someone sitting down shifts the exposure too. `prepare.py` warns when the picked `cleanPlate` frame is darker than the rest of the recording. Then move `cleanPlate` later in the same empty run (on Handy, 0.2 s was dark and 1.8 s was right), delete `talk-plate.jpg` if one exists, and render again. `cleanPlateSpan` (frames, default 40) shortens the plate read for a short empty run.
- Per-project tuning seen so far: `matteCrop` around the speaker when the room has busy edges, `matteWeights` [0.22, 1.2, 1.2] when wall shadows read as the person (older `Matte` only), and `bgBlur` 4 to 6.

## Checks before sending

Read the `assemble.py` report:

- 1080x1920 at the project fps; video, audio and storyboard durations all equal.
- Loudness near -14 LUFS, true peak under -1 dBFS.
- No black segments (a black frame means a missing scene or a bad concat), and no decode errors.

Then **look at** `analysis/export-sheet.jpg`, 24 frames from the real file. Check every beat's captions, graphics and framing against what the user approved. Fix anything wrong and re-run only the steps it touches.

The export name comes from `project.json` `export`. Bump the version (`-v2`, `-v3`) for each new render, so earlier exports survive.

## The delivery message

Send the MP4 with SendUserFile, then keep the message short:

- a table, or a line per beat, of each feedback note and what changed;
- the checks that passed (size, duration, loudness, frames looked at);
- what you could not verify: anything you have not heard, which is lip sync, sound effects, audio joins and the balance;
- facts on screen that nobody said (a "Poora free" note, a licence, a price), numbers that can go stale (star counts), and claims that need care (for example, "free" when a model is non-commercial);
- the file links (MP4 and SRT).

Ask one question: is this final, or are there changes?

## After approval

- Copy the export and SRT to `Approved Videos/<Video>/<slug>-final.mp4` and `<slug>-final-captions.srt`. Compare SHA-256 hashes (`Get-FileHash` on Windows, `shasum -a 256` on macOS, `sha256sum` on Linux) to prove the copies match, and keep the exports in place.
- Update the project memory (`memory/` entry for this video), so a later session knows it is final and where it lives.
- Stop the background dashboard server you started.
