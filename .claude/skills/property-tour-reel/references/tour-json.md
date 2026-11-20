# plan.json and tour.json

## plan.json, reference style (the default)

```json
{
  "style": "reference", "title": "...", "accent": "#2EA8FF",
  "hook": {"hero": "p01", "tiles": ["p06","p02","p04","p05","p07","p01"], "move": "pull",
           "title": "2 BHK", "sub": "Godrej The Trees · Vikhroli East", "price": "For Rent · ₹1.2 L/mo", "vo": "..."},
  "shots": [{"room": "Living", "media": "p06", "move": "panRight", "label": "Living & Dining", "sub": "770 sq ft carpet area",
             "vo": "one or two descriptive sentences", "transition": "lens"}],
  "specs": {"heading": "At a glance", "bg": "p01", "theme": "light",
            "items": [{"icon": "bed", "value": "2", "caption": "Bedrooms"}, {"icon": "area", "value": "770", "unit": "sq ft", "caption": "Carpet area"}],
            "vo": "..."},
  "outro": {"theme": "light", "bg": "p01", "kicker": "For rent", "headline": "₹1.2 Lakh / month", "cta": "Listed by",
            "ctaMain": "Manasvi Properties", "footer": "Deposit ₹5 Lakh · Ready to move", "vo": "..."},
  "agent": {"badge": "Preferred Agent", "phone": ""}
}
```

- Voice keys: `intro` (the hook), `shot-01` ..., `specs`, `outro`. A shot lasts `max(6 s, its line + 1.5 s)`.
- `move`: `panRight`/`panLeft` (full-bleed sideways pan, best for landscape photos), `pull`/`push` (portrait), `tiltUp`/`tiltDown`.
- Spec icons: `bed`, `bath`, `balcony`, `area`, `floor`, `compass`, `parking`, `sofa`, `key`, `road`, `rupee`. Numeric values count up.

## plan.json, two-act style (`"style": "twoAct"`)

```json
{
  "title": "2 BHK, Godrej Platinum",
  "accent": "#2EE6FF",
  "tracker": true,
  "length": 60,
  "fast": {"seconds": null, "bpm": null},
  "intro": {
    "hero": "p05", "tiles": ["p01", "p02", "p06", "p09", "p11", "p12"],
    "title": "2 BHK", "sub": "Godrej Platinum · Vikhroli East", "price": "₹1.85 Cr",
    "vo": "Welcome to a bright, semi-furnished 2 BHK in Vikhroli East.", "move": "push"
  },
  "rooms": [
    {"room": "Living", "label": "Sunlit Living Room", "kicker": null, "media": ["p01", "p08"], "fastMedia": ["p01", "p05", "p06", "p08"],
     "vo": "The living room opens onto wide windows that flood it with daylight.",
     "voSay": null,
     "stats": [{"value": "1,050", "unit": "sq ft", "caption": "Carpet area"}],
     "moves": ["pull", "push"], "transition": "zoom"}
  ],
  "outro": {"bg": "p05", "kicker": "Interested?", "headline": "Book a site visit", "cta": "Call / WhatsApp", "footer": "", "vo": "Call now to book your visit."},
  "agent": {"name": "", "company": "", "phone": "", "since": "", "rera": "", "photo": "media/agent.jpg"}
}
```

- `length`: target seconds. The fast half gets `length - detail half` (at least 15 s). `fast.seconds` and `fast.bpm` override it. bpm is detected from `Raw/<Property>/Music/` or defaults to 120.
- `media`: the 1 or 2 shots for the slow, detailed half. `fastMedia`: every usable shot of the room for the fast half (defaults to `media`). Photos are reused with different framing.
- The intro `vo` is a short hook spoken over the fast half. Room `vo` lines are spoken in the slow half.
- `media` ids come from `media.json` (`p01`... are photos, `c01`... are clips).
- `kicker`: `null` gives the automatic "01 · Living", `""` hides it, and any other text replaces it.
- `voSay`: optional speech-only spelling of the line, for names the voice gets wrong.
- `moves`: optional, one per media item. Without it, moves are chosen automatically.
- `transition`: optional; it applies after the room's last shot (`whip`, `zoom`, `warp`, `leak`, `slide`, `fade`, `flash`, `cut`).
- Voice line keys are `intro`, `room-01`, `room-02`, ... (by position in `rooms`), and `outro`.

## tour.json (build_tour.py writes it; the editor edits it; the engine renders it)

```json
{
  "title": "...", "fps": 30, "accent": "#2EE6FF", "tracker": true,
  "look": {"grain": 0.035, "vignette": 0.22},
  "grade": {"exposure": 1.03, "contrast": 1.04, "saturation": 1.06, "warmth": 0.3},
  "agent": {...},
  "shots": [ ... ],
  "audio": {"vo": [{"key": "room-01", "file": "media/vo/room-01.wav", "start": 28.35, "dur": 4.26}],
            "music": {"file": "generated", "bpm": 120, "offset": 0.0}, "fastEnd": 28.0},
  "duration": 36.26
}
```

Shots play back to back. A shot's `transition` goes into the **next** shot and is centred on the cut, so both shots are visible for `dur/2` on each side.

### Shot fields

| Field | Kinds | Meaning |
| --- | --- | --- |
| `id` | all | unique, also the review key |
| `kind` | all | `photo`, `video`, `collage` (opening), `outro` (contact card) |
| `act` | all | `fast` (beat-cut, linear constant motion, punch labels) or `slow` (details) |
| `group` | all | voice group (`intro`, `room-01`, `outro`); `--retime` scales a group's shots to fit its line |
| `room` | photo, video | short room name, used by the tracker and the automatic kicker |
| `media` | photo, video, collage | media id (for the collage, the hero) |
| `dur` | all | seconds |
| `keys` | photo, video, collage | camera keyframes `[{u, x, y, z, r?, ease?}]`: `u` 0 to 1 across the shot's visible span (including transition overlap), `x`/`y` the view centre in the photo (0 to 1), `z` zoom (1 = cover), `r` roll in degrees, `ease` for the segment ending at this key |
| `ease` | photo, video | default ease between keys (`soft`, `linear`, `inOutSine`, `inOutCubic`, `inOutQuart`, `outCubic`, `outExpo`) |
| `move` | photo, video | the preset the keys came from (information only) |
| `parallax` | photo, collage | depth parallax strength (0 = flat; 0.3 to 0.7 is typical) |
| `grade` | photo, video | per-shot override of the tour grade |
| `clipIn`, `speed` | video | clip start (s) and playback rate |
| `label` | photo, video | `{text, kicker?, at, out?, style?: "center" or "punch", size?, y?}`; `punch` is the fast half's big italic word (`out` may run past the shot to span the room); times in seconds from the shot start |
| `stats` | photo, video | `[{value, unit, caption, at, out?, y?, count?: false}]`; numeric values count up |
| `tiles`, `title`, `timing` | collage | tile media ids; `{text, sub, price, at}`; `{inEnd, expandStart, expandEnd}` |
| `bg`, `blur`, `kicker`, `headline`, `cta`, `footer`, `agent`, `at` | outro | background photo (blurred), text, agent override |
| `transition` | all but the last | `{type, dir: left/right/up/down, dur}` |
| `vo` | first shot of a group | the line's text (for reference; the audio is in `audio.vo`) |

### media.json (prep_media.py)

Each item has `kind`, `src` (the original file), `file`, `thumb`, `depth`, `depthMethod`, `w`, `h`, `aspect`, `brightness`, `sharpness`, `focus` [x, y], `tilt`, `straightened`, `dupOf`, and, for clips, `dur` and `hdr`. `_extras` lists `agent` and `logo` if they were found by name.
