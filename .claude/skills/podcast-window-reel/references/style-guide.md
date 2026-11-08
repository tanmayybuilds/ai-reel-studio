# Podcast-window style guide

This style was decoded from `References/Reference-2026-11-07.mp4` (720x1280, 30 fps, 50.0 s, 23 scene changes, average shot 2.1 s, -14.1 LUFS). The evidence is 50 one-second frames, 12 fps motion runs around every cut, zoomed crops of the type, and spectrograms. All of it is in `Editing Style/Reference Analysis/Ref 2026-11-07/`. Measurements below are scaled to 1080x1920 (x1.5). Colours marked *sampled* came from frames; the rest are eyeballed.

## The look in one line

A cinematic podcast window floating on black: a calm, editorial frame where serif words appear in the room behind the speaker, and every cutaway bursts in through a warm fire flash.

## Layout (1080x1920)

| Element | Reference | Notes |
| --- | --- | --- |
| Canvas | pure black `#000` | Nothing else on the black except the headline. |
| Video window | full width, y 603–1318 (1080x715, **3:2**) | Measured: rows 402–879 at 720 px. |
| Headline | white, bold humanist sans, about 33 px, centred, baseline about 17 px above the window | One fixed topic line for the whole reel ("Here's why your day disappears into busywork"). Font: Segoe UI Bold (the reference looks like Open Sans Bold). |
| Subtitles | white, about 28 px geometric sans (Poppins-like), lowercase, centred, about 42 px above the window's bottom edge, faint shadow | Century Gothic Bold stands in for Poppins. |

**Vertical sources:** the reference is a landscape podcast camera. A selfie or vertical clip in a 3:2 window shows only eyes to chin. The first client used a **4:5 window (1080x1350, y 285–1635)** with the headline above it and kept everything else. Offer the exact 3:2 if the user wants it.

## Captions: two tiers, never both at once

1. **Subtitles** (the default): 2–3 spoken words, lowercase, no punctuation, as spoken (Hinglish stays Romanized: "bolta hoon", "email ke bhai"). They appear on cut with no animation. They show on A-roll *and* on cutaways.
2. **Hero stack** (key ideas): replaces the subtitle while it is on screen. Up to three rows, each revealed on its spoken word:
   - UPPERCASE serif, regular weight, high contrast (Times New Roman stands in; about 56 px in the reference, 124 px in the 4:5 window because the face is bigger). Examples: "JAISE", "EMAIL", "50 EMAILS", "BANDA", "MCP", "INTO", "EVERY", "YOUR", "TRY".
   - a tiny bold sans connector, about 22 px (Arial Bold): "aaj ke", "check", "thousand", "step", "and". It sits tucked under or beside the serif, often overlapping its baseline.
   - italic serif, about the serif's size: "date mein", "nahi karta", "times", "minutes", "department", "incorporate AI".
   - Placement: in the empty background beside the head (window x about 0.77, y about 0.46 in the reference). The speaker's hand passes **in front** of the words, because they live in the room. With a close selfie, put them above the head; the renderer moves them in front of the speaker when the head would hide over 30%.
   - Motion: each row fades in from a blur (about 0.2 s, blur 9 to 0) with no slide or scale, and the whole stack fades out with a blur (about 0.25 s). There's a soft dark glow behind the words only when the background is bright.

## Camera and cuts

- A-roll framing stays static within a shot. **Every return from a cutaway uses a new framing**: wide, then punch-in (x1.12–1.16), then wide, then a tight punch (x1.3) on a dramatic line ("But there's a catch"). Add a slight slow push (+4%) so it doesn't feel frozen.
- Cutaways come every 3–6 s at noun moments (a product, a person, a number). They run 1.5–4 s.
- **Window-open reveal** at 0.0 s: the window opens vertically from a thin slit to full height in about 0.35 s, and the headline fades in with it.
- The cuts between A-roll and cutaway are where the **fire light-leak** goes. A-roll to A-roll is a hard cut with a zoom change.

## The fire light-leak (signature transition)

Horizontal streaks of deep red, orange and yellow sweep across (alternating direction). They rise over about 0.24 s to a near-full yellow-orange flash on the cut frame, then clear over about 0.34 s, with the subject faintly visible through it. Screen-blended. Keep the peak saturated yellow-orange; a cream or white peak looks cheap. Every leak carries the fire-whoosh SFX.

## Cutaways

1. **Stock or B-roll clips** (warm, cinematic, slightly desaturated): a man on a sofa with a phone ("bolta hoon"), a man typing at a laptop ("main email check / 5 minute lagenge"), a night-terrace silhouette ("compounding"), a man at a desk ("ek ghanta lag sakta hai"). They have a slow push-in, and subtitles continue on them. **v1 can't generate these. Ask the user for them.**
2. **Graphic cards** on a dark gradient: deep maroon with a lower-right ember glow (sampled about `#0A0A12` to `#5C2414`) for brand moments, and charcoal (`#161618` to `#36363A`) for integrations. Moves:
   - **Logo reveal**: the icon blurs into focus, then the wordmark types on letter by letter with a per-letter fade and blur ("C l a u d e").
   - **Connect line**: two logos with a thin glowing line drawn between them, a pulse travelling along it, and a highlight box around the target.
   - **UI zoom**: a real product UI (chat box, dropdown) with the camera pushing into the relevant control.
   - **Code or document scroll**: dim text with an orange glow sweep and focus pull.
   - All cards slow-push (about +6%) and open with a 0.3 s focus pull (blur 12 to 0).
3. The generated card kit in `render_window.py`: `room` (people row + big number), `bars` (comparison), `playcard` (an ace rises and turns), `toasts` (notifications), `three` (three editorial lines), `seven` (N thumbnails from the speaker's own footage + big N×), `dm` (message arrives), `price` (CHARGE more + struck "discount?"), `comment` (comment box types the keyword and sends). Accent is coral ember `#E8775A`, picked to sit with the fire leaks.

## Audio

- A **low, warm music bed** runs under everything. The spectrogram shows constant energy under 150 Hz through every pause. It sits well under the voice. Generated stand-in: a slow Am–F–C–G pad with a 55 Hz drone, low-passed at 1.1 kHz, ducked by the voice.
- A **fire whoosh** peaks on every light-leak cut (high-band spikes line up with all 11 leak cuts).
- Light UI sounds on cards (pops, key presses, notification chimes), kept subtle. Hero words get at most a soft air tick.
- Master: -14 LUFS integrated, true peak about -1.5 to -2.7 dBTP.

## Pacing

Pauses over about 0.12 s are almost all cut (only 4 pauses over 120 ms in 50 s). The reference runs 50 s; the first client cut ran 57.5 s from 76 s raw.

## Asset checklist for v2 (ask the user)

For each cutaway, name the moment (the words) and the asset:

- **B-roll clips** (5–8 s, 4K or 1080p, landscape or vertical): stock or the client's own, one per noun moment.
- **Real screenshots or screen recordings** of any product, profile, DM or comment section named on screen.
- **Logos** (SVG or PNG with transparency) for every brand mentioned.
- **The client's own profile**: follower count, handle, real DMs or testimonials (replaces invented numbers).
- **Music**: a licensed track like the reference's low warm bed, about 90–110 BPM, minimal drums.
- **Fonts** (optional upgrade): Instrument Serif or Playfair Display for the hero serif, Poppins Medium for subtitles, Open Sans Bold for the headline.
- **The headline wording** the client wants on top.
