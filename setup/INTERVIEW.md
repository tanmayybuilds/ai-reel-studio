# First-run interview

Ask these **one at a time, in order**. Wait for each answer before you ask the next. Keep it conversational: one short question, then the options with the default marked. If the user says "you decide" or "default", use the default and say what you picked.

Questions marked **[always]** are asked on every branch. The rest are skipped on a pre-configured branch that already has a filled-in `studio.json`.

**Detect, don't ask:** the OS and version, CPU, RAM, GPU, free disk space, and which of git, FFmpeg, Node.js, Python 3.10-3.12 and Chrome are already installed. Report what you found in one line before Q1.

Each answer goes to the field shown as `→ studio.json: field`, or into the brand kit section named.

---

## Part 1: The workstation

**Q1 [always]. Install folder.**
"Where should the studio live? It needs about 2 GB for the tools, plus room for your footage (a 1-minute 4K clip is about 400 MB)."
Default: `<Documents>/AI Reel Studio`. Skip this if the repo is already cloned and the user is happy with where it is.

**Q2 [always]. Permission to install system software.**
"Can I install missing system tools (FFmpeg, Node.js, Python 3.11, Chrome) with winget / Homebrew / apt? You may see an admin or password prompt."
Options: yes (default) / no, I'll install them myself (use `-SkipSystem` / `--skip-system`, then give the user the list from `setup/INSTALL.md`).

**Q3 [always]. Optional extras.**
"Do you also want these optional extras?
(a) the Remotion studio, a React video framework, about 300 MB (not needed by the reel workflow);
(b) the smaller Whisper base model, 148 MB (faster, less accurate)."
Default: neither. → `studio.json: optional`

---

## Part 2: Creator and brand

**Q4. Name and handle.**
"What's your name or brand name, and your main handle (for example @yourname)? It goes in the brand kit title. Nothing is put on your videos unless you ask."
→ `studio.json: creator, handle`; brand kit title.

**Q5. Content and audience.**
"In one or two lines: what are your videos about, and who are they for?" (Example: "AI tools and GitHub repos for Indian developers and creators.")
→ `studio.json: niche, audience`; brand kit "The look in one line".

**Q6. Platforms and format.**
"Where do you post? Instagram Reels, YouTube Shorts, TikTok, LinkedIn, or several?"
Default: Reels plus Shorts, at 1080x1920, 30 or 25 fps as recorded, -14 LUFS. If they also want 16:9 or 4:5 versions, note it. The skills render 9:16, and other sizes need extra work.
→ `studio.json: platforms`; brand kit "Safe area" (Instagram's right rail and bottom caption bar decide the safe area).

**Q7. Spoken language.**
"What language do you speak in your videos? English, Hindi, Hinglish (Hindi plus English mixed), Spanish, or another?"
Set the Whisper code: English `en`, Hindi or Hinglish `hi`, Spanish `es`, and so on, or `auto` for a mix.
→ `studio.json: spokenLanguage, whisperLanguage`

**Q8. Caption language and script.**
"How should captions be written?" Offer the options that fit Q7. For example:
- the same language in its own script (English; हिंदी in Devanagari),
- **Romanized** (Hindi or Hinglish written in Latin letters, "kya aap jaante ho", with English words in English spelling),
- a translation into English.
Default: the spoken language in its usual script. For Hinglish, the default is Romanized.
→ `studio.json: captionLanguage`; brand kit "Captions".

**Q9. Caption style.**
"Which caption style?
(a) **Two-tier** (default, talking-head look): a small lead line that reveals word by word, plus one big gradient hero word per line;
(b) **Minimal** (podcast-window look): 2 or 3 small lowercase words at a time, plus serif hero words."
If they ask for something else, such as karaoke highlighting, note it. It means adding a caption builder to `storyboard/motion.js`, so say that it will take extra work on the first video.
→ `studio.json: captionStyle`; brand kit "Captions".

**Q10. Accent colour.**
"Pick the accent colour for hero words and graphics: **cyan** (#2EE6FF), **amber** (#FFB52E), **lime** (#C6FF3A), your own hex code, or 'match my brand'."
Rules to explain: red stays for danger or warning and the final call to action, green for proof or success, so the accent can't be either. Text on an accent fill is dark. If they have brand colours or a logo, ask them to drop the files in `Brand Kit/` and derive the accent from them. Apply it with `set_accent.py` (AGENTS.md step A5).
→ `studio.json: accent`; brand kit "Colour".

**Q11. Fonts.**
"Do you have brand fonts? If not, I'll use the built-in pair: Archivo Black Italic, wide, for hero words, and Instrument Sans for captions (both open-licence)."
If they have fonts, put the `.woff2`, `.ttf` or `.otf` files in `Brand Kit/fonts/` and update `@font-face` in the template's `storyboard/style.css`.
→ `studio.json: fonts`; brand kit "Type".

---

## Part 3: Look and feel

**Q12. House style.**
"Which look should your reels have by default?
(a) **Talking head** (default): full-frame you, a camera that punches in on key words, bright graphics on the spoken word;
(b) **Podcast window**: a black canvas, headline on top, you in a framed window, serif words behind you, fire light-leak transitions;
(c) both: you'll pick per video."
→ `studio.json: defaultSkill`

**Q13. Background (talking head only).**
"For the background:
(a) **your real room, lightly blurred** like a video call (default, most natural, hides matte errors);
(b) **cut out onto a dark studio set** (needs a few seconds of empty frame in every recording, and edges can look ragged)."
→ `studio.json: background` (`room` or `set`), `bgBlur` (default 5).

**Q14. Reference videos.**
"Do you have 1 to 3 reels whose editing style you love? Send links or files. I'll study them frame by frame (pacing, captions, transitions, sound) and write your brand kit from them. Only share videos you're allowed to download for private study."
If they have none, build the kit from their answers and the defaults in the template.
→ `References/`, then `Editing Style/Reference Analysis/`, then the brand kit.

**Q15. Pacing and energy.**
"How fast should it feel? (a) **fast and punchy** (default: a cut or graphic change every 1.5 to 3.5 s, no pauses); (b) **calm and clean** (longer holds, fewer graphics)."
→ `studio.json: pacing`; brand kit "Pacing".

**Q16. Hard nos.**
"Anything you never want to see? (For example: stock footage, emojis, shaky zooms, certain colours, music.)"
→ `studio.json: avoid`; brand kit "Avoid".

---

## Part 4: Recording and review

**Q17. How you record.**
"How do you usually record?
- Camera only, or the camera plus a **separate voiceover** (a phone mic or lav recording)? A separate VO is synced automatically.
- Do you **retake lines**? (I'll compare every take and choose the best.)
- Do you record a few seconds of the **empty frame**? (Needed for the cut-out look.)"
→ `studio.json: recording`

**Q18. Sound.**
"Sound effects:
(a) **layered SFX** on every cut, word, card and tap, kept under your voice (default);
(b) subtle, on cuts only;
(c) none.
Music: none unless you give me a track (default), or a generated low drone bed (podcast-window style)."
→ `studio.json: sfx, music`; brand kit "Audio".

**Q19. Review process.**
"I'll show you a storyboard dashboard for every video, with Approve, Reject and Feedback on each beat, and render only after you say 'start render'. Then you approve the final before it goes into `Approved Videos`. Keep both approval steps?"
Default: yes to both. Strongly recommend keeping them.
→ `studio.json: approvals`

**Q20 [always]. Anything else.**
"Anything else I should know? Your call-to-action style (for example 'comment GUIDE'), words to always spell a certain way, or clients you edit for?"
→ `studio.json: notes`; brand kit "Avoid" or "Captions" as fits.

---

## After the interview

Show a compact summary of all the answers, ask for a yes, then continue with AGENTS.md step A4 (install) and step A5 (write the profile).
