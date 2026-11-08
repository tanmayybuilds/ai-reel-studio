# Prompt for a new reel

Put the footage in `Raw/<FOLDER NAME>/` (the camera file, the voiceover, and `Assets/` with every screenshot and screen recording). Then open a new chat on the studio folder and paste the prompt below. Replace everything in angle brackets and delete the lines you don't need. It sets up the same look as the approved reels in `Approved Videos/` (latest: Muse, electric cyan).

The earlier versions are `New Reel Prompt (before Handy).md` and the history in `Brand Kit/brand-kit.md`.

```
Use the talking-head-reel skill.

Edit the video in Raw/<FOLDER NAME>. Use everything in that folder: the camera file, the separate voiceover, and every screenshot and screen recording in Assets.
Topic: <what the video is about, in one or two lines>.
Link / repo: <e.g. https://github.com/owner/repo, or "none">.
CTA: <e.g. "comment GUIDE and I'll DM the repo and install guide">.
Correct wording: <optional: key lines as they should be said, or "use my best takes">.

Colour:
- <Pick one> Keep the current cyan accent.
  / Use <COLOUR, e.g. lime / coral / violet> (run set_accent.py).
  / Choose a better colour yourself: one that complements the product's own UI in the Assets, reads on both white boards and my real room, and stays clear of the red (danger) and green (success) tones.
- Keep the rest of the brand kit exactly the same: fonts, two-tier captions, camera moves, pacing, layout and safe area. If the colour changes, save the current kit in Brand Kit/history first, then update Brand Kit/brand-kit.md. Never delete it.

Style:
- Match the approved reels in Approved Videos (Muse, Handy, Whitestair, VoiceStudio): the same effects, captions, camera moves and sound design. Read Brand Kit/creator-notes.md, and study the Approved Videos frame by frame before planning.
- Background: my real room, lightly blurred like in a video call (room mode), not a cutout on a fake set. Check that the empty-room plate is a clean, well-exposed frame.

Takes and audio:
- Check every take of every line on both the voiceover and the camera audio. Make a take map and pick the best one when there are several: every word right, confident delivery, usually the later take. Never default to the first take. Tell me which take you chose for each line and why.
- Combine the voiceover with the camera video, lip-synced, and cut both from the same frames.
- Hook first, every sentence complete, no dead pauses.

Motion graphics, better than last time:
- Only for words I actually say. Every graphic has a trigger word on its storyboard card.
- Build everything from the real material in Assets: crop screenshots until they're readable on a phone, stitch scrolling recordings into real pages, use logos unaltered, and use real names, numbers and commands.
- Reuse the approved moves where they fit (typing hook with live keyboard, price card with strike, glowing browser typing the link, repo card on a white board, tiles, pills, laptop check, comment sheet, DM rows, token meter, split-flap code, step rail, offer timer), and add at least two new, more premium graphics made for this video's lines.
- A different framing and a different graphic on every beat. The first 0.3 seconds must move, and the hook, product reveal, link and CTA get the richest graphics.
- Romanized Hinglish captions for every word, with one big hero word per line, never covering my mouth.

Sound:
- Proper layered sound effects on every cut, hero word, card, tap, keystroke, chime and reveal, timed to the graphics and sitting under my voice. No music unless I give you a track.

Process:
- Storyboard dashboard first: one card per beat with the captions, every graphic and its trigger word, the assets, the camera, and Approve, Reject and Feedback. Run your own QA sheets and fix collisions before showing me.
- Wait for my review and read all my feedback, including notes on approved beats.
- Render the final 1080x1920 video only after I say "start render". Then tell me what you checked, what you couldn't (anything you can't hear), and any fact on screen I didn't say.
- Copy it to Approved Videos only after I approve it, and add what it taught to Brand Kit/creator-notes.md.
```

## Short version

Use this when only the footage and the colour change:

```
Use the talking-head-reel skill to edit Raw/<FOLDER NAME>, using its voiceover and Assets folder. Topic: <topic>. Link: <link>. CTA: <cta>. Same style as the approved reels (blurred real room, layered SFX). Accent: <keep cyan / COLOUR / "something better that suits this product">. Check every take and use only the best ones, lip-sync the voiceover, make better motion graphics than last time, storyboard first.
```

## Client edit in the podcast-window style

```
Use the podcast-window-reel skill. Client file: Raw/<FOLDER NAME>/<file>. Headline: <text or "write one from the hook">. CTA: <e.g. comment ATTRACT>. v1 with generated cards and a music bed, then send me the asset list for v2.
```

## Tips for the recording

- Record a few seconds of the empty frame (no one in shot) at the start or end, with the lights already settled. The matte and the blurred room come out cleaner.
- If you record a separate voiceover, record it at the same time as the camera, so it syncs automatically.
- Put screenshots and screen recordings of everything you mention in `Raw/<FOLDER NAME>/Assets`, scrolled slowly with the text large on screen. Graphics are built only from real material, and bigger text makes sharper crops.
- If you retake a line, say the whole sentence again rather than starting mid-line, so the best take is easy to cut.
