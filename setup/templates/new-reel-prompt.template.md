# Prompt for a new reel

Put the footage in `Raw/<FOLDER NAME>/`: the camera file, an optional separate voiceover, and an `Assets/` folder with screenshots and screen recordings of everything you mention. Then open a new chat with your AI agent on the studio folder and paste the prompt below. Replace everything in angle brackets and delete the lines you don't need.

```
Use the talking-head-reel skill.   (or: Use the podcast-window-reel skill.)

Edit the video in Raw/<FOLDER NAME>. Use everything in that folder: the camera file, the separate voiceover (if any), and every screenshot and screen recording in Assets.
Topic: <what the video is about, in one or two lines>.
Link / repo: <e.g. https://github.com/owner/repo, or "none">.
CTA: <e.g. "comment GUIDE and I'll DM the link", or "none">.
Correct wording: <optional: key lines as they should be said, or "use my best takes">.

Style:
- Follow studio.json and Brand Kit/brand-kit.md, and match the videos in Approved Videos (study them frame by frame before planning).
- Accent colour: <keep the current one | use COLOUR | choose one that complements the product's own UI and stays clear of red and green>.
- Captions in {{caption language}} for every word, with one hero word per line, never covering my mouth.

Takes and audio:
- Check every take of every line, on both the voiceover and the camera audio. Make a take map, and pick the best one: every word right, confident delivery. Tell me which take you chose for each line and why.
- Sync the voiceover with the camera, and cut both from the same frames.
- Hook first, every sentence complete, no dead pauses.

Motion graphics:
- Only for words I actually say. Every graphic has a trigger word on its storyboard card.
- Build everything from the real material in Assets: crop screenshots until they're readable on a phone, stitch scrolling recordings into real pages, and use real names, numbers and commands.
- A different framing and graphic on every beat. The hook, product reveal, link and CTA get the richest graphics.

Sound: {{layered SFX on every cut, hero word, card, tap and reveal, under my voice | subtle | none}}. No music unless I give you a track.

Process:
- Storyboard dashboard first, with Approve, Reject and Feedback per beat. Run your own QA sheets and fix collisions before showing me.
- Wait for my review, and read all my feedback, including notes on approved beats.
- Render the final 1080x1920 video only after I say "start render". Then tell me what you checked, what you couldn't, and any fact on screen I didn't say.
- Copy it to Approved Videos only after I approve it.
```

## Short version

```
Use the talking-head-reel skill to edit Raw/<FOLDER NAME> with its voiceover and Assets. Topic: <topic>. Link: <link>. CTA: <cta>. House style from studio.json and the brand kit. Best takes only, storyboard first.
```

## Tips for the recording

- Record a few seconds of the empty frame (no one in shot), with the lights already settled. The matte and the blurred room come out cleaner.
- If you record a separate voiceover, start it together with the camera, so they sync automatically.
- Scroll screen recordings slowly, with large text on screen. Graphics are built only from real material, and bigger text makes sharper crops.
- If you retake a line, say the whole sentence again rather than starting mid-line.
