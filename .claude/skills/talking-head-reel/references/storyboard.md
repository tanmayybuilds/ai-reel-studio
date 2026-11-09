# Storyboard: plan, camera, motion graphics, review

## Contents

1. `edit-plan.json`
2. `storyboard.json`
3. Camera
4. Layout map
5. Overlay catalogue
6. Design rules
7. Assets
8. Review rounds

## 1. `edit-plan.json`

This file sets the dialogue only, as the list of beats in playback order:

```json
{"beats": [
  {"id": "beat-02", "segments": [[90.42, 93.82]]},
  {"id": "beat-04", "segments": [[111.00, 114.92], [115.18, 116.33]]}
]}
```

- `segments` are `[in, out]` pairs in dialogue seconds, taken from the take map. That means voiceover time when there is a voiceover, otherwise camera time. A beat can join several pieces, which is how a stumble or a pause is removed inside one line.
- Keep beat ids stable once the user has seen them, because `reviews.json` is keyed by id. When a beat is removed, drop it and do not renumber the rest.
- `cut_audio.py` adds `start`, `end`, `duration` and `frames` (source frame ranges). Never edit those by hand.

## 2. `storyboard.json`

Top level:

```json
{"title": "VoiceStudio Reel", "video": "media/rough-cut.mp4", "styleLine": "Style from the ... reference. Preview 720p; final 1080x1920 with sound effects.",
 "note": "dialogue from your voiceover", "duration": 44.8, "sourceName": "MVI_0392.MOV", "beats": [...]}
```

`duration` and `sourceName` are written by `cut_audio.py`. Each beat:

| Field | Meaning |
| --- | --- |
| `id` | Same id as in the edit plan |
| `title` | Short name shown on the card, such as "Hook: danger line" |
| `scene` | `aroll` (speaker on the set) or `white` (a full white board covers the speaker). This is a label; the `white` overlay draws the board |
| `spoken` | The exact words, written in the caption language from `studio.json` (for example Romanized Hinglish). This is the caption text the user approves, and the SRT text |
| `camera` | Zoom keys, see section 3 |
| `cameraNote` | One plain sentence on what the camera does and why |
| `graphics` | `[["trigger word", "what appears"], ...]`, the promise to the user that every graphic has a spoken trigger |
| `assets` | `[{"label": "README, Repo-screen-recording.mp4 @ 0:05", "file": "assets/readme.jpg"}]`, the real material used, shown as thumbnails |
| `overlays` | What the motion layer draws, see section 5 |
| `faceY` | Optional. The face's height on the 1920 stage (default about 640). Use 1010 to put the speaker low under a top graphic, or 500 to 590 to leave the bottom half free |
| `noBlur` | Optional. Skip the blur-in at the beat's start (for a hook, or when a graphic covers the cut) |
| `blurAt` | Optional. Extra blur-ins inside the beat, in beat seconds, at an internal cut such as the end of a white board |

Write the card text in the user's language. Their review is the quality gate, so the card must say plainly what they will see.

## 3. Camera

`camera` is a list of `[time, zoom, transition]` keys in beat seconds. The first key is the starting zoom. Each later key eases (cubic in-out) to its zoom over `transition` seconds, starting at `time`.

- Zoom 0.62 to 0.7 is wide, with room for graphics and the desk visible. Zoom 0.86 to 1.0 is a tight punch-in.
- **Punch-in:** `[wordAt, 0.9, 0.22]` on the hero word. This is the main emphasis move.
- **Slow push:** `[[0, 0.64, 0], [0.1, 0.72, 3.2]]` across a tense line.
- **Hold:** `[[0, 0.66, 0], [0, 0.66, 0]]` when a big graphic needs the space.
- Change the framing on every cut, so two neighbouring beats never share a zoom.
- Every cut opens with a 0.28 s blur-in unless `noBlur` is set. `make_sfx.py` puts a soft whoosh on each beat start and each `blurAt`.

By default (`bgMode: "room"` in `project.json`) the speaker stays in their real room, lightly blurred (`bgBlur` 5) like a video call. The user prefers this to a cutout, because matte edge errors disappear in it. Leave out `bgMode` to use the older look instead: the speaker cut out with the clean-plate matte and placed on the procedural dark set with a desk, with the backdrop moving less than the speaker for depth. The set colours are in `render_scene.py` `build_set`, and they follow the brand kit. See `render-and-deliver.md` for room mode's talk plate.

**`bgMode: "plain"`** (approved on the Sarmila reel, 8 Nov 2026) is for footage that can't or needn't be matted, such as a portrait phone clip that already fills 9:16, with no empty-room plate. The whole frame is cover-scaled, framed on the face but clamped so the canvas never shows, then graded and sharpened for the upscale. The grade is an S-curve (`contrast` 0.028), `warmth` [B, G, R] multipliers (default [0.97, 1.0, 1.035]), `saturation` 1.1, `vignette` 0.22 and `sharpen` 0.55, all settable in `project.json`. **Zoom means something different here:** 1.0 is the whole source frame, and 1.1 to 1.45 are punch-ins, so plan camera keys in that range. Start such a project with `new_project.py ... --bg plain`. When the source has a screenshot baked into the frame, cover it with `darkBoard` or a pre-rolled `sheetList`. When the source was already jump-cut by someone, keep beat edges off its cuts.

## 4. Layout map (1080x1920 stage)

| Zone | y | Use |
| --- | --- | --- |
| Top band | 130 to 720 | `repoScroll`, `stars`, top cards when the face is low (`faceY` 1010) |
| Face, default | about 450 to 820 | Keep captions and cards off the mouth |
| Chest caption band | 850 to 1370 | `cap` default `y` 1130; two-tier captions sit here |
| Lower cards | 1040 to 1560 | `commentSheet`, `duo`, `code`, `verify`, `tiles` |
| Instagram UI | below 1560, right rail x > 1010 | Keep key content out |

Safe area: x 70 to 1010, y 180 to 1560. `cap.y` is the top of the caption block. A two-tier caption with a two-line hero takes about 330 px.

## 5. Overlay catalogue

Every overlay has `type`, `in` and `out` (beat seconds; visible while in <= t < out). Word times such as `[["Kyunki", 0.03], ...]` come from the speech evidence. Times are in beat seconds and coordinates are in stage pixels.

| Type | Fields | What it does, and when to use it |
| --- | --- | --- |
| `cap` | `y`, `lead` [[word, at]], `word`, `wordAt`, `tone` (the accent name, e.g. `cyan`; or red, green, white), `tail` [[word, at]], `ink`, `oneLine`, `karaoke` | The two-tier caption. Lead words blur in one by one, the hero word wipes in left to right, and the tail words follow. `ink: true` gives dark text for white boards. A hero longer than 12 characters splits into lines unless `oneLine`, and `\|` in `word` forces a break. It auto-fits to 940 px. **`karaoke: true`** switches to the karaoke style (approved on the Sarmila reel): the lead and tail sit in a frosted pill, every word pops in on its time, and the word being spoken carries an accent box until the next one lands. A third item marks keywords, which keep their colour: `["licensed", 1.08, "key"]` (accent), `"red"` or `"gold"`. The hero word lands with a scale-in and a light sheen, and its sound is a hit plus a shimmer. `tone` can also be `gold` (champagne, for neutral numbers). Use one style per reel, from `studio.json` `captionStyle` |
| `stack` | `top`, `bottom`, `bottomAt` | A white word above a red word that slams in. For the final call to action |
| `tiles` | `y`, `items` [{text, at, row, hot, small}] | White tiles pop into a grid. For spoken lists or steps. `hot` marks the active one, `small` is for long text |
| `pill` | `y`, `icon` (x or check), `words` [[w, at]] | A glass pill with a red cross or green check, typed word by word. For yes or no claims |
| `white` | — | A full white board over the speaker. Pair it with `ink` captions and `slotCard` |
| `slotCard` | `src`, `x`, `y`, `w`, `h` | A real screenshot rising into a dashed slot on the white board |
| `slots` | `y`, `items` [{src, at}] | A column of slots filled one by one, with a hand cursor travelling to each |
| `panel` | `src`, `x`, `y`, `w` | A white card holding a real screenshot, over the footage |
| `appWindow` | `src`, `x`, `y`, `w` | A real app screenshot rising with a 3D tilt and a slow push. For "this repository or app" lines |
| `appCard` | `x`, `y`, `w`, `script`, `button`, `press` | A UI card whose waveform starts when its button is pressed at `press` |
| `code` | `label`, `text`, `x`, `y`, `w` | A terminal card with a real command. For install steps |
| `waveBadge` | `x`, `y` | A small round live waveform. A companion to voice words |
| `wave` | `y` | A wide waveform strip that rises in pitch |
| `stars` | `value`, `label`, `suffix` | A big counter counting up to the value, with "k+" by default |
| `repoPin` | `name`, `label`, `hidden` | A GitHub repository card. `hidden` covers the name for a later reveal |
| `repoScroll` | `src` (tall image), `text`, `from`, `to`, `stars`, `countFor` | A real page scrolling from `from` to `to` px, with a ticker and an optional star chip counting up. For hooks about a repo or page |
| `browser` | `x`, `y`, `w`, `h`, `url`, `typeAt`, `loadAt`, `src`, `from`, `to`, `owner`, `name`, `stars` | A glowing browser types the URL, loads the real page with a shine, shows owner/name and stars, then scrolls. For a spoken link |
| `duo` | `y`, `items` [{at, tone, big, label, note}] | Two big stat cards, such as `</>` Open source and ₹0 Free. For paired claims |
| `verify` | `y`, `doneAt` | A laptop with a scan line, then a green check. For "it checks or verifies" lines |
| `notify` | `y`, `title`, `note`, `badge`, `initial` | A dark notification row. For messages and DMs |
| `commentSheet` | `text`, `typeAt`, `sendAt`, `dmAt`, `dmTitle`, `dmNote`, `when`, `initial`, and optionally `times`, `keepCase`, `you`, `dmBadge`, `style` | The premium comment call to action. A glowing sheet rises, the keyword types in big letters, send bursts, the comment posts with a heart, a paper plane flies and a DM row arrives. The user approved this one after asking for a better comment graphic. `times` gives one time per letter, for a spelled-out keyword ("R-E-S-P"). `keepCase` keeps the keyword's case in the posted comment. `style: "dm"` gives the darker DM variant with an accent avatar and a gold sender face |
| `hand` | `from` [x,y], `to` [x,y], `tap` | A cursor hand moving to a point and tapping, with a ripple. Pair it with buttons, slots and send |
| `typer` | `y`, `text`, `typeAt`, `step` | A glass text field typed slowly by hand, with a mini keyboard pressing each real letter. Every character gets a small deterministic hesitation around `step` seconds, and `make_sfx.py` puts a key clack on the same times. The approved Handy hook: `{"type": "typer", "in": 0, "out": 1.58, "y": 960, "text": "Abhi bhi haath se type kar rahe ho?", "typeAt": 0.05, "step": 0.036}`. For hooks about typing or a question on screen |
| `price` | `y`, `name`, `plan`, `value`, `countAt`, `strikeAt`, `initial`, `unit`, `stamp` | A subscription price card. The amount counts up from $0 to `value` at `countAt`, then a red strike slams through with a stamp (default "NAHI") at `strikeAt`, and the card shakes and goes dead. `unit` defaults to "/ month". The approved Handy example: `{"type": "price", "in": 0.42, "out": 2.1, "y": 880, "name": "Wispr Flow", "plan": "Pro", "value": 15, "countAt": 0.55, "strikeAt": 1.15, "stamp": "NAHI"}`. For "you don't have to pay for X" lines. A price on screen can go stale, so flag it in the delivery message |
| `tokenMeter` | `y`, `value`, `countAt`, `dur`, `label`, `unit`, `freeAt`, `stamp` | A glowing glass meter whose odometer digits roll from 0 to `value` (comma-grouped), with orbiting coins and an optional green stamp (default "FREE") at `freeAt`. For big spoken numbers. Approved on Muse: `{"type": "tokenMeter", "in": 0.86, "out": 3.12, "y": 990, "value": 1000000000, "countAt": 0.96, "dur": 0.9, "label": "Muse tokens", "unit": "TOKENS", "freeAt": 2.36, "stamp": "FREE"}` |
| `codeFlap` | `y`, `code`, `flapAt`, `step`, `label`, `button`, `pressAt` | A field whose characters flap like an airport board and land one by one on the real code, then the button is pressed at `pressAt`. For referral, promo or invite codes |
| `timeline` | `y`, `title`, `runAt`, `dur`, `toMin`, `marks` | A video-editor timeline: thumbnails stream in while the playhead runs and the length counter climbs to `toMin` minutes. For lines about video length or editing |
| `stepRail` | `y`, `steps` [names], `active`, `activeAt`, `enter` | A slim progress rail of how-to steps across the top. The spoken step lights in the accent and finished steps turn green. Repeat it on each step's beat with the next `active` and `enter: false`, so it stays put. For tutorials |
| `offerTimer` | `y`, `title`, `tag`, `tagAt` | An offer countdown whose digits scramble, with a pulsing red rim and a tag. For "limited time, nobody knows how long" lines |

Added on the Sarmila reel (approved 8 Nov 2026). Text fields written as `[[word, at, key?], ...]` are karaoke word lists. `tone` is the accent name, `red` or `gold`.

| Type | Fields | What it does, and when to use it |
| --- | --- | --- |
| `chart` | `y`, `h`, `w`, `x`, `mode` (flat, down, compound, up), `tone`, `icon` (bank, fund, grad, boy, doc, school), `title`, `titleAt`, `sub`, `subAt`, `drawAt`, `drawFor`, `stats` [{label, value, decimals, prefix, suffix, at, dur, tone}] (numbers, not text), `marks`, `tag`, `tagTone`, `tagAt` | A glass card with a line chart that draws itself: flat (money sitting idle), down (losing value), compound (exponential growth) or up. Stat chips count up on their word. For money, growth and returns. Example: `{"type": "chart", "in": 1.4, "out": 5.4, "y": 1130, "h": 410, "mode": "flat", "tone": "red", "icon": "bank", "title": "Your savings", "titleAt": 1.56, "sub": "sitting in the bank", "subAt": 2.56, "drawAt": 2.86, "drawFor": 1.7, "tag": "RATE OF RETURN", "tagAt": 4.47, "tagTone": "red"}` |
| `counter` | `y`, `value`, `at`, `dur`, `from`, `prefix`, `suffix`, `decimals`, `label`, `labelAt`, `tone` | One huge number counting up on its word, with a label under it and a ring pulse when it lands. For a single spoken number ("17 years") |
| `progress` | `y`, `label`, `at`, `dur`, `endAt` | A video progress bar whose playhead runs to the end. For "watch till the end" |
| `nameCard` | `y`, `eyebrow`, `name`, `nameAt`, `title` (karaoke list), `checkAt`, `chip` (karaoke list), `kids`, `kidsAt` | An intro lower third: an eyebrow ("I'm"), the name wiping in, a credential line with a check, and a chip. For "I'm X, a licensed Y" openers |
| `profile` | `y`, `tone`, `label` (karaoke list), `age`, `ageAt`, `ageLabel`, `capAt`, `chips` [{text, at, icon, tone}] | A person card: an avatar (a mortarboard drops on at `capAt`), a label, an age counter and chips. For "my son / my client is 18" stories |
| `transfer` | `y`, `chip` (karaoke list), `from` {icon, title, sub, at}, `to` {icon, title, sub, at}, `coin`, `flyAt`, `style` | Two cards with a lane between them, where coins labelled `coin` fly from one to the other and the target lights up. For "I moved X from A to B" |
| `darkBoard` | `fade` | A full-screen deep accent board over the speaker. Use it behind cards, or to hide something baked into the source frame |
| `flash` | `tone`, `dur`, `peak` | A quick full-screen edge flash (red for a shock word) |
| `proof` | `x`, `y`, `w`, `src`, `ring` [x%, y%, w%, h%], `ringAt` | A real screenshot tilting up into place, with a ring landing on the key number. For "here's the proof" lines. Crop out private details first |
| `compare` | `y`, `h`, `items` [{label, icon, tone, value, decimals, suffix, h (bar %), at, dur}] | Two bars rising and counting: a tiny one against a tall one. For "A gives 1%, B gives 40%" |
| `sheetList` | `y`, `rows` [{icon (x, check, bank), at, words (karaoke list), endAt}], `riseAt` | A bottom glass sheet with rows whose words are karaoke captions. A `riseAt` earlier than `in` pre-rolls the entrance, so the sheet is already in place on the beat's first frame. For disclaimers and do/don't lists |
| `statement` | `y`, `title`, `sub`, `rows` [{k, v, at, hot}], `lensAt`, `hotAt` | A white account-statement card. A magnifier glides to the hot row, which lights up. For "check your statement" lines |

To add a new graphic, add a builder to `storyboard/motion.js` and its style to `style.css`, then add a row here. Builders push WAAPI keyframes into `ctx.anims` (`{node, at, dur, ease, frames}`) and per-frame functions into `ctx.ticks` (`t => ...`). Everything must depend only on `t`, never on wall-clock time or randomness, so the preview and the render match frame for frame. Give a builder that must stay hidden until its time a leading `opacity: 0` keyframe.

Example beat (the approved name reveal):

```json
{"id": "beat-05", "title": "Naam ka reveal", "scene": "white",
 "spoken": "To bhai ye hai VoiceStudio. Ye ek aisi GitHub repository hai jiske help se aap kisi bhi awaaz ko easily clone kar sakte ho.",
 "camera": [[0, 0.7, 0], [5.1, 0.9, 0.22]], "blurAt": [4.18],
 "cameraNote": "Pehle white board, phir tum wapas, \"easily clone\" pe punch-in.",
 "graphics": [["VoiceStudio", "Word reveal"], ["GitHub repository", "Asli README card slot mein"], ["easily clone", "Bada cyan word"]],
 "assets": [{"label": "README, Repo-screen-recording.mp4 @ 0:05", "file": "assets/readme.jpg"}],
 "overlays": [
   {"type": "white", "in": 0, "out": 4.18},
   {"type": "cap", "in": 0.04, "out": 4.18, "ink": true, "y": 340, "lead": [["To", 0.04], ["bhai", 0.13], ["ye", 0.36], ["hai", 0.49]],
    "word": "VOICESTUDIO", "wordAt": 0.55, "tone": "cyan", "tail": [["ye", 1.43], ["ek", 1.49], ["aisi", 1.62], ["GitHub", 1.88], ["repository", 2.3], ["hai", 2.95]]},
   {"type": "slotCard", "in": 1.43, "out": 4.18, "src": "assets/readme.jpg", "x": 70, "y": 700, "w": 940, "h": 302},
   {"type": "hand", "in": 1.3, "out": 2.4, "from": [980, 1500], "to": [560, 900], "tap": 1.9},
   {"type": "cap", "in": 4.18, "out": 6.76, "lead": [["kisi", 4.2], ["bhi", 4.45], ["awaaz", 4.65], ["ko", 4.95]],
    "word": "EASILY CLONE", "wordAt": 5.1, "tone": "cyan", "tail": [["kar", 6.0], ["sakte", 6.2], ["ho", 6.55]]}]}
```

`references/examples/voicestudio-storyboard.json` has all 13 beats of that approved reel, and is the best source of patterns to copy. Its tones say `indigo`, the accent of that time, so change them to the current accent name.

**Generate the storyboard from a script.** For anything past a few beats, write `scripts/build_storyboard.py`, which builds `storyboard.json` from the speech evidence with helpers such as `w(beat, word)` for word times. Then edit the script, not the JSON. Re-running it after a re-cut re-times every caption and graphic. `references/examples/build_storyboard_muse.py` is a complete, approved example.

## 6. Design rules

- **Trigger first.** Find the trigger word's time in the speech evidence, then set the graphic's `in` 0.05 to 0.3 s before it, so the graphic is on screen as the word lands.
- **One idea on screen.** When tiles, pills or cards carry the words, they are the caption. Don't stack a lead line on top.
- **One accent per caption.** The accent tone is the studio's accent colour. Its name and palette are in `storyboard/accent.json`, set with `scripts/set_accent.py` (the template ships `cyan`). Red is for danger or the final CTA, and green is for a positive proof (free, verified, done). Only the current accent name exists in `style.css`, so when you copy a beat from an older storyboard (`indigo`, `amber`), change its `tone` to the current name.
- **Every spoken word is captioned somewhere.** That might be the lead line, the hero word, the tail, a tile or a card.
- **Real material, legible size.** Crop screenshots until the text reads on a phone. A full desktop screenshot is too small.
- **Fill the frame on key beats.** Hooks, the product reveal and the CTA get the richest graphics. A plain beat between two big ones is fine; that is pacing.
- **Hooks.** The first beat needs motion in the first 0.3 s and a reason to keep watching. A scrolling real page with a ticker and a counter worked. A face that looks cropped or awkward did not.

## 7. Assets

Pull stills from screen recordings with FFmpeg (`-ss <t> -i rec.mp4 -frames:v 1`), then crop with OpenCV or the `crop` filter into `storyboard/assets/*.jpg`. Turn a scrolling recording into one tall image with `scripts/stitch_scroll.py rec.mp4 storyboard/assets/page.jpg --crop x0,y0,x1,y1`. The `from` and `to` of `repoScroll` and `browser` are pixel offsets into it. Look at each asset before using it.

## 8. Review rounds

The dashboard saves `reviews.json` as `{beat-id: {status, feedback, updatedAt}}`. Statuses are `pending`, `approved` or `rejected`. Each round:

1. Read every entry and every word of the feedback, approved beats included. Read the chat notes too.
2. Write `scripts/apply_roundN.py`, which loads `storyboard.json`, updates each beat with a small `beat(id, **fields)` helper and saves. Keep earlier rounds' scripts, so the history can be replayed. If the storyboard comes from `build_storyboard.py`, make the round's changes there instead.
3. If segments changed, edit `edit-plan.json` and re-run `cut_audio.py`. Then re-time captions from the new evidence.
4. Re-render the changed beats with `render_scene.py --height 1280 --only beat-03,beat-07`. This rebuilds the rough cut too.
5. Run QA with `qa_sheet.cjs` and look. Then tell the user what changed per note, and what could not change and why.

A rejected beat with "remove this" leaves the plan. A rejected beat with notes gets reworked and shown again. When the user says "start render", apply any notes still pending first. They usually expect that, so say that you did.
