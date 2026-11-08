# Tanmay Builds: editing brand kit (reference v2)

Built on 3 November 2026 from the new reference, `References/Ready to upgrade your edits DM Now ...mp4` (720x1280, 30 fps, 28.3 s). It replaces the earlier ivory, ink and yellow paper kit. That kit is kept at `Raw/Voicestudio Edit/Edit/storyboard/brand-kit.md`.

**Accent change, 3 November 2026 (Whitestair Captions reel):** the user asked for a better motion-graphics colour than the purple used in the approved VoiceStudio reel. Indigo is replaced by electric amber everywhere it was the default accent. The indigo version of this kit, as approved for VoiceStudio, is kept at `Raw/Voicestudio Edit/Edit-v3/storyboard/brand-kit.md`. The skill template still ships indigo, so a new project runs `scripts/apply_accent.py` from `Raw/Whitestair Captions Edit/Edit` (or copies its `style.css`) until the template is updated.

**Evidence:** all 28 one-second frames viewed, plus 10 to 12 fps frame runs across the five signature moves, scene-cut detection, loudness and a word-timed transcript. Everything is saved in `Editing Style/Reference Analysis/Ready to upgrade your edits/`. `Approved Videos` has no finished edits, so this is one reference's style, not a proven house style. Exact fonts and easing curves are estimates from compressed video.

## The look in one line

Premium talking head in a dark, warm set, with bright clean graphics landing exactly on the spoken word.

## Colour

Mint, paper white, indigo and red are sampled from reference frames, then brightened where compression had dulled them. The gold, black, desk and green are matched by eye. Treat all of them as close approximations.

| Role | Hex | Use |
| --- | --- | --- |
| Set black | `#0E0B08` | Backdrop base |
| Desk brown | `#1D1610` | Foreground desk |
| Set gold | `#E8B878` | LED line and rim light on the speaker |
| Amber light | `#FFD98A` | Hero word highlight, top of gradient |
| Amber | `#FFB52E` | Hero word, tiles, ticker, send button (replaces indigo `#8F88FF`) |
| Amber deep | `#FF7A00` | Hero word, bottom of gradient (replaces indigo `#5A4FD8`) |
| Amber on white | `#F07800` to `#B34700` | Hero word on white boards, darker so it reads on paper white |
| Alert red bright | `#FF3D66` | Danger and final-payoff word, top |
| Alert red deep | `#C3032E` | Same, bottom |
| Signal green | `#35D07F` | Check marks and the word FREE |
| Paper white | `#F9FFFF` | Full-screen B-roll boards |
| Mint | `#EAF4F3` | Opener only |
| Glass dark | `rgba(14,16,30,.62)` | Pills and notification rows |

Use one accent per caption. Amber is the default (tone `amber`). Red is only for danger or the final call to action. Green is only for a positive proof. Text on an amber fill is dark (`#1C0F00`), not white. Amber was chosen because it is the complement of the purple in Whitestair's own UI, sits with the gold set light, and stays clear of red and green.

## Type

Fonts are local files in `.claude/skills/talking-head-reel/template/storyboard/fonts/`, copied into every new project.

- **Hero word:** Archivo, weight 900, width 125, italic, all caps. The closest open match to the reference's wide italic display face. 90 to 150 px at 1080x1920, auto-fit to a 940 px maximum width.
- **Lead and tail lines:** Instrument Sans, weight 600, 44 to 50 px, tight tracking, white on footage and dark on boards.
- **Tiles and pills:** Archivo 125 italic for tiles, Instrument Sans for pills.

## Captions

Romanized Hinglish throughout, your standing preference. English words keep English spelling.

Two tiers, centred, sitting on the chest and never on the mouth:

1. A small lead line with words appearing one at a time on the spoken word, each with a quick blur-in.
2. One big gradient hero word that wipes in left to right with a soft dark glow behind it.

Every spoken word is captioned. Only one idea is on screen at a time. When tiles or pills are showing, they are the caption.

## Camera

The reference cuts between real camera angles. We have one locked wide shot, so:

- The speaker is cut out from the room using an empty-room clean plate, then placed on a dark shelf set with a gold LED line and a foreground desk. The room itself is not shown.
- Zoom range 0.66 (wide, room for graphics) to 1.0 (tight). The backdrop moves less than the speaker, which reads as depth.
- Change framing on every cut. Fast punch-ins take 0.2 s and land on the key word. Slow pushes run the length of a line that carries tension.
- Every cut opens with a 0.28 s blur-in. This is the reference's signature move.

## Pacing

Reference cuts land about every 1.5 to 3.5 s, with no silence and a graphic change almost every sentence. Loudness is -14 LUFS. Dialogue pauses are trimmed, never sped up.

## Motion graphics kit

Each one must be triggered by a spoken word. If nobody says it, it does not appear.

| Move | Reference | When to use |
| --- | --- | --- |
| Mint opener with live circular speaker and counter | 0 to 3 s | Not used: rejected in the VoiceStudio review, and not in the render pipeline |
| Two-tier hero caption | 7 s, 9 s, 19 s | The key word of a line |
| Glass pills with red cross or green check, typed word by word | 3 to 6 s | Yes or no claims |
| White tiles popping into a grid | 21 to 25 s | Spoken lists |
| White board with dashed slots, hand cursor drags cards in | 10 to 14 s | "Many things" moments |
| White card on footage | 17 to 18 s | Showing the real product |
| Dark notification rows | 16 s | Messages and DMs |
| White plus red stacked word with a big hand tap | 26 to 27 s | Final call to action |

These moves were added in the VoiceStudio reel and approved by the user: a real page scrolling under a ticker, with a star counter, for the hook; an app window rising with a tilt; paired stat cards (`</>` Open source, ₹0 Free); a glowing browser typing a spoken link and loading the real page; a laptop verify scan; and the comment sheet CTA (LINK typed, send burst, DM arrives). Their settings are in `.claude/skills/talking-head-reel/references/storyboard.md`.

## Product truth

Show only real captures from the supplied assets, cropped until legible. Do not invent app screens, numbers or results. Keep the reference's stock photos and its property content out.

## Dialogue sync

When a separate voiceover is supplied, use it for the dialogue and measure its offset against the camera audio for each recording. For the VoiceStudio reel, video source time equalled voiceover time plus 2.4885 s. Cut video and audio from the same frame-quantized list, and re-transcribe each cut beat to confirm that no words were lost or doubled.

## Audio

Reference audio is constant and loud. SFX are planned as soft whoosh on cuts, tick on captions, pop on tiles and click on hand taps, all kept under the dialogue. No music is supplied, so none is assumed.

## Safe area

At 1080x1920, keep key content inside x 70 to 1010 and y 180 to 1560, away from Instagram's right rail and bottom caption area.

## Avoid

Graphics with no spoken trigger, more than one accent per caption, constant shake, tiny desktop screenshots, stock footage, and showing the pink room or red paisley wall.
