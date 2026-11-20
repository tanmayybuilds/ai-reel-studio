# Property tour style guide

This guide was decoded on 19 Nov 2026 from two 99acres "AI Listing" reels (720x1280 at 25 fps, 57 s and 77 s), frame by frame and from their audio. The reference files are not in the repo. This skill keeps their grammar and improves the craft.

## What the reference does

| Part | Reference | This skill |
| --- | --- | --- |
| Source | Still photos, plus a few short phone pans | The same: photos and clips in any mix |
| Opening (0 to 4 s) | Dark background; rounded photo tiles pop in, then a 2- or 3-tile grid slides; a whip into full screen with "2 BHK" in white bold | Three drifting columns of rounded, shadowed tiles on a tilted grid; the hero tile expands seamlessly into the first shot; a wide italic "2 BHK" title drops in letter by letter with the location and an accent price chip |
| Each room | A slow push or pan on one photo for 3 to 6 s | Keyframed moves aimed at each photo's focus point, with **depth parallax** (Depth Anything V2): near furniture moves faster than the far wall, so stills feel filmed |
| Labels | Small white sans text over a thin blue underline, typed in letter by letter and broken apart on exit, at about 75% of the height | A kicker ("02 · KITCHEN") plus a big Archivo 800 label and an accent underline that draws in, at y 1190 (inside the Reels safe zone), with blur-in letters |
| Transitions | Motion-blur whip pans (most), one fisheye lens warp, one rainbow liquid swirl | Whips inside a room (continuous strip with a 28-tap directional blur, direction matching the camera), a zoom-through between rooms, one lens warp (swirl, barrel and RGB split) mid-tour, and a warm light leak into the outro |
| Numbers | None | Frosted stat chips that count up (carpet area, floor, price), only when the voiceover says them |
| Navigation | None | A room tracker under the Reels header shows where you are in the tour |
| Voice | A neutral AI narrator, one descriptive sentence per room | The same pacing, with Kokoro (free, local) or the user's own voice; lines come from the real listing |
| Music and SFX | A soft bed | A ducked bed (supplied, or a generated placeholder), whooshes matched to each transition, a riser and thump on zooms, pops on the tiles, a boom on the title, ticks on labels, and a chime on the card |
| End card | A white "Interested? Call or View number" card with the agent photo and agency | A dark frosted card over the blurred hero: kicker, headline, agent photo with an accent ring, name, company, "Trusted since", RERA, and a big accent call button with the number |
| Look | Raw phone photos, sometimes tilted or dull | Auto-straightened verticals, a gentle bright-and-airy grade, light film grain and vignette, 1080x1920 output |

## Structure and timing (the user's house format, 20 Nov 2026)

The user asked for this: **half the reel is constant fast movement, half is slow keyframes with detailed info.** A 60 s reel is about 28 s fast and 32 s slow.

**Fast half**
- Intro collage: 8 beats (4 s at 120 bpm). Tiles 0 to 0.5 s, hero expands at 32% of the shot, the title lands 0.35 s later, and the hook voice starts at 0.4 s.
- Shots: 2 beats each (1.0 s at 120 bpm), cut exactly on the beat grid that the music uses.
- Camera: `linear` ease, amplitude 1.6x (push z 1.03 to about 1.35, pan travel up to 0.5, orbit ±0.11 with ±1° roll). It never stops.
- Transitions: a whip (0.3 s) in the direction the picture flows, or a zoom-through (0.32 s) after a push or pull. A light leak (0.9 s) into the slow half.
- Text: one punch word per room (Archivo 900 italic wide, 132 px, centred at y 1010), held across the room's shots, slamming in with scale and blur.
- Sound: drums, bass and a 16th arpeggio; a quieter whoosh per cut; a riser and impact at the switch.

**Slow half**
- Room: voice line + 0.35 s lead + 0.6 s tail, with at least 3.5 s per shot. The first shot gets 20% more time.
- Camera: `soft` ease, amplitude 0.8x; push, pull, orbit, and pan for landscape photos.
- Label at 0.5 s; stats at 0.9 s on the second shot (1.8 s if the room has one shot); transitions fade, slide or zoom 0.6 to 0.7 s.
- Music: pad and pluck, no drums, 4 dB down and ducked under the voice.
- Outro: voice + 2.2 s, and at least 4.5 s.

## Camera moves (keys are view centre x, y in the photo from 0 to 1, and zoom z, where 1 means the photo exactly covers the frame)

- `push`: from the centre at z 1.04 toward the focus point at z 1.24. This is the default for portrait photos, with parallax 0.55.
- `pull`: the reverse, a reveal.
- `panLeft` / `panRight`: for landscape photos (a 4:3 photo shows about 42% of its width at a time), up to 0.42 of travel across the focus point, at z 1.06.
- `tiltUp` / `tiltDown`: for tall photos (staircases, high ceilings).
- `orbit`: a lateral slide with a 0.6° roll and parallax 0.7, like a slider shot.
- `hold`: for clips (z 1.0 to 1.06).

Vary the moves. Two identical moves in a row look like a slideshow.

## Colour and type

- Accent: from `studio.json` (cyan `#2EE6FF` by default). Use one accent per reel. It appears on the label underline, the stat units, the price chip, the tracker and the call button.
- Archivo (800 to 900, wide and italic for the title) for labels and numbers. Instrument Sans for kickers and small text.
- White text with a soft dark shadow. Never place it on a busy area without the shadow.

## Safe zone (1080x1920 Instagram Reels)

Keep text inside x 72 to 950 and y 220 to 1490. Instagram covers the top 220 px (header), the bottom 430 px (username, caption, audio) and the right 130 px from y 1050 to 1790 (buttons). The editor's "Safe zones" toggle shows these areas.

## What "better" means here (the checklist before a render)

1. Every photo moves differently, aimed at what matters in it.
2. Depth parallax is on where the depth map is good, with no tearing.
3. Labels are short and true, and stats say real numbers that the voice also says.
4. The voice is one clean sentence per room with no invented facts. Names are pronounced right (the user checks).
5. No dead air: the next room starts within 0.5 s of the line ending.
6. The end card holds long enough to read the number (at least 2.5 s after it lands).
