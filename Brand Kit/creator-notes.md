# Creator notes: Tanmay Builds

Standing preferences and lessons from every reel edited in this studio so far. Read this together with `brand-kit.md` at the start of every edit. When a new reel teaches something, add it here.

## Standing preferences (from the user's own feedback)

- **Romanized Hinglish captions, never Devanagari.** The user switched from an early Devanagari brief to Romanized captions, and it has stayed that way ever since. Whisper with `-l hi` writes Devanagari, often misspelt, so read it by sound and write the caption in Latin script.
- **Graphics only for what is spoken.** "Unnecessary motion graphics" was a direct note (3 Nov 2026). Every graphic needs a trigger word on its storyboard card.
- **Storyboard first, render on "start render".** Approved reels went through the dashboard, then feedback rounds, then the render. The user sometimes approves every beat in chat instead of `reviews.json`. That counts, but read every note.
- **Real room, lightly blurred.** On Whitestair the user rejected a cutout on the dark set (ragged shoulders, specks, a hair prong) and asked for the "original background with blur effect … like in the meetings". Room mode has been the default since then.
- **Best takes, with exact wording.** The user records retakes and expects the best take of every line, usually a later one, with every word right ("clone kar sakte ho", not "clone sakte ho"; "abliterated", not "obliterated"). Tell them which take you chose and why. If they say a better take exists, check both tracks end to end.
- **Fast and punchy, built to go viral.** "Do it faster" has come up more than once: tighten pauses, render beats in parallel groups with `--only`, and keep extra transcription passes minimal.
- **Proper layered SFX.** The user liked the layered set on Whitestair and asked for "proper SFX" on Handy and "better SFX" on the Abliterated reel.
- **Real assets, logos unaltered.** Use the user's screenshots and recordings. Crop, never recolour. Use the official icon when their crop is cut off.
- **A new accent colour is a common ask.** It has gone indigo, amber, cyan, then lime. When asked for a new colour, propose one that complements the product's UI, reads on white boards and on the pink room, and stays clear of red and green. Save the old kit first.
- **Only what was asked.** A reel recorded during Diwali was not a Diwali reel. Don't add themes, claims or text the user didn't ask for.

## Reel history

| Reel | Date | Status | Accent | What it added or taught |
| --- | --- | --- | --- | --- |
| VoiceStudio | 3 Nov 2026 | **Approved** (v3) | indigo | The whole workflow. Repo scroll hook, app window, duo cards, browser link reveal, verify scan, comment sheet. The mint opener was rejected. |
| Whitestair Captions | 4 Nov 2026 | **Approved** (v2) | amber | Room mode (`bgMode: "room"`, MatteV3, talk plate) after v1's cutout was rejected. Layered SFX (`make_sfx.py`). |
| Handy (Wispr Flow alternative) | 5 Nov 2026 | **Approved** (v1) | amber | `typer` hook with a live keyboard and the `price` strike card. Gotcha: room mode needs `analysis/talk-plate.jpg`, and pick a clean plate with settled exposure (0.2 s was dark, 1.8 s worked). |
| Muse AI (1B free tokens) | 6 Nov 2026 | **Approved** (v1) | cyan | `tokenMeter`, `codeFlap`, `timeline`, `stepRail` and `offerTimer`. Whisper word times drift up to 0.5 s, so cut on silencedetect pauses. The camera keeps rolling (the user stands up), so cover it with an end card. |
| Abliterated GLM model | 8 Nov 2026 | Rendered v1, **awaiting approval** | lime | Karaoke-highlight plain captions (`capWords`), `proofShot` builder. Gotcha: Whisper pins the first word to 0 s when a beat opens on silence, so measure the real onsets. These builders are not in the template until approved. |
| Client reel: financial advisor, RESP (English) | 8 Nov 2026 | **Approved** (v1). The video is kept out of this public repo because it is client content | emerald `#2EF5A0` / `#00B874`, champagne-gold numbers | First **English** reel: captions in English, Whisper `-l en` (`hi` produced garbage). New `bgMode: "plain"` for a 536x954 phone clip with no matte (the whole frame cover-scaled, zoom 1.1 to 1.4, a cheap OpenCV grade). Karaoke captions with an emerald box, plus builders `chart`, `counter`, `progress`, `nameCard`, `profile`, `transfer`, `darkBoard`, `flash`, `proof`, `compare`, `sheetList`, `statement`. Hid a screenshot baked into the frame under a dark board or sheet. Gotchas: a CSS class named `key` collides with the typer keyboard, so use `kw-key`. Single-pass loudnorm came out at -16 LUFS, fixed with limiter, gain, limiter. Plain mode and these builders live in that project only and are **not yet in the template**. |
| Client edits (podcast-window style) | 7 Nov 2026 | v1 sent, waiting for client assets | coral ember | The `podcast-window-reel` skill. v1 uses generated cards and a drone bed, then the client gets an asset list, then v2 uses their assets. Use a 4:5 window for close selfies. |

The approved finals of Tanmay's own reels and their SRTs are in `Approved Videos/`. Client finals stay on the local machine only. Frame studies of each own reel are in `Editing Style/Reference Analysis/Approved */`.

The two reference videos are not in this public repo (they are other creators' reels). Their frame studies are in `Editing Style/Reference Analysis/Ready to upgrade your edits/` (the house style) and `Ref 2026-11-07/` (the podcast-window style). To study them again, ask the user for the links and download them with `yt-dlp -P References "<url>"`.

## Recording habits (useful for planning)

- Camera: a locked-off landscape shot (MOV, for example 1920x1080 at 25 fps) in a pink room with a red paisley wall, reframed to 9:16 by the renderer. A phone or WhatsApp voiceover is recorded at the same time.
- Retakes are said as whole sentences, usually several times. The later take usually wins.
- An empty-room moment is sometimes at the start or end. When it isn't, the matte falls back to segmentation only (fine in room mode).
- Screenshots and screen recordings go in `Raw/<Video>/Assets/`. Some are WhatsApp-compressed, so crop carefully and stitch scrolling recordings with `stitch_scroll.py`.
