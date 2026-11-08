# Takes, sync and cuts

## The tracks

`prepare.py` writes these into `analysis/`:

- `cam16k.wav` and `cam-full.wav`: the camera's own audio (16 kHz mono for analysis, 48 kHz stereo for the mix).
- `vo16k.wav` and `vo-full.wav`: the separate voiceover, when there is one. Often it is the same performance recorded on a better mic, which is why the user calls the file "to be lipsynced".
- `sync.json`: the voiceover offset. Camera time = voiceover time + `syncOffset`. It is measured by correlating loudness envelopes over the whole take, then refined to 1 ms in windows every 15 s. `spread` is the worst disagreement between windows. If it is over one frame (40 ms at 25 fps), the recorders drift. Read the window nearest each beat in `sync.json` and give that beat its own `"syncOffset"` in `edit-plan.json`, which `cut_audio.py` uses instead of the global value. On the VoiceStudio footage the offset was 2.489 s, with 5 ms spread.
- `face-track.json`: the face centre once a second, in source pixels. `render_scene.py` takes a median per segment, so small head moves don't shake the frame.
- `cleanPlate` in `project.json`: the start of a still stretch with no face (the empty room), used for the crisp matte. Check it on the A-roll sheet. If there is none, the matte falls back to segmentation and edges get softer around hair and shoulders. Then tell the user that a few seconds of empty frame at the start or end of a recording makes a much cleaner cutout.

## Finding every take

Run `list_takes.py vo`, and `cam` too, because the two tracks can hold different takes. It splits the track at real pauses (silencedetect) and transcribes each island alone with `-mc 0`, so a retake is never merged with the take before it. Output: `analysis/takes-vo.txt`, one line per island: `start-end (length) text`.

Raise `--floor` (for example -30) if quiet words are lost, and lower `--pause` (0.15) if two takes run together.

## The take map

Write it out (in the chat or `analysis/take-map.md`) before choosing anything. List each script line with every take, its time and its wording:

```
L3  "Kyunki is repository ka use karke aap kisi ka bhi voice clone kar sakte ho"
    95.70-99.33  "...voice clone sakte ho"          missing "kar"  x
    104.75-108.33 "...voice clone kar sakte ho"     complete, confident  <- use
```

Choose by, in order:

1. **Every word right.** Compare against the line the user meant, not just what Whisper heard. Hinglish transcripts mangle words; listen for the structure. Missing helper verbs ("kar", "hai"), doubled words and wrong names all disqualify a take.
2. **Delivery.** Pick the clean, confident read without trailing off. The later take is usually the better one, because people retake after a mistake. Never default to the first take.
3. **Joins.** If no single take is perfect, join pieces at a natural pause (inside the beat's `segments`), never mid-word. Hide a join under a white board or a cut (`blurAt`) when the face jumps.
4. **Complete thoughts.** Each beat ends where the sentence ends.

If the user believes a take exists, scan both tracks before answering, and quote the times you checked. If it really isn't there, say so, and offer to drop the line or use an alternative line that was actually spoken.

## Story order

Reels hook first. Pull the strongest line (danger, surprise or a big number) to the front even if it was recorded later, then the reveal, proof and features, then how to get it, then the CTA. Aim for 35 to 50 s and 12 to 15 beats of 1.5 to 7 s. Cut every pause longer than about 0.25 s between beats. Inside a beat, keep natural breathing unless it drags.

## Cutting and verifying

`cut_audio.py`:

- turns each segment into whole source frames: `src_in = round((vo_in + offset) * fps)`, `frames = round((vo_out - vo_in) * fps)`. The audio is cut from those same frames, so sound and picture can't drift.
- joins pieces with 8 ms fades (no clicks), then loudness-normalises to -14 LUFS, true peak -1.5, to `media/dialogue-master.wav`.
- re-transcribes every beat (`analysis/speech-evidence/<beat>.json`) and prints `word@time` per beat.
- writes the timing into `storyboard.json` and drops storyboard beats that are no longer in the plan.

Read every printed line. With `language: "hi"`, Whisper writes Hinglish in Devanagari, often misspelt (`इस्टिलि कलोन` is "easily clone"). Read it by sound, word by word, against the intended line. If you use Romanized output for captions, write it yourself rather than transliterating Whisper's spelling. Typical failures and fixes:

| Evidence shows | Fix |
| --- | --- |
| A first word clipped ("ye" missing) | Move `in` back 0.05 to 0.1 s |
| A doubled phrase ("aur phir bas aur phir bas") | Two segments overlap or the take repeats; trim one |
| A last word cut ("hai" missing) | Move `out` forward to the end of the word |
| A word from the next take bleeding in | Pull `out` back to the pause |

Use the evidence word times (beat seconds) for caption `lead`, `wordAt` and `tail` times, and for graphic `in` times. Whisper's word starts can be 50 to 100 ms late on Hinglish, so check against the waveform when a hit matters.
