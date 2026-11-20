---
name: property-tour-reel
description: Turn a property's photos and short clips, plus its listing details, into a finished vertical 1080x1920 walkthrough reel for Instagram, Shorts or TikTok, in the style of the 99acres "AI Listing" reels but better. Every reel has two halves. The first half is fast: an opening photo collage with a big "2 BHK" title, then beat-synced one-second shots where the camera never stops (big pushes, pans and orbits with 3D depth parallax), whip and zoom transitions and a punch label per room. The second half is slow: room by room, gentle keyframed moves, a detailed voiceover (free local AI voice or the user's own), room labels, counting stat chips, a room tracker and an agent contact card. Music and SFX are mixed in. The user only hands over material and gets the video back; no editing software is shown. Use it whenever the user gives house, flat, villa, plot or office photos or clips and wants a property video, listing reel, walkthrough, real-estate ad or "video like the 99acres one", or gives feedback on one.
---

# Property tour reel

The user gives you everything (photos, clips, listing facts, agent details) and gets back a finished video. **Do not show them an editor or any editing UI.** They review the video itself and reply in chat. (`editor/` exists only because the renderer uses its engine. Open the editor UI only if the user asks for it by name.)

## The house format (decided with the user on 20 Nov 2026: reference style plus a fast hook)

Write `plan.json` with `"style": "reference"`, `hook`, `shots`, `specs` and `outro` (see `references/tour-json.md`). This is what the 99acres reels actually do, measured frame by frame:

1. **Hook (about 6 s):** a dark background, then one rounded photo card grows, splits into 2 rows, then 3 rows of rounded cards that slide sideways like carousels (alternate directions, staggered). The middle row's last card is the hero, which expands to full screen. "2 BHK" fades in **letter by letter in random order**, with the project and locality line and a price chip, and a light sweeps across the title.
2. **One long shot per room (6 to 12 s):** a single smooth, eased pan across the whole photo (landscape photos pan sideways full-bleed; portrait photos pull out slowly), with light depth parallax. No quick zooms and no keyframe-y moves.
3. **Transitions (0.45 to 0.6 s), rotating:** `lens` (zoom through a fisheye bulge, then the next room un-bulges), `mirror` (whip away, then a mirrored, stretched reveal that resolves), `spin` (rotational blur), `whip`. A white `flash` goes into the spec card, and a `fade` into the end card.
4. **Labels:** centred white words over an accent underline, with letters appearing and vanishing in random order (`style: "ref"`) and an optional `sub` line (for example "770 sq ft carpet area").
5. **Voiceover runs almost non-stop:** one descriptive line per shot about what is visible, plus facts from the listing, over a calm music bed (no drums), at about 2.5 words per second.
6. **Spec card ("At a glance"):** icon tiles pop in one by one, with numbers counting up (beds, baths, balcony, area, floor, facing, parking, furnishing), taken from the listing screenshots.
7. **White end card:** price, "Listed by", agency, badge, and footer facts.

**Use only the photos that are needed:** one strong photo per room, drop near-duplicates, close-ups that add nothing, CGI renders and other flats. **Order the shots by the listing's layout** (living and dining, kitchen, bedrooms, baths, balcony), using the listing screenshots for the room count.

The older two-act format (`"style": "twoAct"`: a fast beat-cut half, then a slow half) is still available if the user asks for it.

Read `references/style-guide.md` for the decoded reference and timings, and `references/tour-json.md` for the `plan.json` and `tour.json` fields.

Standing rules: real facts only (never invent a number, room or view, and flag anything on screen the user didn't give you); never overwrite (projects are `Tour`, `Tour-v2` ...; exports are `-v1`, `-v2` ...); say what you could not check (you can't hear the voice, music or SFX); keep text inside the Instagram safe zone (x 72 to 950, y 220 to 1490); nothing goes to `Approved Videos/` until the user approves the final.

## Setup (once per machine)

```
$py .claude/skills/property-tour-reel/scripts/install_models.py
```

`$py` is `Tools/vision-venv/bin/python` (macOS and Linux) or `Tools\vision-venv\Scripts\python.exe` (Windows). This installs the Kokoro voice, the Depth Anything model and the Swin2SR upscaler (about 275 MB, checked by SHA-256).

## Workflow

### 1. Collect

From the user's message, or ask once for what's missing:

- photos and clips,
- listing facts: BHK or type, project, locality, price, carpet area, floor, facing, furnishing, features per room, landmarks,
- agent: name, company, phone or WhatsApp, "since" year, RERA number, `agent.jpg`, `logo.png`,
- target length (default 60 s),
- voice: a free AI voice (default `af_heart`), a macOS Indian-English voice (`--engine say --voice Aman`), or their recordings in `Voice/` (`intro.m4a`, `room-01.m4a` ... `outro.m4a`),
- music: a licensed track in `Music/` (its tempo is detected and the fast cuts land on its beat). Otherwise a generated placeholder is used, and you say so.

Put photos and clips in `Raw/<Property>/Photos/`, listing screenshots in `Raw/<Property>/Listing/`, and anything not to use (CGI brochure renders, photos of another flat) in `Raw/<Property>/Unused/`. `prep_media.py` skips `Listing/` and `Unused/`. Then:

```
$py .claude/skills/property-tour-reel/scripts/new_tour.py "Raw/<Property>" --title "2 BHK Vikhroli"
```

Run everything below from `Raw/<Property>/Tour`.

### 2. Prepare the media

`$py scripts/prep_media.py`. Photos under 1000 px (portal downloads are often 320 px) are AI upscaled x4 first (Swin2SR real-world, about 10 s each). **Look at `analysis/media-sheet.jpg`.** Identify the rooms from the pictures, pick the hero (the best wide living-room or view shot), and drop near-duplicates and weak shots (it flags dark, soft and low-resolution ones).

### 3. Write plan.json

- `length`: the target seconds (60 by default).
- `intro`: hero, 6 to 8 varied tiles, title ("2 BHK"), sub (project · locality), price, and a **short hook** `vo` of 8 to 12 words.
- `rooms` in visit order (living, dining, kitchen, bedrooms, baths, balcony and view, amenities). Each room has `room` (one word, used for the punch label and tracker), `label` (2 to 4 true words), `media` (1 or 2 best shots for the slow half), `fastMedia` (every usable shot of that room for the fast half), `vo` (one detailed sentence of 10 to 14 words with real facts), and `stats` (only numbers the user gave, and only on a room whose line says them).
- **Voice budget:** all room lines plus the outro should total about `(length/2 - 6) × 2.45` words (about 59 words for a 60 s reel). `build_tour.py` warns when the detail half runs long.
- `outro`: headline, CTA, and a short `vo`. `agent`: the card.

Show the user the script (hook, room lines, labels, stats) in chat as a short table only if facts are uncertain. Otherwise go straight on.

### 4. Build, check and render

```
$py scripts/voiceover.py
$py scripts/build_tour.py          # prints both halves; check the fast half is about length/2, at the music bpm
node scripts/render_tour.cjs --stills <collage 1.2>,<title>,<a few fast shots and transitions>,<act switch>,<slow labels>,<card>
```

**Look at the stills.** Check that punch words and labels are readable, no picture edge shows, parallax doesn't tear (lower `parallax` on that shot), and text stays in the safe zone. Fix `plan.json` and rebuild, or adjust `tour.json`. Then:

```
$py scripts/make_audio.py
node scripts/render_tour.cjs       # in the background; about 2 min for 60 s
$py scripts/assemble.py            # Exports/<Property>/<slug>-vN.mp4 + SRT, with checks and export-sheet.jpg
```

Read the checks (1080x1920 at 30 fps, A/V lengths equal, -14 LUFS, no black frames) and **look at `analysis/export-sheet.jpg`**.

### 5. Deliver and revise

Send the MP4 with SendUserFile. Say briefly what's in it (length, the two halves, the voice, whether the music is a placeholder), list every on-screen fact, and say what you couldn't check (the voice and how names are pronounced, the music, the SFX). Ask for changes.

For changes: wording means editing `plan.json`, then `voiceover.py --only room-03`, then `build_tour.py --retime` (or a full `build_tour.py` if the order or photos changed). Re-run `make_audio.py`, render and assemble. Each round is a new `-vN` export. When they approve, copy it and the SRT to `Approved Videos/<Property>/`, compare SHA-256 hashes, and note it in memory.

## Files

- `scripts/new_tour.py` (scaffold), `scripts/install_models.py` (models).
- `template/scripts/`: `prep_media.py`, `voiceover.py`, `build_tour.py` (the two-act builder, beat detection, camera presets), `make_audio.py` (voice, beat-grid music, SFX, loudness, SRT), `render_tour.cjs` (headless Chrome, frame-exact), `assemble.py`, `tourlib.py`.
- `template/editor/`: `engine.js` (the WebGL renderer: camera keys, depth parallax, transitions, text layer), `overlay.css` (all on-screen type), `render.html` and `server.cjs` (used by the renderer). `index.html`, `editor.js` and `editor.css` are an optional UI that is not part of the workflow.

## Gotchas

- **CGI renders and brochure images** are not the flat. Never put them in the tour; move them to `Unused/` and tell the user.
- **Portal watermarks** (magicbricks, 99acres) stay visible. Don't try to remove them. Tell the user to get clean originals from the owner or agent, and to make sure they may reuse the photos.
- **Landscape photos become card shots** automatically (`frame: "card"`): a rounded card at the photo's own shape over a blurred copy, with the label below it at y 1250 and the stats in a row above it. A 320 px landscape photo cropped to fill 9:16 would be stretched about 8x. In the fast half, card and full-frame shots alternate.
- **Few photos:** with fewer than about 12, set `"fast": {"beatsPerShot": 3}` (1.5 s shots at 120 bpm, still on the beat, the camera still moving at full speed) so photos don't repeat too often.
- **No phone number** in the listing: set `outro.ctaMain` (for example the agency name) and `cta: "Listed by"`. Never invent a number. `agent.badge` adds a line such as "Preferred Agent".
- **Fast-half pacing:** shot length is 2 beats (`fast.bpm`, detected from `Music/`, otherwise 120). For more energy, set `"fast": {"bpm": 128}`. Never ease the fast-half moves (`ease: "linear"`); eased moves stop at the ends and the half stops feeling continuous.
- **Parallax tears** at sharp depth edges on big fast moves. Use 0 for photos with mirrors, glass or people.
- **Baked-in text** (watermarks, old captions) in the source photos shows through. Frame it out or ask for clean photos.
- **Clips:** a clip's length limits its shot. In the fast half, each reuse of a clip starts later in it.
- **Chrome:** renders need Google Chrome with GPU WebGL (`chrome` in `project.json`). Black stills mean a WebGL or Chrome problem.
