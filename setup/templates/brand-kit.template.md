# {{Brand name}}: editing brand kit

Written on {{date}} from {{the first-run interview | the reference "<name>" | ...}}. Evidence: {{what was studied, for example "all 28 one-second frames of References/x.mp4, motion runs at 5 cuts, loudness and a word-timed transcript in Editing Style/Reference Analysis/x/"}}. Treat colours and fonts read off compressed video as close approximations.

**History:** when this kit changes, add a dated line here and move the old kit into the previous project's folder. Never delete it.

## The look in one line

{{For example: "Premium talking head in my real room, with bright clean graphics landing exactly on the spoken word."}}

## Colour

| Role | Hex | Use |
| --- | --- | --- |
| Accent light | {{palette.light}} | Hero word highlight, top of gradient |
| Accent | {{palette.main}} | Hero word, tiles, ticker, send button, key glow |
| Accent deep | {{palette.deep}} | Hero word, bottom of gradient |
| Accent on white | {{palette.white1}} to {{palette.white2}} to {{palette.white3}} | Hero word on white boards, darker so it reads on paper |
| Accent ink | {{palette.ink}} | Text on accent fills (dark, never white) |
| Alert red | `#FF3D66` to `#C3032E` | Danger, warnings and the final call to action only |
| Signal green | `#35D07F` | Check marks, FREE, verified: positive proof only |
| Paper white | `#F9FFFF` | Full-screen white boards |
| {{brand colour}} | {{hex}} | {{where it is used}} |

The accent name is **{{accent name}}** (the `tone` value in `storyboard.json`). Palette values come from `.claude/skills/talking-head-reel/template/storyboard/accent.json` after `set_accent.py`. Use one accent per caption.

## Type

Fonts are local files in `.claude/skills/talking-head-reel/template/storyboard/fonts/`, copied into every new project.

- **Hero word:** {{Archivo, weight 900, width 125, italic, all caps; 90 to 150 px at 1080x1920, auto-fit to 940 px}}
- **Lead and tail lines:** {{Instrument Sans, weight 600, 44 to 50 px, tight tracking; white on footage, dark on boards}}
- **Brand fonts:** {{files in Brand Kit/fonts/, or "none"}}

## Captions

- Language and script: **{{caption language}}**. {{For Romanized captions: Latin letters, English words keep English spelling.}}
- Style: **{{two-tier | karaoke | minimal}}**. {{Two-tier: a small lead line with words appearing one at a time on the spoken word, each with a quick blur-in, then one big gradient hero word that wipes in left to right with a soft dark glow behind it.}}
- Placement: centred on the chest, never on the mouth. Every spoken word is captioned. One idea on screen at a time. When tiles or pills are showing, they are the caption.
- Spellings to keep: {{brand names, product names, words the creator always spells a certain way}}

## Camera

- Background: **{{room: the real room lightly blurred (bgBlur 5), like a video call | set: a cutout on a dark shelf set | plain: the whole graded frame, no cutout (phone selfies; zoom 1.0 = full frame, 1.1 to 1.45 punch-ins)}}**.
- Zoom range 0.66 (wide, room for graphics) to 1.0 (tight). Change framing on every cut.
- Fast punch-ins take 0.2 s and land on the key word. Slow pushes run across a line that carries tension.
- Every cut opens with a 0.28 s blur-in.

## Pacing

{{Fast: a cut or graphic change every 1.5 to 3.5 s, dialogue pauses trimmed (never sped up), hook in the first 3 s. | Calm: ...}} Loudness: -14 LUFS integrated, -1.5 dBTP.

## Motion graphics kit

Each graphic must be triggered by a spoken word. If nobody says it, it does not appear. The full catalogue, with fields, is in `.claude/skills/talking-head-reel/references/storyboard.md`.

| Move | When to use |
| --- | --- |
| Two-tier hero caption | The key word of a line |
| Glass pills with a red cross or green check | Yes or no claims |
| White tiles popping into a grid | Spoken lists and steps |
| White board with a real screenshot rising into a slot | Showing the real product |
| Glowing browser typing the spoken link | A link said aloud |
| Comment sheet (keyword typed, send, DM arrives) | "Comment X" calls to action |
| {{moves from the references}} | {{when}} |

## Product truth

Show only real captures from the supplied assets, cropped until legible. Don't invent app screens, numbers or results. Flag any fact on screen that nobody said.

## Audio

SFX: **{{layered | subtle | none}}**. {{Layered: a soft whoosh on cuts, ticks on caption words, pops on tiles, clicks on taps, key clacks on typing, all about 13 to 14 LU under the dialogue.}} Music: {{none unless supplied | ...}}.

## Safe area

At 1080x1920, keep key content inside x 70 to 1010 and y 180 to 1560, away from Instagram's right rail and bottom caption area.

## Avoid

{{Graphics with no spoken trigger, more than one accent per caption, constant shake, tiny desktop screenshots, stock footage, + the creator's own hard nos}}
