"""Podcast-window renderer (reference studied 7 Nov 2026, Editing Style/Reference Analysis/Ref 2026-11-07).

The look: a black 9:16 canvas, a fixed white headline, one video window, small lowercase subtitles at the
window's foot, editorial serif "hero" words that sit BEHIND the speaker, warm fire light-leak transitions on
every cut to and from a cutaway, and slow-push graphic cards on dark ember gradients.

Everything is driven by timeline.json (written by build_timeline.py) and edit-plan.json (cut_audio.py):
  python scripts/render_window.py                 full render -> media/window-video.mp4 (no audio)
  python scripts/render_window.py --stills 1.2,8  QA stills -> analysis/qa/still-<t>.png
  python scripts/render_window.py --range 10:14   render part of the timeline (for a quick look)
"""
import argparse, json, math, subprocess
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from project import ANALYSIS, CONFIG, MEDIA, load, resolve

FPS = 30
W, H = 1080, 1920
WIN = CONFIG.get("window", {"y": 285, "h": 1350})
WY, WH = WIN["y"], WIN["h"]
SOURCE = resolve(CONFIG["source"])
TL = load("timeline.json")
PLAN = load("edit-plan.json")
TOTAL = PLAN["beats"][-1]["end"]
NF = int(round(TOTAL * FPS))

# Font files differ per OS. Each Windows name is tried first, then its macOS and Linux look-alikes.
# Studio fonts can also go in Tools/fonts/. studio_paths.font_dirs() lists every folder that is searched.
from studio_paths import font_dirs  # noqa: E402  (project.py put the skill scripts folder on sys.path)

FONT_DIRS = [Path(CONFIG["studio"]) / "Tools" / "fonts", *font_dirs()]
FONT_ALIASES = {
    "times.ttf": ["Times New Roman.ttf", "Times.ttc", "LiberationSerif-Regular.ttf", "DejaVuSerif.ttf"],
    "timesi.ttf": ["Times New Roman Italic.ttf", "LiberationSerif-Italic.ttf", "DejaVuSerif-Italic.ttf"],
    "arialbd.ttf": ["Arial Bold.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
    "GOTHICB.TTF": ["Futura.ttc", "Avenir Next.ttc", "URWGothic-Demi.otf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
    "segoeuib.ttf": ["SFNS.ttf", "Helvetica.ttc", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
    "seguisym.ttf": ["Apple Symbols.ttf", "DejaVuSans.ttf", "NotoSansSymbols2-Regular.ttf"],
}
_FONT_CACHE = {}


def _font_file(name):
    if name not in _FONT_CACHE:
        found = None
        for candidate in [name, *FONT_ALIASES.get(name, [])]:
            for d in FONT_DIRS:
                if not d.is_dir():
                    continue
                hits = [d / candidate] if (d / candidate).exists() else list(d.rglob(candidate))  # Linux nests fonts
                if hits:
                    found = hits[0]
                    break
            if found:
                break
        if found is None:
            raise SystemExit(f"font {name} not found; put it (or a look-alike) in Tools/fonts/")
        _FONT_CACHE[name] = found
    return _FONT_CACHE[name]


def font(name, size):
    return ImageFont.truetype(str(_font_file(name)), size)


F_SERIF, F_ITALIC, F_SANS = "times.ttf", "timesi.ttf", "arialbd.ttf"
F_SUB, F_HEAD, F_SYM = "GOTHICB.TTF", "segoeuib.ttf", "seguisym.ttf"
ACCENT = tuple(TL.get("accent", [232, 119, 90]))  # coral ember, RGB


def ease(p):
    p = min(max(p, 0.0), 1.0)
    return 1 - (1 - p) ** 3


def ease_io(p):
    p = min(max(p, 0.0), 1.0)
    return 4 * p ** 3 if p < .5 else 1 - (-2 * p + 2) ** 3 / 2


# ---------------------------------------------------------------- A-roll source -------------------------------
def is_hdr():
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer",
                          "-of", "csv=p=0", str(SOURCE)], capture_output=True, text=True).stdout
    return any(k in out for k in ("arib-std-b67", "smpte2084"))


def build_aroll():
    """Cut the source on the plan's frames into one SDR 30 fps file, so render reads it sequentially."""
    out = MEDIA / "aroll-sdr.mp4"
    segs = [(src_in / FPS, n) for b in PLAN["beats"] for src_in, n in b["frames"]]
    key = json.dumps(segs)
    stamp = MEDIA / "aroll-sdr.key"
    if out.exists() and stamp.exists() and stamp.read_text() == key:
        return out
    tone = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
            "zscale=t=bt709:m=bt709:r=tv,format=yuv420p") if is_hdr() else "format=yuv420p"
    args, chains = [], []
    for i, (start, n) in enumerate(segs):
        args += ["-ss", f"{start:.4f}", "-t", f"{n / FPS + .2:.4f}", "-i", str(SOURCE)]
        chains.append(f"[{i}:v]fps={FPS},trim=end_frame={n},setpts=PTS-STARTPTS[v{i}]")
    graph = ";".join(chains) + ";" + "".join(f"[v{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=0,{tone}[v]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args, "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", str(out)], check=True)
    stamp.write_text(key)
    return out


class ARoll:
    def __init__(self, path, start_frame=0):
        info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                          "-of", "json", str(path)], capture_output=True, text=True).stdout)["streams"][0]
        self.w, self.h = info["width"], info["height"]
        self.proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-ss", f"{start_frame / FPS:.4f}", "-i", str(path),
                                      "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
        self.last = None

    def next(self):
        data = self.proc.stdout.read(self.w * self.h * 3)
        if len(data) == self.w * self.h * 3:
            self.last = np.frombuffer(data, np.uint8).reshape(self.h, self.w, 3)
        return self.last


def face_track(path):
    """Face centre and height on every output frame: detected at 6 fps, interpolated, smoothed inside each cut."""
    cache = ANALYSIS / "window-face.json"
    if cache.exists():
        data = json.loads(cache.read_text())
        if data.get("n") == NF:
            return np.array(data["track"], np.float32)
    det = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=.4)
    reader = ARoll(path)
    pts = []
    for i in range(NF):
        frame = reader.next()
        if i % 5:
            continue
        r = det.process(cv2.cvtColor(cv2.resize(frame, (reader.w // 2, reader.h // 2)), cv2.COLOR_BGR2RGB))
        if r.detections:
            bb = max(r.detections, key=lambda d: d.location_data.relative_bounding_box.height).location_data.relative_bounding_box
            pts.append((i, (bb.xmin + bb.width / 2) * reader.w, (bb.ymin + bb.height / 2) * reader.h, bb.height * reader.h))
    idx = np.array([p[0] for p in pts], np.float32)
    track = np.stack([np.interp(np.arange(NF), idx, [p[k] for p in pts]) for k in (1, 2, 3)], 1)
    # Smooth inside each continuous piece of source, never across a cut.
    cuts, f = [0], 0
    for b in PLAN["beats"]:
        for _, n in b["frames"]:
            f += n
            cuts.append(min(f, NF))
    for a, b in zip(cuts, cuts[1:]):
        if b - a > 3:
            k = int(min(FPS * .9, (b - a) // 2)) * 2 + 1
            for c in range(3):
                seg = np.pad(track[a:b, c], (k // 2, k // 2), mode="edge")
                track[a:b, c] = np.convolve(seg, np.ones(k) / k, mode="valid")
    cache.write_text(json.dumps({"n": NF, "track": track.round(1).tolist()}))
    return track


# ---------------------------------------------------------------- matte ---------------------------------------
class Matte:
    def __init__(self):
        self.seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0)
        self.prev = None

    def reset(self):
        self.prev = None

    def __call__(self, img):
        small = cv2.resize(img, (img.shape[1] // 2, img.shape[0] // 2), interpolation=cv2.INTER_AREA)
        m = self.seg.process(cv2.cvtColor(small, cv2.COLOR_BGR2RGB)).segmentation_mask.astype(np.float32)
        if self.prev is not None and self.prev.shape == m.shape:
            m = m * .65 + self.prev * .35
        self.prev = m
        m = np.clip((m - .35) / .3, 0, 1)
        m = cv2.resize(m, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
        return cv2.GaussianBlur(m, (0, 0), 2.0)


# ---------------------------------------------------------------- text helpers --------------------------------
_text_cache = {}


def text_alpha(txt, fname, size, tracking=0):
    """White text as an alpha mask (float32), tightly cropped, with its baseline offset."""
    key = (txt, fname, size, tracking)
    if key in _text_cache:
        return _text_cache[key]
    f = font(fname, size)
    asc, desc = f.getmetrics()
    if tracking:
        widths = [f.getlength(c) + tracking for c in txt]
        wpx = int(sum(widths)) + size
    else:
        wpx = int(f.getlength(txt)) + size
    img = Image.new("L", (wpx, asc + desc + size // 2), 0)
    d = ImageDraw.Draw(img)
    if tracking:
        x = size // 4
        for c, wc in zip(txt, widths):
            d.text((x, size // 4), c, font=f, fill=255)
            x += wc
    else:
        d.text((size // 4, size // 4), txt, font=f, fill=255)
    a = np.asarray(img, np.float32) / 255
    ys, xs = np.where(a > 0)
    if len(xs) == 0:
        out = (np.zeros((1, 1), np.float32), 0, 0)
    else:
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        out = (a[y0:y1, x0:x1].copy(), x0 - size // 4, y0 - size // 4)
    _text_cache[key] = out
    return out


def paste_alpha(dst_a, a, x, y, opacity=1.0):
    """Max-combine a mask into a canvas-sized alpha plane at (x, y)."""
    h, w = a.shape
    H_, W_ = dst_a.shape
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W_), min(y + h, H_)
    if x1 <= x0 or y1 <= y0:
        return
    part = a[y0 - y:y1 - y, x0 - x:x1 - x] * opacity
    np.maximum(dst_a[y0:y1, x0:x1], part, out=dst_a[y0:y1, x0:x1])


def blend_color(img, alpha, color, strength=1.0):
    a = (alpha * strength)[..., None]
    img *= 1 - a
    img += a * np.array(color[::-1], np.float32)  # img is BGR


# ---------------------------------------------------------------- hero stacks ---------------------------------
HERO_SIZES = {"serif": 124, "italic": 116, "sans": 44}
HERO_ADVANCE = {"serif": .80, "italic": .86, "sans": 1.05}
HERO_FONTS = {"serif": F_SERIF, "italic": F_ITALIC, "sans": F_SANS}


def hero_layer(t, faces, full=None):
    """Alpha of every visible hero word at time t (window-sized), plus whether any hero is on screen.
    Returns (behind_alpha, front_alpha, active): a stack goes in front of the speaker when the head would hide it."""
    behind = np.zeros((WH, W), np.float32)
    front = np.zeros((WH, W), np.float32)
    active = False
    for k, hero in enumerate(TL["heroes"]):
        if not (hero["in"] - .05 <= t <= hero["out"] + .3):
            continue
        if full is not None and k != full:
            continue
        if full is None:
            active = active or t <= hero["out"] + .1
        alpha = front if FRONT.get(k) else behind
        out_p = 1 - ease((t - hero["out"]) / .25) if t > hero["out"] and full is None else 1.0
        x = hero["x"] * W
        y = hero["y"] * WH
        for row in hero["rows"]:
            size = int(HERO_SIZES[row["style"]] * hero.get("scale", 1))
            a, ox, oy = text_alpha(row["text"].upper() if row["style"] == "serif" else row["text"], HERO_FONTS[row["style"]], size,
                                   tracking=0)
            p = 1.0 if full is not None else (ease((t - row["at"]) / .22) if t >= row["at"] else 0.0)
            vis = p * out_p
            if vis > .003:
                blur = (1 - p) * 9 + (1 - out_p) * 7
                pad = int(blur * 3) if blur > .4 else 0
                part = cv2.GaussianBlur(np.pad(a, pad), (0, 0), blur) if pad else a
                px = int(x + row.get("dx", 0) * hero.get("scale", 1) - a.shape[1] / 2) - pad
                paste_alpha(alpha, part, px, int(y) - pad, vis)
            y += size * HERO_ADVANCE[row["style"]] + row.get("dy", 0)
    return behind, front, active


FRONT = {}  # hero index -> True when the speaker would hide too much of it (decided once, on its first frame)


# ---------------------------------------------------------------- light leak ----------------------------------
class Leak:
    """Warm fire light-leak: horizontal streaks of red, orange and yellow that sweep across and flash to near white."""

    def __init__(self):
        rng = np.random.default_rng(11)
        self.fields = []
        for scale in ((10, 9), (16, 7)):
            f = rng.random(scale).astype(np.float32)
            f = cv2.resize(f, (W * 3, WH), interpolation=cv2.INTER_CUBIC)
            f = cv2.GaussianBlur(f, (0, 0), sigmaX=90, sigmaY=22)
            f = (f - f.min()) / (f.max() - f.min())
            self.fields.append(f)
        stops = np.array([0, .3, .55, .75, .9, 1.0], np.float32)
        cols = np.array([[0, 0, 0], [10, 14, 170], [6, 85, 245], [16, 150, 255], [36, 210, 255], [100, 232, 255]], np.float32)  # BGR
        self.lut = np.stack([np.interp(np.linspace(0, 1, 256), stops, cols[:, c]) for c in range(3)], 1).astype(np.float32)

    def amount(self, d):
        if d < -.24 or d > .34:
            return 0.0
        return ease_io((d + .24) / .24) if d < 0 else 1 - ease_io(d / .34)

    def __call__(self, img, d, direction=1):
        a = self.amount(d)
        if a <= 0:
            return img
        shift = int((d + .24) * 2600) * direction
        f1 = np.roll(self.fields[0], shift, axis=1)[:, W:2 * W]
        f2 = np.roll(self.fields[1], int(shift * 1.6), axis=1)[:, W:2 * W]
        field = f1 * .6 + f2 * .4
        # Streaks enter from the top-right and bottom edges first, then flood the frame at the peak.
        yy = np.linspace(-1, 1, WH, dtype=np.float32)[:, None]
        edge = np.abs(yy) ** 1.5 * .55
        v = np.clip((field * 1.2 + edge) * a * 1.35 - (1 - a) * .25 + a ** 3 * .12, 0, .93)
        leak = self.lut[(v * 255).astype(np.uint8)]
        # Screen, then pull the result back toward the leak colour so the peak stays saturated, not white.
        out = 255 - (255 - img) * (255 - leak) / 255
        k = (v * a * .45)[..., None]
        return out * (1 - k) + leak * k


# ---------------------------------------------------------------- cards ---------------------------------------
S = 2  # supersample for crisp shapes


def card_bg(kind):
    yy, xx = np.mgrid[0:WH, 0:W].astype(np.float32)
    if kind == "charcoal":
        r = np.hypot((xx - W * .5) / W, (yy - WH * .38) / WH)
        base = np.array([22, 22, 24], np.float32) + np.array([30, 30, 32], np.float32) * np.exp(-(r / .5) ** 2)[..., None]
    else:  # ember: deep maroon glow lower right, like the reference's product cards
        r = np.hypot((xx - W * .62) / W, (yy - WH * .62) / WH)
        base = np.array([8, 9, 16], np.float32) + np.array([20, 34, 92], np.float32) * np.exp(-(r / .55) ** 2)[..., None]
    grain = np.random.default_rng(3).normal(0, 2.2, (WH, W, 1)).astype(np.float32)
    return np.clip(base + grain, 0, 255).astype(np.uint8)


class Card:
    def __init__(self, bg):
        self.img = Image.fromarray(cv2.cvtColor(cv2.resize(bg, (W * S, WH * S), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB))
        self.d = ImageDraw.Draw(self.img, "RGBA")

    def f(self, name, size):
        return font(name, int(size * S))

    def text(self, xy, s, name, size, fill=(255, 255, 255), alpha=1.0, anchor="mm"):
        if alpha <= .003:
            return
        self.d.text((xy[0] * S, xy[1] * S), s, font=self.f(name, size), fill=(*fill, int(255 * alpha)), anchor=anchor)

    def rrect(self, box, r, fill=None, outline=None, width=2, alpha=1.0):
        if alpha <= .003:
            return
        b = [v * S for v in box]
        rgba = lambda c: (*c[:3], int((c[3] if len(c) == 4 else 255) * alpha)) if c else None
        self.d.rounded_rectangle(b, r * S, fill=rgba(fill), outline=rgba(outline), width=int(width * S))

    def ellipse(self, box, fill=None, outline=None, width=2, alpha=1.0):
        if alpha <= .003:
            return
        self.d.ellipse([v * S for v in box], fill=(*fill[:3], int((fill[3] if len(fill) == 4 else 255) * alpha)) if fill else None,
                       outline=(*outline[:3], int(255 * alpha)) if outline else None, width=int(width * S))

    def line(self, pts, fill, width, alpha=1.0):
        if alpha > .003:
            self.d.line([(x * S, y * S) for x, y in pts], fill=(*fill, int(255 * alpha)), width=int(width * S))

    def poly(self, pts, fill, alpha=1.0):
        if alpha > .003:
            self.d.polygon([(x * S, y * S) for x, y in pts], fill=(*fill, int(255 * alpha)))

    def done(self):
        a = np.asarray(self.img)
        return cv2.cvtColor(cv2.resize(a, (W, WH), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2BGR)


def person_icon(c, cx, cy, r, color, alpha):
    c.ellipse((cx - r * .42, cy - r * .95, cx + r * .42, cy - r * .1), fill=color, alpha=alpha)
    c.d.pieslice([(cx - r * .8) * S, (cy + 0) * S, (cx + r * .8) * S, (cy + r * 1.5) * S], 180, 360, fill=(*color, int(255 * alpha)))


def appear(t, at, dur=.3):
    return ease((t - at) / dur) if t >= at else 0.0


def card_room(c, t, p):
    """'a room of people doing a million a month': a row of people, then $1M."""
    n = 7
    for i in range(n):
        a = appear(t, p["start"] + .05 + i * .07, .25)
        cx = W / 2 + (i - (n - 1) / 2) * 128
        cy = WH * .36 + (1 - a) * 30
        col = ACCENT if i == n // 2 else (200, 196, 190)
        person_icon(c, cx, cy, 52, col, a * (1 if i == n // 2 else .8))
    a = appear(t, p["value"], .3)
    c.text((W / 2, WH * .58), "$1M", F_SERIF, 200, alpha=a)
    b = appear(t, p["month"], .3)
    c.text((W / 2 + 10, WH * .71), "a month", F_ITALIC, 96, fill=(240, 220, 210), alpha=b)


def card_bars(c, t, p):
    """His $50-100K a month against the room's $1M, as two rising bars."""
    base = WH * .80
    full = WH * .52
    for i, (label, value, frac, at, col) in enumerate([("him", "$50–100K", .1, p["him"], (200, 196, 190)),
                                                       ("the room", "$1M", 1.0, p["room"], ACCENT)]):
        x = W / 2 + (-1 if i == 0 else 1) * 190
        g = ease_io((t - at) / .55) if t >= at else 0
        hgt = full * frac * g
        c.rrect((x - 95, base - max(hgt, 2), x + 95, base), 14, fill=(*col, 255), alpha=min(1, g * 3))
        c.text((x, base - hgt - 60), value, F_SERIF, 74, alpha=appear(t, at + .25, .3))
        c.text((x, base + 52), label, F_SANS, 30, fill=(200, 196, 190), alpha=appear(t, at, .3))
    c.line([(W / 2 - 360, base), (W / 2 + 360, base)], (120, 110, 105), 2, alpha=appear(t, p["start"], .3))
    c.text((W / 2, WH * .14), "a month", F_ITALIC, 70, fill=(240, 220, 210), alpha=appear(t, p["month"], .3))


def card_playcard(c, t, p):
    """'here's a card up your hand': an ace rises and turns to face the camera."""
    a = appear(t, p["card"], .55)
    w_, h_ = 420, 600
    cx, cy = W / 2, WH * .5 + (1 - a) * 380
    turn = 1 - a
    # Glow behind the card.
    for k in range(6, 0, -1):
        c.ellipse((cx - 300 - k * 30, cy - 330 - k * 30, cx + 300 + k * 30, cy + 330 + k * 30), fill=(*ACCENT, 10), alpha=a)
    sx = max(.08, abs(math.cos(turn * math.pi * .5)))
    x0, x1 = cx - w_ / 2 * sx, cx + w_ / 2 * sx
    c.rrect((x0, cy - h_ / 2, x1, cy + h_ / 2), 28, fill=(246, 241, 234, 255), alpha=min(1, a * 2))
    if sx > .6:
        k = (sx - .6) / .4
        c.text((x0 + 58 * sx, cy - h_ / 2 + 70), "A", F_SERIF, 92, fill=ACCENT, alpha=k)
        c.text((x0 + 58 * sx, cy - h_ / 2 + 140), "♠", F_SYM, 60, fill=ACCENT, alpha=k)
        c.text((cx, cy + 10), "♠", F_SYM, 230 * sx, fill=ACCENT, alpha=k)
        c.text((x1 - 58 * sx, cy + h_ / 2 - 70), "A", F_SERIF, 92, fill=ACCENT, alpha=k)
    c.text((W / 2, WH * .1), "up your", F_ITALIC, 64, fill=(240, 220, 210), alpha=appear(t, p["up"], .3))


TOASTS = [("+", "Rahul", "started following you"), ("♥", "Priya", "liked your reel"),
          ("↗", "Arjun", "shared your post"), ("✓", "Neha", "saved your post")]


def card_toasts(c, t, p):
    """'a social following which is respected': notifications stack in."""
    for i, (icon, name, what) in enumerate(TOASTS):
        at = p["at"][i]
        a = appear(t, at, .35)
        if a <= 0:
            continue
        y = WH * .2 + i * 170 - (1 - a) * 60
        c.rrect((110, y, W - 110, y + 138), 34, fill=(36, 34, 38, 235), outline=(255, 255, 255, 40), width=2, alpha=a)
        c.ellipse((140, y + 26, 226, y + 112), fill=ACCENT, alpha=a)
        c.text((183, y + 69), icon, F_SYM, 44, alpha=a)
        c.text((256, y + 50), name, F_SANS, 34, alpha=a, anchor="lm")
        c.text((256, y + 96), what, F_SUB, 30, fill=(200, 196, 190), alpha=a, anchor="lm")
        c.text((W - 150, y + 50), "now", F_SUB, 26, fill=(150, 146, 140), alpha=a, anchor="rm")
    c.text((W / 2, WH * .86), "respected", F_ITALIC, 92, fill=(240, 220, 210), alpha=appear(t, p["respected"], .3))


def card_three(c, t, p):
    """'who you are, what you do, what your opinions are': three editorial lines."""
    for i, (big, small, at) in enumerate(p["rows"]):
        a = appear(t, at, .3)
        y = WH * (.3 + i * .2)
        c.text((W / 2 - 20, y), big, F_SERIF, 118, alpha=a, anchor="rm")
        c.text((W / 2 + 10, y + 8), small, F_ITALIC, 96, fill=(240, 220, 210), alpha=a, anchor="lm")


def card_seven(c, t, p, thumbs):
    """'proof on camera again and again, at least seven times': seven takes light up, then 7x."""
    tw, th = 190, 300
    pos = [(W / 2 + (i - 1.5) * 220, WH * .3) for i in range(4)] + [(W / 2 + (i - 1) * 220, WH * .3 + 340) for i in range(3)]
    for i, (x, y) in enumerate(pos):
        at = p["start"] + .1 + i * p["gap"]
        a = appear(t, at, .25)
        if a <= 0:
            continue
        box = (x - tw / 2, y - th / 2 + (1 - a) * 40, x + tw / 2, y + th / 2 + (1 - a) * 40)
        thumb = thumbs[i]
        im = Image.fromarray(cv2.cvtColor(thumb, cv2.COLOR_BGR2RGB)).resize((int(tw * S), int(th * S)))
        mask = Image.new("L", im.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], 22 * S, fill=int(255 * a))
        c.img.paste(im, (int(box[0] * S), int(box[1] * S)), mask)
        c.rrect(box, 22, outline=(*ACCENT, 255), width=3, alpha=a)
        c.poly([(x - 18, y - 24 + (1 - a) * 40), (x - 18, y + 24 + (1 - a) * 40), (x + 24, y + (1 - a) * 40)], (255, 255, 255), alpha=a * .9)
    k = appear(t, p["seven"], .3)
    c.text((W / 2, WH * .08), "7×", F_SERIF, 120, alpha=k)
    c.text((W / 2, WH * .9), "BACKED BY RESEARCH", F_SANS, 34, fill=(240, 220, 210), alpha=appear(t, p["research"], .3))


def card_dm(c, t, p):
    """'a client comes to you saying I've been following you': a DM arrives."""
    a = appear(t, p["start"], .35)
    c.rrect((120, WH * .2, W - 120, WH * .8), 44, fill=(28, 27, 30, 245), outline=(255, 255, 255, 36), width=2, alpha=a)
    c.ellipse((165, WH * .2 + 40, 245, WH * .2 + 120), fill=ACCENT, alpha=a)
    c.text((205, WH * .2 + 80), "C", F_SERIF, 46, alpha=a)
    c.text((270, WH * .2 + 62), "New client", F_SANS, 34, alpha=a, anchor="lm")
    c.text((270, WH * .2 + 102), "sent you a message", F_SUB, 26, fill=(160, 156, 150), alpha=a, anchor="lm")
    c.line([(150, WH * .2 + 150), (W - 150, WH * .2 + 150)], (70, 68, 72), 2, alpha=a)
    typing = t >= p["typing"] and t < p["message"]
    if typing:
        y = WH * .5
        c.rrect((170, y - 45, 330, y + 45), 45, fill=(58, 56, 62, 255))
        for i in range(3):
            bounce = math.sin((t * 9 - i * .8)) * 6
            c.ellipse((205 + i * 40 - 10, y - 10 + bounce, 205 + i * 40 + 10, y + 10 + bounce), fill=(200, 196, 190))
    m = appear(t, p["message"], .3)
    if m > 0:
        y = WH * .5 - (1 - m) * 20
        c.rrect((170, y - 70, 870, y + 70), 50, fill=(58, 56, 62, 255), alpha=m)
        c.text((215, y), "I've been following you", F_SUB, 46, alpha=m, anchor="lm")
        c.text((180, y + 110), "Seen · just now", F_SUB, 24, fill=(150, 146, 140), alpha=appear(t, p["message"] + .6, .3), anchor="lm")


def card_price(c, t, p):
    """'charge more, and nobody asks you for a discount'."""
    w1, w2 = c.f(F_SERIF, 118).getlength("CHARGE") / S, c.f(F_ITALIC, 110).getlength("more") / S
    left = (W - w1 - w2 - 28) / 2
    c.text((left, WH * .3), "CHARGE", F_SERIF, 118, alpha=appear(t, p["charge"], .3), anchor="lm")
    c.text((left + w1 + 28, WH * .31), "more", F_ITALIC, 110, fill=(240, 220, 210), alpha=appear(t, p["more"], .3), anchor="lm")
    a = appear(t, p["chip"], .3)
    if a > 0:
        cy = WH * .6
        c.rrect((W / 2 - 250, cy - 70, W / 2 + 250, cy + 70), 70, fill=(40, 38, 42, 255), outline=(255, 255, 255, 60), width=2, alpha=a)
        c.text((W / 2, cy), "discount?", F_ITALIC, 84, fill=(230, 226, 220), alpha=a)
        s = ease_io((t - p["strike"]) / .3) if t >= p["strike"] else 0
        if s > 0:
            c.line([(W / 2 - 230, cy + 8), (W / 2 - 230 + 460 * s, cy - 8)], ACCENT, 9)
            c.text((W / 2, cy + 130), "nobody asks", F_SANS, 32, fill=(*ACCENT,), alpha=s)


def card_comment(c, t, p):
    """'comment the word ATTRACT': a comment field, typed, then sent (like the reference's chat-box card)."""
    a = appear(t, p["start"], .35)
    y = WH * .48
    c.text((W / 2, WH * .3), "Comment", F_SERIF, 110, alpha=a)
    c.rrect((110, y - 80, W - 110, y + 80), 40, fill=(30, 29, 32, 240), outline=(255, 255, 255, 70), width=2, alpha=a)
    word = "ATTRACT"
    n = int(np.clip((t - p["typeAt"]) / p["typeDur"] * len(word) + 1, 0, len(word))) if t >= p["typeAt"] else 0
    if n == 0:
        c.text((160, y), "Add a comment…", F_SUB, 38, fill=(130, 126, 120), alpha=a, anchor="lm")
    else:
        c.text((160, y), word[:n], F_SANS, 58, fill=(255, 255, 255), anchor="lm")
    if int(t * 2.4) % 2 == 0 and a > .9:
        cw = c.f(F_SANS, 58).getlength(word[:n]) / S if n else 0
        c.line([(162 + cw + 6, y - 32), (162 + cw + 6, y + 32)], (255, 255, 255), 3)
    sent = appear(t, p["send"], .25)
    c.ellipse((W - 210, y - 50, W - 110 - 10, y + 50), fill=ACCENT if sent > 0 else (70, 68, 72), alpha=a)
    c.text((W - 165, y), "↑", F_SYM, 50, alpha=a)
    if sent > 0:
        for k in range(1, 4):
            r = 50 + sent * 40 * k
            c.ellipse((W - 165 - r, y - r, W - 165 + r, y + r), outline=ACCENT, width=2, alpha=(1 - sent) * .7)
        c.text((W / 2, y + 170), "we'll set it up for you", F_ITALIC, 64, fill=(240, 220, 210), alpha=sent)


CARDS = {"room": card_room, "bars": card_bars, "playcard": card_playcard, "toasts": card_toasts, "three": card_three,
         "dm": card_dm, "price": card_price, "comment": card_comment}


# ---------------------------------------------------------------- subtitles & headline --------------------------
def draw_subtitle(win, text):
    a, ox, oy = text_alpha(text, F_SUB, 34)
    h, w = a.shape
    x = (W - w) // 2
    y = WH - 92 - h // 2
    shadow = np.zeros((WH, W), np.float32)
    paste_alpha(shadow, a, x, y + 2)
    shadow = cv2.GaussianBlur(shadow, (0, 0), 5)
    blend_color(win, shadow, (0, 0, 0), .55)
    m = np.zeros((WH, W), np.float32)
    paste_alpha(m, a, x, y)
    blend_color(win, m, (255, 255, 255))


def headline_mask():
    a, _, _ = text_alpha(TL["headline"], F_HEAD, 42)
    m = np.zeros((WY, W), np.float32)
    paste_alpha(m, a, (W - a.shape[1]) // 2, WY - 26 - a.shape[0])
    return m


# ---------------------------------------------------------------- grade & camera ------------------------------
def grade(img):
    """Moody warm grade: pull the bright sky down, a touch of warmth and contrast, soft vignette."""
    f = img.astype(np.float32)
    lum = f.mean(2, keepdims=True)
    f = f - np.clip(lum - 150, 0, None) * .45  # highlight roll-off
    f = (f - 118) * 1.04 + 113
    lum = f.mean(2, keepdims=True)
    f = lum + (f - lum) * .86  # tame the orange skin the HDR tone-map leaves
    f *= np.array([.97, .99, 1.02], np.float32)  # BGR: a little warmer
    return f


VIGNETTE = None


def vignette():
    global VIGNETTE
    if VIGNETTE is None:
        yy = np.linspace(-1, 1, WH, dtype=np.float32)[:, None]
        xx = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
        top = np.clip(1 - (yy + 1) / .9, 0, 1) ** 1.4 * .35  # darker sky band, where the hero words sit
        VIGNETTE = (1 - .28 * (xx ** 2 + .5 * yy ** 2) - top)[..., None]
    return VIGNETTE


def zoom_at(t, keys):
    z = keys[0][1]
    for at, target, dur in keys[1:]:
        if t >= at:
            z = z + (target - z) * ease_io((t - at) / max(dur, .01))
    return z


def crop_window(frame, face, s, face_y):
    sh, sw = frame.shape[:2]
    cw, ch = W / s, WH / s
    cx = float(np.clip(face[0], cw / 2, sw - cw / 2))
    top = float(np.clip(face[1] - face_y * ch, 0, sh - ch))
    m = np.float32([[s, 0, -(cx - cw / 2) * s], [0, s, -top * s]])
    return cv2.warpAffine(frame, m, (W, WH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


# ---------------------------------------------------------------- main ----------------------------------------
class BRoll:
    """A user-supplied clip as a cutaway: cover-cropped to the window, slow push-in (the reference's stock shots),
    tone-mapped if HDR. Shot keys: file (relative to the project's Assets folder), from (seconds), push (default .08)."""
    _open = {}

    @classmethod
    def frame(cls, shot, t):
        path = resolve(CONFIG["assets"]) / shot["file"]
        key = str(path)
        if key not in cls._open:
            sdr = MEDIA / f"broll-{path.stem}.mp4"
            if not sdr.exists():
                probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer",
                                        "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout
                tone = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,"
                        if any(k in probe for k in ("arib-std-b67", "smpte2084")) else "")
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-an", "-vf",
                                f"{tone}fps={FPS},scale=w='if(gt(a,{W}/{WH}),-2,{W})':h='if(gt(a,{W}/{WH}),{WH},-2)',crop={W}:{WH},format=yuv420p",
                                "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", str(sdr)], check=True)
            cls._open[key] = cv2.VideoCapture(str(sdr))
        cap = cls._open[key]
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        idx = int((shot.get("from", 0) + t - shot["start"]) * FPS) % max(n, 1)
        if int(cap.get(cv2.CAP_PROP_POS_FRAMES)) != idx:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, fr = cap.read()
        u = (t - shot["start"]) / max(shot["end"] - shot["start"], .1)
        z = 1 + shot.get("push", .08) * ease_io(u)
        return cv2.warpAffine(fr, np.float32([[z, 0, -(z - 1) * W / 2], [0, z, -(z - 1) * WH / 2]]), (W, WH), borderMode=cv2.BORDER_REFLECT)


def shot_at(t):
    for s in TL["shots"]:
        if s["start"] <= t < s["end"]:
            return s
    return TL["shots"][-1]


def decide_fronts(aroll_path, track, limit=.12):
    """A stack sits behind the speaker (the reference look) only if the head never hides more than `limit` of it
    across its whole time on screen; otherwise it goes in front. Sampled 7 times per stack."""
    cache = ANALYSIS / "hero-front.json"
    key = json.dumps([[h["in"], h["out"], h["x"], h["y"], [r["text"] for r in h["rows"]]] for h in TL["heroes"]])
    if cache.exists():
        data = json.loads(cache.read_text())
        if data.get("key") == key:
            FRONT.update({int(k): v for k, v in data["front"].items()})
            return
    cap = cv2.VideoCapture(str(aroll_path))
    seg = Matte()
    for k, hero in enumerate(TL["heroes"]):
        full_b, _, _ = hero_layer(hero["in"], track, full=k)
        worst = 0.0
        for tt in np.linspace(hero["in"], hero["out"], 7):
            shot = shot_at(tt)
            if shot["kind"] != "aroll":
                continue
            i = min(int(tt * FPS), NF - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ok, fr = cap.read()
            if not ok:
                continue
            raw = crop_window(fr, track[i], zoom_at(tt - shot["start"], shot["camera"]), shot.get("faceY", .6))
            seg.reset()
            person = seg(raw)
            worst = max(worst, 1 - float((full_b * (1 - person)).sum()) / max(float(full_b.sum()), 1))
        FRONT[k] = worst > limit
        print(f"hero {k} '{hero['rows'][0]['text']}' worst hidden {worst:.0%} -> {'front' if FRONT[k] else 'behind'}", flush=True)
    cap.release()
    cache.write_text(json.dumps({"key": key, "front": FRONT}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", default="")
    ap.add_argument("--range", default="")
    ap.add_argument("--out", default=str(MEDIA / "window-video.mp4"))
    args = ap.parse_args()

    aroll_path = build_aroll()
    track = face_track(aroll_path)
    matte = Matte()
    decide_fronts(aroll_path, track)
    leak = Leak()
    bgs = {"ember": card_bg("ember"), "charcoal": card_bg("charcoal")}
    head = headline_mask()

    # Thumbnails for the 'seven' card come from the speaker's own footage.
    thumbs = []
    cap = cv2.VideoCapture(str(aroll_path))
    for k in range(7):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(NF * (.06 + k * .13)))
        ok, fr = cap.read()
        fh, fw = fr.shape[:2]
        tw = int(fh * 190 / 300)
        thumbs.append(cv2.convertScaleAbs(fr[:, (fw - tw) // 2:(fw + tw) // 2] if tw < fw else fr, alpha=.9, beta=-6))
    cap.release()

    if args.stills:
        frames = [int(float(v) * FPS) for v in args.stills.split(",")]
        out_dir = ANALYSIS / "qa"
        out_dir.mkdir(parents=True, exist_ok=True)
    elif args.range:
        a, b = (float(v) for v in args.range.split(":"))
        frames = list(range(int(a * FPS), min(int(b * FPS), NF)))
    else:
        frames = list(range(NF))

    enc = None
    if not args.stills:
        enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
                                "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
                                "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", args.out], stdin=subprocess.PIPE)

    reader = ARoll(aroll_path, frames[0])
    expected = frames[0]
    last_shot = None
    for i in frames:
        if i != expected:  # stills jump around
            reader = ARoll(aroll_path, i)
        expected = i + 1
        t = i / FPS
        frame = reader.next()
        shot = shot_at(t)
        if shot is not last_shot:
            matte.reset()
            last_shot = shot
        hero_b, hero_f, hero_on = hero_layer(t, track)
        if shot["kind"] == "card":
            c = Card(bgs[shot.get("bg", "ember")])
            if shot["type"] == "seven":
                card_seven(c, t, shot, thumbs)
            else:
                CARDS[shot["type"]](c, t, shot)
            win = c.done().astype(np.float32)
            u = t - shot["start"]
            push = 1 + .06 * (u / max(shot["end"] - shot["start"], .1))
            win = cv2.warpAffine(win, np.float32([[push, 0, -(push - 1) * W / 2], [0, push, -(push - 1) * WH / 2]]), (W, WH),
                                 borderMode=cv2.BORDER_REFLECT)
            if u < .3 and not shot.get("noFocus"):
                win = cv2.GaussianBlur(win, (0, 0), (1 - u / .3) ** 2 * 12 + .01)
        elif shot["kind"] == "broll":
            win = grade(BRoll.frame(shot, t)) * vignette()
        else:
            s = zoom_at(t - shot["start"], shot["camera"])
            face = track[min(i, NF - 1)]
            raw = crop_window(frame, face, s, shot.get("faceY", .6))
            win = grade(raw)
            win *= vignette()
            if hero_b.max() > 0 or hero_f.max() > 0:
                person = matte(raw) if hero_b.max() > 0 else 0
                # A soft dark glow first, so white serif reads on bright sky and leaves.
                glow = cv2.GaussianBlur(hero_b * (1 - person) + hero_f, (0, 0), 16)
                blend_color(win, glow, (0, 0, 0), .42)
                blend_color(win, hero_b * (1 - person) + hero_f, (255, 252, 246))
        if not hero_on and shot.get("subs", True):
            sub = next((s_ for s_ in TL["subs"] if s_["in"] <= t < s_["out"]), None)
            if sub:
                draw_subtitle(win, sub["text"])
        for lk in TL["leaks"]:
            d = t - lk["t"]
            if -.25 < d < .35:
                win = leak(np.clip(win, 0, 255), d, lk.get("dir", 1))
        canvas = np.zeros((H, W, 3), np.float32)
        reveal = ease(t / .35) if t < .35 else 1.0
        vis = int(WH * max(reveal, .02))
        y0 = (WH - vis) // 2
        canvas[WY + y0:WY + y0 + vis] = win[y0:y0 + vis]
        hm = head * ease(t / .3)
        canvas[:WY] = hm[..., None] * 255
        out = np.clip(canvas, 0, 255).astype(np.uint8)
        if args.stills:
            cv2.imwrite(str(ANALYSIS / "qa" / f"still-{t:05.2f}.png"), out)
        else:
            enc.stdin.write(out.tobytes())
            if i % 150 == 0:
                print(f"{t:.1f}s / {TOTAL:.1f}s", flush=True)
    if enc:
        enc.stdin.close()
        enc.wait()
        print("wrote", args.out)


if __name__ == "__main__":
    main()
