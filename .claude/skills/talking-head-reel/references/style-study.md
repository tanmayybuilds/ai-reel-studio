# Studying style and writing the brand kit

## Which videos to study

- **References** the user names, or everything in `References/` when they say "study the references". The user's notes in `References/README.md` say what to borrow.
- **Approved Videos**: the user's own finished edits. These outrank references on any conflict, because they show what the user accepted. If `Editing Style/Reference Analysis/<name>/` already exists for a video, reuse it rather than redo it.

## Running the study

```powershell
& $py .claude\skills\talking-head-reel\scripts\study_reference.py "References\<file>.mp4" --name "<short name>"
```

It writes `Editing Style/Reference Analysis/<name>/`:

| File | What to read from it |
| --- | --- |
| `sheet-NN.jpg` | 12 labelled frames a sheet, one per second: layout, colour, caption placement, graphic types |
| `frames/fNNN.jpg` | A single second at full size, for sampling colours and reading type |
| `scene-cuts.txt`, `summary.json` | Cut times, cut count, average shot length, loudness |
| `mo-<t>.jpg` | 10 frames at 12 fps around each cut: how transitions, reveals and zooms actually move |
| `silence.txt` | Pause lengths, to see how tight the dialogue is |
| `ref-words.srt` | What is said when, to match graphics to words |

Look at every sheet and every motion run. Note the timestamp of each signature move, then open single frames to sample hex colours (Python and PIL on a flat area) and to judge fonts.

## What to extract

For each item, note what the reference does and how this studio can do it with one locked camera:

1. **The look in one line.** For example: "Premium talking head in a dark, warm set, with bright clean graphics landing exactly on the spoken word."
2. **Colour.** Background, accents and their jobs (which colour means danger, proof or default emphasis).
3. **Type.** Hero font (weight, width, italic, case), lead-line font, sizes at 1080x1920. Map them to open fonts available as local woff2 files. The template ships Archivo (900, width 125, italic) and Instrument Sans.
4. **Captions.** Tiers, placement, how words appear, how many on screen, and the language and spelling (the user wants Romanized Hinglish).
5. **Camera.** Zoom range, punch-in speed, how often framing changes, and transitions (the reference's blur-in, for example).
6. **Pacing.** Average shot length, pause tolerance and loudness.
7. **Motion graphics kit.** Each recurring move, when it appears and what triggers it. Map each to a catalogue type in `storyboard.md`, or plan a new builder.
8. **Audio.** Music, SFX style and level.
9. **Safe area and things to avoid.**

## Writing `Brand Kit/brand-kit.md`

Keep the current kit's section order so future edits can find things: the look, Colour (a table of role, hex and use), Type, Captions, Camera, Pacing, Motion graphics kit (a table of move, reference time and when to use), Product truth, Audio, Safe area, Avoid. Start with one line saying which videos it was built from and the evidence (frames viewed, runs, transcript). Mark sampled colours as sampled and eyeballed ones as approximate.

Only write a new kit when the user gives a new reference, or says to ignore or replace the old one. Before writing it, move the old kit into the previous project's folder (for example `Raw/<Old video>/Edit/storyboard/brand-kit.md`), never delete it. Say where it went.

When the kit changes, carry it into the template copy in the new project:

- `storyboard/style.css`: the `:root` colour variables and the `.hero.*` gradients.
- `scripts/render_scene.py` `build_set` and `build_desk`: the set colours (BGR) and the rim-light colour in `compose`.
- `storyboard/fonts/` plus the `@font-face` rules: when the type changes.
