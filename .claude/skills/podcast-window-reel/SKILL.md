---
name: podcast-window-reel
description: Edit a talking-head clip into the "podcast window" reel style decoded from the 7 Nov 2026 reference. The look is a black 9:16 canvas with a fixed white headline and one video window. Small lowercase subtitles sit at the window's foot, and editorial serif hero words (UPPERCASE serif, a tiny bold sans word and an italic serif) sit behind the speaker. Warm fire light-leaks hit every cut to and from a cutaway. Cutaways are slow-push graphic cards on dark ember or charcoal gradients, plus B-roll, with a fire whoosh on each leak and a low drone bed. Use it when the user asks for this reference style, the podcast/letterbox/window look, "like the reference reel with the serif words and fire transitions", or a client edit in that style. Also use it for v2 rounds after the user sends assets for such an edit.
---

# Podcast-window reel

This style was decoded frame by frame from `References/Reference-2026-11-07.mp4` (study in `Editing Style/Reference Analysis/Ref 2026-11-07/`). The reference video itself is not in the repo, but its frame study is. Read `references/style-guide.md` before building anything: it holds every measurement, font, timing and colour.

It reuses the **talking-head-reel** skill's project plumbing: `new_project.py`, `prepare.py`, `list_takes.py`, `cut_audio.py` and `project.py`. It replaces that skill's render (room/set compositor, HTML overlay) with one Python renderer, `render_window.py`, which draws the whole frame. Graphics, captions and transitions all come from one `timeline.json`.

## What the user expects

- **The reference's look, exactly.** That means the black canvas, the headline above the window, small lowercase subtitles, serif hero stacks, fire light-leaks on cutaway cuts, slow-push cards and punch-in framing changes. When the footage forces a change (for example, a vertical selfie needs a taller window than the reference's 3:2), keep every other element and say what changed and why.
- **v1 first, with generated assets.** Build v1 with generated cards and a generated music bed. Then send the user a precise list of the real assets that would lift v2 (B-roll clips, screenshots, logo, music, fonts). Then build v2 from what they send.
- The studio's standing rules from talking-head-reel still apply: graphics only on spoken words, best takes, complete sentences, never overwrite raw files or exports, and nothing goes to `Approved Videos` without the user's approval.

## Workflow

Run from the studio folder (the repo root), and use the venv Python for everything: `$py` is `Tools\vision-venv\Scripts\python.exe` on Windows, `Tools/vision-venv/bin/python` on macOS and Linux. In PowerShell 5.1, chain commands with `;`.

1. **Scaffold.** Copy the client file into `Raw/<Video>/` and make an `Assets/` folder. Then:
   ```powershell
   & $py .claude\skills\talking-head-reel\scripts\new_project.py "Raw\<Video>" --title "<Title>" --voiceover none
   & $py .claude\skills\podcast-window-reel\scripts\setup_window.py "Raw\<Video>\Edit" --window 1350
   ```
   `setup_window.py` copies this skill's scripts into the project and sets `fps` to 30 (the reference rate), the window height and a port that's free. Check that `project.json` has no BOM: PowerShell's `Set-Content -Encoding utf8` adds one and breaks `json.loads`.
2. **Prepare and transcribe.** From the edit folder, run `scripts\prepare.py`. Whisper on long or noisy audio loops or invents text, so transcribe a cleaned copy (`highpass=f=90,afftdn=nf=-25,loudnorm`) with `-l en` or `-l hi` as spoken, `--vad`, and `-ml 1 -sow` for word times. If whole-file output is garbage, check the language first (the first client spoke English).
3. **Cut.** Write `edit-plan.json` with segments that cut pauses over about 0.25 s and fillers ("you know", "right?", "most presumably") where a clean pause allows. Also write a minimal `storyboard.json` (`{"beats":[{"id":..,"camera":[[0,1,0]]}]}`). Run `cut_audio.py` and read every evidence line. Typical fixes: a dropped "to" means extending the segment, and a next word bleeding in ("because") means pulling `out` back.
4. **Timeline.** Copy `scripts/build_timeline_example.py` to the project's `scripts/build_timeline.py` and rewrite the beat section for the new script. Use the `w(beat, word)` helper so every hero row, card element and leak lands on an evidence word time. Follow the reference grammar in the style guide: A-roll with hero stacks, cutaway cards at noun moments, a leak on each A-roll/cutaway boundary, and a different zoom on every return to A-roll. Edit `build_timeline.py` with the Edit tool, never with PowerShell text replace, because that mangles `–` and `’` into `â€“`.
5. **QA stills before the full render.** Run `render_window.py --stills t1,t2,...` at every hero and card moment, then `qa_stills.py`, and look at `analysis/qa/sheet-*.jpg`. Check that hero words are readable (the renderer moves a stack in front of the speaker when the head would hide over 30% of it), that nothing is clipped at the window edge, and that each leak peak is saturated yellow-orange, not white.
6. **Render.** Run `render_window.py` in the background (about 1 to 2 min per 10 s at 1080x1920), then `make_window_sfx.py`, then `mix_window.py --version N`. `mix_window.py` refuses to overwrite an export and writes the SRT. Pull an `export-sheet` (one frame every 2 s) and look at it before sending.
7. **Deliver.** Send the export. Say what you could not verify (you can't hear: SFX balance, music level, lip sync at joins). List anything on screen nobody said, and placeholder content in generated cards. Then give the **asset request**: for each cutaway, what real asset would replace the generated card, the exact moment and words it covers, and the format you need.
8. **v2.** Put the user's files in `Raw/<Video>/Assets/`. Wire B-roll clips in as `"kind": "broll"` shots, with a slow push and the leak in and out. Swap screenshots into cards. Put the music in `Assets/music.*`, and `mix_window.py` picks it up. Fonts go in `Tools/fonts/` (searched first on every OS), after which you update `F_*` in `render_window.py`. On macOS and Linux, missing Windows fonts fall back to look-alikes (see `FONT_ALIASES`). Render with `--version 2`.

## Files

- `scripts/render_window.py`: the renderer. It covers HDR to SDR tone-map (iPhone HLG), the face-tracked crop with zoom keys, the serif hero stacks behind the speaker (MediaPipe selfie matte) with a front fallback, subtitles, the fire light-leak, the window-open reveal, the headline, and the card builders (`room`, `bars`, `playcard`, `toasts`, `three`, `seven`, `dm`, `price`, `comment`). Add a card by writing `card_<name>(c, t, p)` and registering it in `CARDS`.
- `scripts/build_timeline_example.py`: the first client's timeline, a worked example of the grammar.
- `scripts/make_window_sfx.py`: generates the fire whoosh, hero ticks, card UI sounds and the drone bed.
- `scripts/mix_window.py`: ducks the music under the voice, outputs -14 LUFS / -1.5 dBTP, and writes the SRT.
- `scripts/qa_stills.py`: labelled contact sheets of the QA stills.
- `scripts/export_sheet.py`: contact sheets of a finished export, with every hero stack at full reveal plus one frame every 3 s. Look at them before sending.

## Gotchas found on the first edit

- **Hero words and a close face.** Each stack sits behind the speaker only if the head hides 12% or less of it across its *whole* time on screen (`decide_fronts`, cached in `analysis/hero-front.json`); otherwise it goes in front. Deciding on the first frame alone failed: the head moved and "INSECURITY" became "TY". With an arm's-length selfie, nearly every stack goes in front, which is expected. The behind look needs headroom or a wider shot.
- **iPhone HDR (HLG, 10-bit).** Without a tone-map, the footage looks washed out. `build_aroll` uses zscale + hable. The grade then pulls saturation to 0.86, because hable leaves skin orange.
- **Leak peak.** A pure screen blend goes cream-white. The renderer pulls the result back toward the leak colour so the peak reads yellow-orange like the reference.
- **Card props.** Never name a card prop `type`, `start` or `end` (they collide with the shot's keys). The card's own animation start is `start=` and the shot span is `s0`/`s1`.
- `scripts/setup_window.py`: installs the above into a talking-head-reel project.
- `references/style-guide.md`: the decoded reference (layout, type, captions, camera, transitions, cards, audio, the asset checklist).
