# Tanmay Builds: editing brand kit (reference v2, electric cyan)

Built on 3 November 2026 from the reference "Ready to upgrade your edits" (720x1280, 30 fps, 28.3 s; the video itself is not in the repo, but its study is in `Editing Style/Reference Analysis/Ready to upgrade your edits/`). Since then it has been refined over four approved reels (VoiceStudio, Whitestair, Handy and Muse, all in `Approved Videos/`), which are now the real house style.

## History

Old kits are kept in `Brand Kit/history/`, never deleted.

| Date | Change | Kit kept as |
| --- | --- | --- |
| 2 Nov 2026 | First kit: ivory, ink and yellow paper look | `history/2026-11-02-paper.md` |
| 3 Nov 2026 | Reference v2 (dark set, wide italic hero words), **indigo** accent. VoiceStudio approved | `history/2026-11-03-indigo-voicestudio.md` |
| 3 Nov 2026 | User asked for a colour "better than purple": **electric amber**. Whitestair and Handy approved | `history/2026-11-05-amber-whitestair-handy.md` |
| 4 Nov 2026 | Cutout on a dark set rejected (ragged edges). **Real room, lightly blurred** (`bgMode: "room"`) became the default | (this kit) |
| 5 Nov 2026 | New colour for Muse: **electric cyan**. Muse approved | (this kit) |
| 7 Nov 2026 | **Acid lime** (`#C6FF3A`) used on the Abliterated-model reel, with karaoke-highlight plain captions. **Not yet approved**: if approved, add it here and run `set_accent.py --preset lime` | (pending) |
| 8 Nov 2026 | Client reel (English, phone selfie) approved with **emerald**, **karaoke captions**, **plain mode** and 12 money/proof builders. Ported into the template on 9 Nov in this kit's cyan. Karaoke is opt-in (`"karaoke": true`), so the two-tier captions below stay the house default | (this kit) |

The skill template now ships cyan, so a new project starts in this kit's colour with no extra step. Run `.claude/skills/talking-head-reel/scripts/set_accent.py` to change it (presets `cyan`, `amber`, `lime`, or any `--hex`).

## The look in one line

Premium talking head in my real room, lightly blurred like a video call, with bright clean graphics landing exactly on the spoken word.

## Colour

Mint, paper white and red were sampled from reference frames, then brightened where compression had dulled them. Treat all values as close approximations.

| Role | Hex | Use |
| --- | --- | --- |
| Cyan light | `#B8F6FF` | Hero word highlight, top of gradient |
| Cyan | `#2EE6FF` | Hero word, tiles, ticker, send button, key glow |
| Cyan deep | `#0098E6` | Hero word, bottom of gradient |
| Cyan on white | `#00B4E0` to `#0077B6` to `#00508A` | Hero word on white boards, darker so it reads on paper white |
| Cyan ink | `#00222E` | Text on cyan fills |
| Glass dark | `rgba(14,28,38,.94)` to `rgba(5,10,14,.96)` | Sheets, meters, keyboard (cool, to match cyan) |
| Alert red bright | `#FF3D66` | Danger and final-payoff word, top |
| Alert red deep | `#C3032E` | Same, bottom |
| Signal green | `#35D07F` | Check marks and the word FREE |
| Paper white | `#F9FFFF` | Full-screen B-roll boards |
| Set black / desk / gold | `#0E0B08` / `#1D1610` / `#E8B878` | Only in set mode (`bgMode` unset): backdrop, desk, LED line |

Use one accent per caption. Cyan is the default (tone `cyan`). Red is only for danger or the final call to action. Green is only for a positive proof. Text on a cyan fill is dark (`#00222E`), not white.

**Why cyan:** it sat next to Muse's own Meta-blue UI, it is the complement of the pink room and red paisley wall so it pops in room mode, it darkens to a deep ocean blue that reads on white boards, and it stays clear of red and green. When a new reel asks for a new colour, choose by the same test: it should complement the product's own UI, read on both white boards and the pink room, and stay clear of red and green.

## Type

Fonts are local files in `.claude/skills/talking-head-reel/template/storyboard/fonts/`, copied into every new project.

- **Hero word:** Archivo, weight 900, width 125, italic, all caps. The closest open match to the reference's wide italic display face. 90 to 150 px at 1080x1920, auto-fit to a 940 px maximum width.
- **Lead and tail lines:** Instrument Sans, weight 600, 44 to 50 px, tight tracking, white on footage and dark on boards.
- **Tiles and pills:** Archivo 125 italic for tiles, Instrument Sans for pills.

## Captions

Romanized Hinglish throughout: Latin script, never Devanagari, with English words in English spelling (for example "Ye ek aisi GitHub repository hai").

Two tiers, centred, sitting on the chest and never on the mouth:

1. A small lead line with words appearing one at a time on the spoken word, each with a quick blur-in.
2. One big gradient hero word that wipes in left to right with a soft dark glow behind it.

Every spoken word is captioned. Only one idea is on screen at a time. When tiles or pills are showing, they are the caption. Brand and product names keep their real spelling (for example "abliterated", not "obliterated").

## Camera

- **Background:** the real room, lightly blurred (`bgMode: "room"`, `bgBlur` 5), like a video call. It hides matte edge errors, and the user prefers natural to stylised. Set mode (cutout on a dark shelf set with a gold LED line and a desk) is still available, but only use it when the matte is clean at full resolution, checked on magenta.
- Zoom range 0.66 (wide, room for graphics) to 1.0 (tight).
- Change framing on every cut. Fast punch-ins take 0.2 s and land on the key word. Slow pushes run the length of a line that carries tension.
- Every cut opens with a 0.28 s blur-in. This is the reference's signature move.

## Pacing

Cuts land about every 1.5 to 3.5 s, with no silence and a graphic change almost every sentence. Loudness is -14 LUFS. Dialogue pauses are trimmed, never sped up. The user often asks for "faster": tighten pauses first, then trim words that don't carry meaning.

## Motion graphics kit

Each one must be triggered by a spoken word. If nobody says it, it does not appear. Fields for every builder are in `.claude/skills/talking-head-reel/references/storyboard.md`.

| Move | Approved on | When to use |
| --- | --- | --- |
| Two-tier hero caption | all | The key word of a line |
| Glass pills with red cross or green check, typed word by word | VoiceStudio | Yes or no claims |
| White tiles popping into a grid | VoiceStudio | Spoken lists |
| White board with dashed slots, hand cursor drags real cards in | VoiceStudio | "Many things" moments, product reveal |
| Real page scrolling under a ticker, with a star counter | VoiceStudio | Hooks about a repo or page |
| App window rising with a tilt | VoiceStudio | "This app or repository" lines |
| Paired stat cards (`</>` Open source, ₹0 Free) | VoiceStudio | Paired claims |
| Glowing browser typing the spoken link and loading the real page | VoiceStudio | A link said aloud |
| Laptop verify scan | VoiceStudio | "It checks or verifies" |
| Comment sheet CTA (keyword typed, send burst, DM arrives) | VoiceStudio, Whitestair | "Comment X" calls to action |
| Typing hook: glass field with a live mini keyboard | Handy | Hooks about typing or questions |
| Price card with a red strike and a NAHI stamp | Handy | "You don't have to pay for X" |
| Token meter (odometer to a huge number, FREE stamp) | Muse | Big spoken numbers |
| Split-flap code field plus a redeem tap | Muse | Referral and promo codes |
| Editor timeline with the length counter climbing | Muse | Video length or editing lines |
| Step rail across the top | Muse | How-to steps |
| Scrambling offer countdown | Muse | "Nobody knows how long" offers |
| Karaoke captions (accent word box, coloured keywords, sheen hero) | Sarmila (client) | Opt-in per reel, e.g. English talking-head clients |
| Line chart drawing itself, number counter, compare bars | Sarmila (client) | Money, growth, returns, any spoken number or comparison |
| Name card, person profile, transfer lane | Sarmila (client) | "I'm X", "my son is 18", "I moved X from A to B" |
| Proof screenshot with ring, account statement with magnifier | Sarmila (client) | "Here's the proof", "check your statement" |
| Bottom sheet list, dark board, red flash | Sarmila (client) | Disclaimers and do/don't lists, hiding baked-in screens, shock words |
| White plus red stacked word with a big hand tap | reference | Final call to action |
| Mint opener with a circular speaker | reference | **Not used**: rejected in the VoiceStudio review |

## Product truth

Show only real captures from the supplied assets, cropped until legible. Use logos unaltered (crop only: no recolouring, and no redrawing of a baked checkerboard). If the user's crop of an icon is cut off, use the official icon from the product's site. Do not invent app screens, numbers or results. Flag anything on screen that nobody said (prices, "30 uses left", time limits).

## Dialogue sync

The user usually records a separate voiceover (a phone or WhatsApp voice note) alongside the camera. Use it for the dialogue, and measure its offset against the camera audio for each recording (past offsets: +2.4885 s, +0.107 s, +2.885 s, +1.031 s, -0.4025 s). Cut video and audio from the same frame-quantised list, and re-transcribe each cut beat to confirm that no words were lost or doubled.

## Audio

Layered stereo SFX on every cut, hero word, card, tile, tap, keystroke, chime and reveal, sitting about 13 to 14 LU under the dialogue. `make_sfx.py` soft-limits rather than normalising. No music unless the user supplies a track.

## Safe area

At 1080x1920, keep key content inside x 70 to 1010 and y 180 to 1560, away from Instagram's right rail and bottom caption area.

## Avoid

Graphics with no spoken trigger, more than one accent per caption, constant shake, tiny desktop screenshots, stock footage, broken cutout edges, altered logos, and themes the user didn't ask for (for example, no Diwali touch on a reel recorded during Diwali).
