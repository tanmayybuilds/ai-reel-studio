"""Turn plan.json into tour.json: a two-act reel.

  Act 1, FAST (about half the reel): the opening collage + "2 BHK" title, then quick shots cut on the music
         beat (2 beats each, about 1 s), the camera never stops (linear moves, big zooms and pans), whip / zoom
         transitions that continue the motion, a big punch label per room. Music-led; only the intro hook is spoken.
  Act 2, SLOW (the other half): room by room, gentle keyframed moves (3.5 s or more per shot), the detailed
         voiceover, room labels, stat chips, the room tracker, then the agent card.

  $py scripts/build_tour.py            build tour.json from plan.json (+ voiceover.json timing)
  $py scripts/build_tour.py --retime   keep every shot; re-fit only the slow act's durations and the voice placement

plan.json (Claude writes it after looking at analysis/media-sheet.jpg). Full format: references/tour-json.md
{
  "title": "2 BHK, Godrej Platinum", "accent": "#2EE6FF",
  "length": 60,                                     # target reel length; fast act = length - slow act
  "fast": {"seconds": null, "bpm": null, "beatsPerShot": 2},  # optional; bpm from Music/ or 120; 3 beats/shot if few photos
  "intro": {"hero": "p03", "tiles": [...], "title": "2 BHK", "sub": "Godrej Platinum · Vikhroli East",
            "price": "₹1.85 Cr", "vo": "short hook line"},
  "rooms": [{"room": "Living", "label": "Sunlit Living Room", "media": ["p03","p04"], "fastMedia": ["p03","p04","p05"],
             "vo": "two detailed sentences", "stats": [{"value": "1,050", "unit": "sq ft", "caption": "Carpet area"}]}],
  "outro": {"bg": "p03", "headline": "Book a site visit", "cta": "Call / WhatsApp", "vo": "..."},
  "agent": {"name": "...", "company": "...", "phone": "+91 ...", "since": "2015"}
}
"""
import argparse, subprocess
from pathlib import Path

import numpy as np

from tourlib import CONFIG, MEDIA, PROJ, load, log, save, timeline

OUT_ASPECT = 9 / 16
SLOW_MIN_SHOT = 3.5
WORDS_PER_SEC = 2.45
LEAD, TAIL = 0.35, 0.6
FAST_MOVES = ["panRight", "push", "orbitR", "panLeft", "pull", "tiltUp", "orbitL", "push"]
SLOW_MOVES_PORTRAIT = ["push", "orbitR", "pull", "push", "orbitL"]
SLOW_MOVES_LANDSCAPE = ["panRight", "push", "panLeft", "orbitR"]


# ---------------------------------------------------------------- music tempo
def find_music():
    for folder in (Path(CONFIG["source"]) / "Music", MEDIA):
        if folder.exists():
            for f in sorted(folder.iterdir()):
                if f.suffix.lower() in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"} and (folder.name == "Music" or f.stem.startswith("music")):
                    return f
    return None


def detect_beat(path):
    """Tempo (70..170 bpm) and the time of the first strong beat, from a spectral-flux onset envelope."""
    sr, hop = 22050, 512
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-t", "90", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    n = (len(x) - 2048) // hop
    if n < 200:
        return None
    frames = np.lib.stride_tricks.as_strided(x, (n, 2048), (x.strides[0] * hop, x.strides[0]))
    spec = np.abs(np.fft.rfft(frames * np.hanning(2048), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(spec), axis=0)).sum(1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    fps = sr / hop
    ac = np.correlate(flux, flux, "full")[len(flux) - 1:]
    lags = np.arange(len(ac))
    lo, hi = int(fps * 60 / 170), int(fps * 60 / 70)
    lag = lo + int(np.argmax(ac[lo:hi]))
    bpm = 60 * fps / lag
    if bpm < 95:  # prefer the energetic double-time feel for the fast act
        bpm *= 2
    period = 60 / bpm * fps
    phases = [flux[int(p)::max(1, int(round(period)))][:64].sum() for p in np.arange(0, period, 1)]
    offset = float(np.argmax(phases)) / fps
    return round(float(bpm), 2), round(offset, 3)


# ---------------------------------------------------------------- camera keys
def view_w(aspect, z):
    return (OUT_ASPECT / aspect if aspect > OUT_ASPECT else 1.0) / z


def keys_for(move, m, amp=1.0, variant=0):
    """Camera keyframes over the shot's visible span (u 0..1). amp > 1 = bigger, faster moves (fast act).
    variant shifts the framing so a photo used twice looks different."""
    fx, fy = (m.get("focus") or [0.5, 0.5])
    if variant % 2:
        fx = 1 - fx
    a = m.get("aspect", 0.75)
    k = lambda u, x, y, z, r=0: {"u": u, "x": round(x, 3), "y": round(y, 3), "z": round(z, 3), **({"r": round(r, 2)} if r else {})}
    dz = 0.12 * amp
    if move == "push":
        z0 = 1.03 + (0.12 if variant else 0)
        return [k(0, 0.5, 0.5, z0), k(1, 0.5 + (fx - 0.5) * 0.7, 0.5 + (fy - 0.5) * 0.5, z0 + dz * 1.6)]
    if move == "pull":
        z1 = 1.03 + (0.1 if variant else 0)
        return [k(0, 0.5 + (fx - 0.5) * 0.7, 0.5 + (fy - 0.5) * 0.5, z1 + dz * 1.7), k(1, 0.5, 0.5, z1)]
    if move in ("panLeft", "panRight"):
        z = (1.05 if a > OUT_ASPECT * 1.3 else 1.32) + (0.1 if variant else 0)
        half = view_w(a, z) / 2
        lo, hi = half, 1 - half
        travel = min(hi - lo, 0.28 * amp + 0.06)
        mid = min(max(fx, lo + travel / 2), hi - travel / 2)
        x0, x1 = mid - travel / 2, mid + travel / 2
        if move == "panLeft":
            x0, x1 = x1, x0
        return [k(0, x0, 0.5, z), k(1, x1, 0.5, z + dz * 0.5)]
    if move in ("tiltUp", "tiltDown"):
        span = 0.1 * amp
        y0, y1 = (0.5 + span, 0.5 - span) if move == "tiltUp" else (0.5 - span, 0.5 + span)
        return [k(0, 0.5, y0, 1.22 + dz * 0.3), k(1, 0.5, y1, 1.22 + dz * 0.8)]
    if move in ("orbitR", "orbitL", "orbit"):
        s = 0.07 * amp
        x0, x1 = (0.5 - s, 0.5 + s) if move != "orbitL" else (0.5 + s, 0.5 - s)
        r = 0.6 * amp * (1 if move != "orbitL" else -1)
        return [k(0, x0, 0.5, 1.16 + dz * 0.2, -r), k(1, x1, 0.5, 1.16 + dz * 0.6, r)]
    if move == "hold":
        return [k(0, 0.5, 0.5, 1.0), k(1, 0.5, 0.5, 1.0 + 0.05 * amp)]
    return keys_for("push", m, amp, variant)


def card_keys(move, m, amp=1.0, variant=0):
    """Keys for a photo shown in a rounded card at its own shape (the card already fits the photo, so moves
    happen inside a slight zoom)."""
    fx, fy = (m.get("focus") or [0.5, 0.5])
    if variant % 2:
        fx = 1 - fx
    k = lambda u, x, y, z, r=0: {"u": u, "x": round(x, 3), "y": round(y, 3), "z": round(z, 3), **({"r": round(r, 2)} if r else {})}
    d = 0.07 * amp
    if move == "push":
        return [k(0, 0.5, 0.5, 1.02), k(1, 0.5 + (fx - 0.5) * 0.4, 0.5 + (fy - 0.5) * 0.3, 1.02 + d * 1.6)]
    if move == "pull":
        return [k(0, 0.5 + (fx - 0.5) * 0.4, 0.5 + (fy - 0.5) * 0.3, 1.04 + d * 1.6), k(1, 0.5, 0.5, 1.03)]
    z = 1.1 + d
    if move in ("panLeft", "panRight", "orbitR", "orbitL", "orbit"):
        x0, x1 = 0.5 - d * 0.9, 0.5 + d * 0.9
        if move in ("panLeft", "orbitL"):
            x0, x1 = x1, x0
        r = (0.5 * amp if move.startswith("orbit") else 0) * (1 if x1 > x0 else -1)
        return [k(0, x0, 0.5, z, -r), k(1, x1, 0.5, z + d * 0.4, r)]
    if move in ("tiltUp", "tiltDown"):
        y0, y1 = (0.5 + d * 0.9, 0.5 - d * 0.9) if move == "tiltUp" else (0.5 - d * 0.9, 0.5 + d * 0.9)
        return [k(0, 0.5, y0, z), k(1, 0.5, y1, z + d * 0.4)]
    return [k(0, 0.5, 0.5, 1.02), k(1, 0.5, 0.5, 1.02 + d)]


def wants_card(m):
    """Landscape photos fill a tall frame only by cropping ~60% away and stretching; show them in a card instead."""
    return m["kind"] == "photo" and m.get("aspect", 0.75) > 1.15


def motion_dir(move, keys):
    """Direction the picture flows on screen, so the next whip continues it."""
    dx = keys[-1]["x"] - keys[0]["x"]
    dy = keys[-1]["y"] - keys[0]["y"]
    if abs(dy) > abs(dx) * 1.5:
        return "down" if dy < 0 else "up"
    return "left" if dx >= 0 else "right"


def parallax_for(move, m, fast):
    if m["kind"] == "video" or not m.get("depth"):
        return 0
    strong = m.get("depthMethod") == "depth-anything-v2"
    base = {"push": 0.6, "pull": 0.6, "orbitR": 0.75, "orbitL": 0.75, "orbit": 0.75}.get(move, 0.4)
    if fast:
        base *= 0.8  # big fast moves stretch depth edges sooner
    return round(base if strong else base * 0.5, 2)


# ---------------------------------------------------------------- voice
def vo_length(key, text, vo):
    if vo and key in vo.get("lines", {}):
        return vo["lines"][key]["dur"]
    return len((text or "").split()) / WORDS_PER_SEC if text else 0.0


def place_voice(tour, vo):
    segs, total = timeline(tour)
    starts = {}
    for g in segs:
        starts.setdefault(g["shot"].get("group"), g["start"])
    clips = []
    for key, line in ((vo or {}).get("lines") or {}).items():
        if key not in starts:
            continue
        lead = 0.4 if key == "intro" else LEAD
        clips.append({"key": key, "file": line["file"], "start": round(starts[key] + lead, 3), "dur": line["dur"]})
    tour["audio"] = {**tour.get("audio", {}), "vo": sorted(clips, key=lambda c: c["start"])}
    tour["duration"] = round(total, 3)
    fast = [g for g in segs if g["shot"].get("act") == "fast"]
    if fast:
        tour["audio"]["fastEnd"] = round(fast[-1]["end"], 3)


# ---------------------------------------------------------------- acts
def slow_act(plan, media, vo):
    shots = []
    for r_i, room in enumerate(plan.get("rooms", [])):
        key = f"room-{r_i + 1:02d}"
        ids = [m for m in room["media"] if m in media]
        if not ids:
            log(f"warning: {key} has no known media, skipped")
            continue
        ln = vo_length(key, room.get("vo"), vo)
        total = max(len(ids) * SLOW_MIN_SHOT, ln + LEAD + TAIL)
        weights = [1.2] + [1.0] * (len(ids) - 1)
        for k, mid in enumerate(ids):
            m = media[mid]
            given = room.get("moves") or []
            if k < len(given) and given[k]:
                move = given[k]
            elif m["kind"] == "video":
                move = "hold"
            else:
                pool = SLOW_MOVES_LANDSCAPE if m.get("aspect", 0.75) > 1.15 else SLOW_MOVES_PORTRAIT
                move = pool[(r_i + k) % len(pool)]
            card = wants_card(m) and room.get("frame", "auto") != "full"
            keys = card_keys(move, m, amp=0.8) if card else keys_for(move, m, amp=0.8)
            shot = {"id": f"{key}-{k + 1}", "act": "slow", **({"frame": "card"} if card else {}), "kind": "video" if m["kind"] == "video" else "photo", "group": key,
                    "room": room["room"], "media": mid, "move": move, "keys": keys, "ease": "soft",
                    "parallax": parallax_for(move, m, False), "dur": round(total * weights[k] / sum(weights), 2)}
            if m["kind"] == "video":
                shot["clipIn"] = room.get("clipIn", 0)
                shot["dur"] = round(min(shot["dur"], max(2.0, m["dur"] - shot["clipIn"] - 0.6)), 2)
            if k == 0 and room.get("label"):
                shot["label"] = {"text": room["label"], "at": 0.5}
                if room.get("kicker") is not None:
                    shot["label"]["kicker"] = room["kicker"]
            if room.get("stats"):
                target = 1 if len(ids) > 1 else 0
                if k == target:
                    shot["stats"] = [dict(s, at=s.get("at", 0.9 if target else 1.8)) for s in room["stats"]]
            last = k == len(ids) - 1
            t_type = room.get("transition") or ("zoom" if last and move in ("push", "pull") else "slide" if last else "fade")
            shot["transition"] = {"type": t_type, "dir": motion_dir(move, keys), "dur": 0.7 if t_type == "fade" else 0.6}
            shots.append(shot)
        shots[-len(ids)]["vo"] = room.get("vo", "")
    return shots


def fast_act(plan, media, vo, target, bpm, beats_per_shot=2):
    beat = 60 / bpm
    intro = plan.get("intro") or {}
    shots = []
    if intro:
        hero = intro["hero"]
        tiles = [t for t in intro.get("tiles", []) if t in media] or [k for k in media if k.startswith("p")][:8]
        beats = 8 if bpm >= 100 else 6
        hook = vo_length("intro", intro.get("vo"), vo)
        while beats * beat < hook + 0.6:
            beats += 2
        dur = round(beats * beat, 3)
        hm = media[hero]
        keys = keys_for("push", hm, amp=1.4)
        shots.append({"id": "intro", "act": "fast", "kind": "collage", "group": "intro", "media": hero, "tiles": tiles, "dur": dur,
                      "keys": keys, "ease": "linear", "parallax": parallax_for("push", hm, True), "room": None,
                      "timing": {"inEnd": 0.5, "expandStart": round(dur * 0.32, 2), "expandEnd": round(dur * 0.32 + 0.6, 2)},
                      "title": {"text": intro.get("title", ""), "sub": intro.get("sub", ""), "price": intro.get("price", ""), "at": round(dur * 0.32 + 0.35, 2)},
                      "transition": {"type": "zoom", "dur": 0.32}, "vo": intro.get("vo", "")})
    used = sum(s["dur"] for s in shots)
    shot_len = beats_per_shot * beat  # 2 beats = 1 s at 120 bpm; use 3 when there are few photos
    n = max(4, int(round((target - used) / shot_len)))
    # per room pool (fastMedia or the room's media), shares proportional to pool size
    rooms = [(r["room"], [m for m in (r.get("fastMedia") or r["media"]) if m in media]) for r in plan.get("rooms", [])]
    rooms = [(name, pool) for name, pool in rooms if pool]
    total_pool = sum(len(p) for _, p in rooms)
    counts = [max(1, round(n * len(p) / total_pool)) for _, p in rooms]
    while sum(counts) > n and max(counts) > 1:
        counts[counts.index(max(counts))] -= 1
    while sum(counts) < n:
        counts[counts.index(min(counts))] += 1
    mv = 0
    for (name, pool), cnt in zip(rooms, counts):
        first_of_room = len(shots)
        for j in range(cnt):
            mid = pool[j % len(pool)]
            m = media[mid]
            move = "hold" if m["kind"] == "video" else FAST_MOVES[mv % len(FAST_MOVES)]
            if m.get("aspect", 0.75) > 1.15 and move in ("tiltUp",):
                move = "panRight"
            mv += 1
            card = wants_card(m) and (j + mv) % 2 == 0
            keys = card_keys(move, m, amp=1.6, variant=j // len(pool)) if card else keys_for(move, m, amp=1.6, variant=j // len(pool))
            shot = {"id": f"fast-{len(shots):02d}", "act": "fast", **({"frame": "card"} if card else {}), "kind": "video" if m["kind"] == "video" else "photo", "group": "fast",
                    "room": name, "media": mid, "move": move, "keys": keys, "ease": "linear",
                    "parallax": parallax_for(move, m, True), "dur": round(shot_len, 3)}
            if m["kind"] == "video":
                shot["clipIn"] = round(min(max(0, m["dur"] - shot_len - 0.5), j * 1.2), 2)
            t_type = "zoom" if move in ("push", "pull") else "whip"
            shot["transition"] = {"type": t_type, "dir": motion_dir(move, keys), "dur": 0.3 if t_type == "whip" else 0.32}
            shots.append(shot)
        span_s = cnt * shot_len
        shots[first_of_room]["label"] = {"text": name.upper(), "style": "punch", "at": 0.08, "out": round(span_s - 0.28, 3)}
    if shots:
        shots[-1]["transition"] = {"type": "leak", "dur": 0.9}
    return shots


# ---------------------------------------------------------------- reference style (default when plan has "shots")
REF_TRANSITIONS = ["lens", "mirror", "spin", "lens", "whip", "spin", "mirror"]
TR_DUR = {"lens": 0.6, "mirror": 0.55, "spin": 0.5, "whip": 0.45, "zoom": 0.5, "flash": 0.6, "fade": 0.6, "leak": 0.8, "warp": 0.55, "slide": 0.5}


def ref_keys(move, m, variant=0):
    """The reference's camera: one long, smooth, eased move across the whole photo (no quick zooms)."""
    a = m.get("aspect", 0.75)
    fx, fy = (m.get("focus") or [0.5, 0.5])
    k = lambda u, x, y, z, r=0: {"u": u, "x": round(x, 3), "y": round(y, 3), "z": round(z, 3), **({"r": round(r, 2)} if r else {})}
    if move in ("panLeft", "panRight"):
        z = 1.02 if a > OUT_ASPECT * 1.3 else 1.25
        half = view_w(a, z) / 2
        lo, hi = half, 1 - half
        x0, x1 = lo + (hi - lo) * 0.06, hi - (hi - lo) * 0.06
        if move == "panLeft":
            x0, x1 = x1, x0
        r = 0.5 if variant % 2 else 0
        return [k(0, x0, 0.5, z, -r), k(1, x1, 0.5, z + 0.04, r)]
    if move == "pull":
        return [k(0, 0.5 + (fx - 0.5) * 0.5, 0.5 + (fy - 0.5) * 0.4, 1.28), k(1, 0.5, 0.5, 1.03)]
    if move == "push":
        return [k(0, 0.5, 0.5, 1.03), k(1, 0.5 + (fx - 0.5) * 0.5, 0.5 + (fy - 0.5) * 0.4, 1.26)]
    if move in ("tiltUp", "tiltDown"):
        y0, y1 = (0.6, 0.4) if move == "tiltUp" else (0.4, 0.6)
        return [k(0, 0.5, y0, 1.18), k(1, 0.5, y1, 1.2)]
    return ref_keys("pull", m, variant)


def build_reference(plan, media, vo):
    agent = plan.get("agent", {})
    shots = []
    hook = plan.get("hook") or plan.get("intro") or {}
    if hook:
        hero = hook["hero"]
        hm = media[hero]
        tiles = [t for t in hook.get("tiles", []) if t in media] or [k for k in media if k.startswith("p")][:6]
        ln = vo_length("intro", hook.get("vo"), vo)
        move = hook.get("move") or ("panRight" if hm.get("aspect", 0.75) > 1.15 else "pull")
        shots.append({"id": "hook", "kind": "grid", "group": "intro", "media": hero, "tiles": tiles, "room": None,
                      "dur": round(max(6.2, ln + 1.2), 2), "minDur": 6.2, "keys": ref_keys(move, hm), "ease": "inOutSine",
                      "parallax": parallax_for("pull", hm, False) * 0.6,
                      "title": {"style": "ref", "text": hook.get("title", ""), "sub": hook.get("sub", ""), "price": hook.get("price", ""), "at": 3.55},
                      "vo": hook.get("vo", "")})
    plan_shots = plan.get("shots", [])
    for i, sh in enumerate(plan_shots):
        key = f"shot-{i + 1:02d}"
        m = media.get(sh["media"])
        if not m:
            log(f"warning: {key} media {sh['media']} unknown, skipped")
            continue
        move = sh.get("move") or ("panRight" if (m.get("aspect", 0.75) > 1.15 and i % 2 == 0) else "panLeft" if m.get("aspect", 0.75) > 1.15 else "pull")
        ln = vo_length(key, sh.get("vo"), vo)
        shot = {"id": key, "kind": "video" if m["kind"] == "video" else "photo", "group": key, "room": sh.get("room"),
                "media": sh["media"], "move": move, "keys": ref_keys(move, m, i), "ease": "inOutSine",
                "parallax": round(parallax_for(move, m, False) * 0.7, 2), "dur": round(max(6.0, ln + 1.5), 2), "minDur": 6.0,
                "vo": sh.get("vo", "")}
        if sh.get("label"):
            shot["label"] = {"style": "ref", "text": sh["label"], "at": 0.7, **({"sub": sh["sub"]} if sh.get("sub") else {})}
        shots.append(shot)
    specs = plan.get("specs")
    if specs:
        ln = vo_length("specs", specs.get("vo"), vo)
        shots.append({"id": "specs", "kind": "specs", "group": "specs", "bg": specs.get("bg") or hook.get("hero"), "theme": specs.get("theme", "light"),
                      "heading": specs.get("heading", "At a glance"), "items": specs.get("items", []), "room": None,
                      "dur": round(max(6.0, ln + 1.6), 2), "minDur": 6.0, "vo": specs.get("vo", "")})
    outro = plan.get("outro")
    if outro:
        ln = vo_length("outro", outro.get("vo"), vo)
        shots.append({"id": "outro", "kind": "outro", "group": "outro", "theme": outro.get("theme", "light"),
                      "bg": outro.get("bg") or hook.get("hero"), "dur": round(max(5.0, ln + 2.2), 2), "minDur": 5.0,
                      "headline": outro.get("headline", ""), "kicker": outro.get("kicker", "Interested?"), "cta": outro.get("cta", "Call / WhatsApp"),
                      "ctaMain": outro.get("ctaMain", ""), "footer": outro.get("footer", ""), "agent": agent, "vo": outro.get("vo", "")})
    # transitions: the reference's set, rotating; a white flash into the spec card, a soft fade to the end card
    for i, s in enumerate(shots[:-1]):
        nxt = shots[i + 1]
        if nxt["kind"] == "specs" or (nxt["kind"] == "outro" and s["kind"] != "specs"):
            t_type = "flash"
        elif nxt["kind"] == "outro":
            t_type = "fade"
        else:
            given = plan_shots[int(s["id"][5:]) - 1].get("transition") if s["id"].startswith("shot-") else None
            t_type = given or REF_TRANSITIONS[i % len(REF_TRANSITIONS)]
        dx = s.get("keys", [{}])[-1].get("x", 0.5) - s.get("keys", [{}])[0].get("x", 0.5) if s.get("keys") else 0
        s["transition"] = {"type": t_type, "dir": "left" if dx >= 0 else "right", "dur": TR_DUR.get(t_type, 0.55)}
    tour = {"title": plan.get("title", CONFIG.get("title", "Property tour")), "style": "reference", "fps": CONFIG.get("fps", 30),
            "accent": plan.get("accent", CONFIG.get("accent", "#2EE6FF")), "tracker": plan.get("tracker", False), "bgColor": "#1e2024",
            "look": {"grain": 0.03, "vignette": 0.18}, "grade": {"exposure": 1.04, "contrast": 1.05, "saturation": 1.05, "warmth": 0.25},
            "agent": agent, "shots": shots,
            "audio": {"music": {"file": str(find_music() or "generated"), "bpm": plan.get("bpm", 92), "offset": 0.0}}}
    place_voice(tour, vo)
    return tour


def build(plan, media, vo):
    if plan.get("style", "reference" if plan.get("shots") else "twoAct") == "reference":
        return build_reference(plan, media, vo)
    agent = plan.get("agent", {})
    if agent.get("photo") is None and media.get("_extras", {}).get("agent"):
        agent["photo"] = media["_extras"]["agent"]
    slow = slow_act(plan, media, vo)
    outro = plan.get("outro")
    if outro:
        ln = vo_length("outro", outro.get("vo"), vo)
        if slow:
            slow[-1]["transition"] = {"type": "leak", "dur": 0.8}
        slow.append({"id": "outro", "act": "slow", "kind": "outro", "group": "outro", "bg": outro.get("bg") or (plan.get("intro") or {}).get("hero"),
                     "dur": round(max(4.5, ln + LEAD + 2.2), 2), "headline": outro.get("headline", "Book a site visit"),
                     "kicker": outro.get("kicker", "Interested?"), "cta": outro.get("cta", "Call / WhatsApp"),
                     "footer": outro.get("footer", ""), "ctaMain": outro.get("ctaMain", ""), "agent": agent, "vo": outro.get("vo", "")})
    slow_len = sum(s["dur"] for s in slow)
    fast_cfg = plan.get("fast", {})
    music = find_music()
    beat_info = detect_beat(music) if music and not fast_cfg.get("bpm") else None
    bpm = fast_cfg.get("bpm") or (beat_info[0] if beat_info else 120)
    length = float(plan.get("length", 60))
    target = fast_cfg.get("seconds") or max(15.0, length - slow_len)
    if slow_len > length * 0.6:
        words = int((length / 2 - 6) * WORDS_PER_SEC)
        log(f"warning: the detail half is {slow_len:.1f}s, more than half of the {length:.0f}s target. "
            f"Shorten the room lines to about {words} words in total (outro included) and rerun voiceover.py.")
    fast = fast_act(plan, media, vo, target, bpm, fast_cfg.get("beatsPerShot", 2))
    tour = {"title": plan.get("title", CONFIG.get("title", "Property tour")), "fps": CONFIG.get("fps", 30),
            "accent": plan.get("accent", CONFIG.get("accent", "#2EE6FF")), "tracker": plan.get("tracker", True),
            "look": {"grain": 0.035, "vignette": 0.22}, "grade": {"exposure": 1.03, "contrast": 1.04, "saturation": 1.06, "warmth": 0.3},
            "agent": agent, "shots": fast + slow,
            "audio": {"music": {"file": str(music) if music else "generated", "bpm": bpm, "offset": beat_info[1] if beat_info else 0.0}}}
    place_voice(tour, vo)
    return tour


def retime(tour, vo):
    groups = {}
    for s in tour["shots"]:
        if s.get("act") == "fast" and s.get("group") != "intro":
            continue
        groups.setdefault(s.get("group"), []).append(s)
    for key, shots in groups.items():
        line = (vo or {}).get("lines", {}).get(key)
        if not line or (key == "intro" and tour.get("style") != "reference"):
            continue
        need = line["dur"] + (2.2 if key == "outro" else 1.5 if tour.get("style") == "reference" else LEAD + TAIL)
        have = sum(s["dur"] for s in shots)
        floor = sum(s.get("minDur", 0) for s in shots) or (4.5 if key == "outro" else SLOW_MIN_SHOT * len(shots))
        target = max(floor, need)
        if abs(target - have) > 0.05:
            for s in shots:
                s["dur"] = round(s["dur"] * target / have, 2)
            log(f"{key}: {have:.2f}s -> {target:.2f}s")
    place_voice(tour, vo)
    return tour


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--retime", action="store_true")
    args = ap.parse_args()
    media = load("media.json")
    vo = load("voiceover.json", {})
    tour = retime(load("tour.json"), vo) if args.retime else build(load("plan.json"), media, vo)
    save("tour.json", tour, keep_history=True)
    segs, total = timeline(tour)
    fast_end = tour["audio"].get("fastEnd", 0)
    mus = tour["audio"].get("music", {})
    shape = "reference style" if tour.get("style") == "reference" else f"fast act 0-{fast_end:.1f}s at {mus.get('bpm')} bpm, slow act {fast_end:.1f}-{total:.1f}s"
    log(f"tour.json: {len(tour['shots'])} shots, {total:.1f}s  ({shape})"
        + ("" if vo else "  [no voiceover.json yet: durations estimated from word counts]"))
    for g in segs:
        s = g["shot"]
        lab = (s.get("label") or {}).get("text") or (s.get("title") or {}).get("text") or s.get("headline") or ""
        log(f"  {g['start']:6.2f}-{g['end']:6.2f}  {s.get('act', ''):<4} {s['id']:<11} {str(s.get('media') or s.get('bg') or ''):<4} "
            f"{s.get('move', ''):<8}{'[card]' if s.get('frame') == 'card' else '      '} -> {(s.get('transition') or {}).get('type', ''):<5} {lab}")
    if total > 90:
        log(f"warning: {total:.0f}s is long for a reel; trim voice lines or drop shots")


if __name__ == "__main__":
    main()
