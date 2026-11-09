"""Synthesize the sound-effects track from the same timeline as the graphics.

Stereo, layered sound design (Whitestair reel, 4 Nov 2026). The first version is kept as make_sfx_basic.py.
Every sound is generated here from the storyboard, so it lands on the same frame as its graphic:
  cuts          stereo whoosh panning across, alternating direction
  hero words    layered impact (sub drop + knock + air); red is a deeper boom, green adds a success chime
  name reveal   riser into a big hit plus sparkle (the hero word on a white board, the brand name)
  tiles, cards  pops that climb in pitch, cards with a short swoosh in front
  white board   paper swish
  hand          movement air, then a two-part mouse click
  typing        key presses on every typed character (browser URL, comment)
  browser       load swoosh and two-note chime
  verify        quiet scan hum, then a three-note success chime
  comment CTA   sheet rise, send swoosh, heart pop, plane fly-by, DM notification chime
"""
import json, math, wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

EDIT = Path(__file__).resolve().parents[1]
SR = 48000
board = json.loads((EDIT / "storyboard.json").read_text(encoding="utf8"))
total = board["duration"]
track = np.zeros((int((total + 2) * SR), 2), np.float32)
rng = np.random.default_rng(7)
counts = {}


def n_of(dur):
    return int(dur * SR)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return (np.minimum(t / max(attack, 1e-5), 1) * np.exp(-t / decay)).astype(np.float32)


def filt(x, kind, freq, order=2):
    return sosfilt(butter(order, freq, kind, fs=SR, output="sos"), x).astype(np.float32)


_ir = None


def reverb(x, mix=.22, length=.9):
    """Small-room tail: noise with an exponential decay, darker over time."""
    global _ir
    if _ir is None:
        n = n_of(length)
        _ir = filt(rng.standard_normal(n).astype(np.float32), "lowpass", 5200) * env(n, .004, length / 5)
        _ir /= np.sqrt((_ir ** 2).sum())
    wet = fftconvolve(x, _ir)[:len(x) + len(_ir) - 1]
    out = np.zeros(len(wet), np.float32)
    out[:len(x)] = x
    return out + wet.astype(np.float32) * mix


def add(name, at, sound, gain, pan=0.):
    """pan: -1 left, +1 right, or a (from, to) pair that sweeps across the sound."""
    i = int(at * SR)
    if i < 0:
        sound, i = sound[-i:], 0
    if i >= len(track) or not len(sound):
        return
    if isinstance(pan, tuple):
        p = np.linspace(pan[0], pan[1], len(sound))
    else:
        p = np.full(len(sound), pan)
    angle = (p + 1) * np.pi / 4  # constant-power pan
    stereo = np.stack([sound * np.cos(angle), sound * np.sin(angle)], 1) * np.sqrt(2)
    end = min(len(track), i + len(stereo))
    track[i:end] += stereo[:end - i] * gain
    counts[name] = counts.get(name, 0) + 1


# ---- sounds -----------------------------------------------------------------

def whoosh(dur=.32, rising=True, peak=.62):
    n = n_of(dur)
    noise = rng.standard_normal(n).astype(np.float32)
    lo, hi = (300, 4200) if rising else (4200, 300)
    out = np.zeros(n, np.float32)
    # Band-pass noise whose centre sweeps: filter in short blocks, each with its own band.
    block = 480
    for a in range(0, n, block):
        f = lo * (hi / lo) ** (a / n)
        seg = noise[max(0, a - 960):a + block]
        out[a:a + block] = filt(seg, "bandpass", [f * .55, min(f * 1.8, 20000)])[-len(noise[a:a + block]):]
    t = np.linspace(0, 1, n)
    shape = np.where(t < peak, (t / peak) ** 1.6, ((1 - t) / (1 - peak)) ** 2.2)
    return out * shape.astype(np.float32) * 1.6


def impact(depth=1.):
    """Sub drop + body knock + a burst of air. depth > 1 is deeper and longer."""
    n = n_of(.55 * depth)
    t = np.arange(n) / SR
    f0, f1 = 95 / depth, 42 / depth
    freq = f1 + (f0 - f1) * np.exp(-t / .045)
    sub = np.sin(2 * np.pi * np.cumsum(freq) / SR).astype(np.float32) * env(n, .002, .16 * depth)
    knock = np.sin(2 * np.pi * 190 * t).astype(np.float32) * env(n, .001, .03)
    air = filt(rng.standard_normal(n).astype(np.float32), "bandpass", [900, 7000]) * env(n, .001, .045)
    return reverb(sub * .9 + knock * .45 + air * .35, .16)


def pop(freq=520):
    n = n_of(.12)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (freq * t + freq * 2.2 * t ** 2 / .12)).astype(np.float32) * env(n, .0008, .03)
    tick = filt(rng.standard_normal(n).astype(np.float32), "highpass", 3000) * env(n, .0002, .002)
    return reverb(body + tick * .3, .12)


def click():
    """Mouse click: a sharp down-click and a softer release 55 ms later."""
    n = n_of(.09)
    out = np.zeros(n, np.float32)
    for at, g in ((0, 1.), (n_of(.055), .5)):
        m = n_of(.012)
        burst = filt(rng.standard_normal(m).astype(np.float32), "bandpass", [1800, 9000]) * env(m, .0002, .0018)
        ping = np.sin(2 * np.pi * 2600 * np.arange(m) / SR).astype(np.float32) * env(m, .0002, .003)
        out[at:at + m] += (burst + ping * .4) * g
    return out


def key():
    """One key press, slightly different each time."""
    n = n_of(.05)
    t = np.arange(n) / SR
    centre = rng.uniform(2200, 4200)
    clack = filt(rng.standard_normal(n).astype(np.float32), "bandpass", [centre * .6, centre * 1.5]) * env(n, .0003, .004)
    thock = np.sin(2 * np.pi * rng.uniform(260, 340) * t).astype(np.float32) * env(n, .0005, .008)
    return clack + thock * .5


def chime(notes, gap=.075, decay=.32):
    n = n_of(gap * len(notes) + decay * 4)
    out = np.zeros(n, np.float32)
    for k, f in enumerate(notes):
        m = n_of(decay * 4)
        t = np.arange(m) / SR
        bell = (np.sin(2 * np.pi * f * t) + .28 * np.sin(2 * np.pi * 2 * f * t) + .1 * np.sin(2 * np.pi * 3.01 * f * t))
        start = n_of(gap * k)
        out[start:start + m] += bell.astype(np.float32) * env(m, .002, decay)
    return reverb(out * .5, .3)


def sparkle(dur=.6):
    n = n_of(dur + .3)
    out = np.zeros(n, np.float32)
    for at in np.sort(rng.uniform(0, dur, 11)):
        m = n_of(.16)
        t = np.arange(m) / SR
        out[n_of(at):n_of(at) + m] += np.sin(2 * np.pi * rng.uniform(2600, 5600) * t).astype(np.float32) * env(m, .001, .035)
    return reverb(out * .45, .35)


def riser(dur=.6):
    n = n_of(dur)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * (t / dur) ** 2) / SR).astype(np.float32)
    air = whoosh(dur, True, .97)[:n]
    return (tone * .25 + air * .7) * ((t / dur) ** 2).astype(np.float32)


def paper():
    n = n_of(.22)
    swish = filt(rng.standard_normal(n).astype(np.float32), "highpass", 2500)
    t = np.linspace(0, 1, n)
    return swish * (np.sin(np.pi * t) ** 1.5).astype(np.float32) * .7


def hum(dur):
    n = n_of(dur)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 180 * t) + .4 * np.sin(2 * np.pi * 360 * t)
    return (tone * (.6 + .4 * np.sin(2 * np.pi * 6 * t)) * np.minimum(1, np.minimum(t, dur - t) / .06)).astype(np.float32)


def flap():
    """One split-flap card falling: a dry plastic clack with a tiny pitch."""
    n = n_of(.035)
    t = np.arange(n) / SR
    clack = filt(rng.standard_normal(n).astype(np.float32), "bandpass", [1400, 6500]) * env(n, .0002, .005)
    tone = np.sin(2 * np.pi * rng.uniform(700, 1000) * t).astype(np.float32) * env(n, .0003, .006)
    return clack + tone * .3


def tick(freq=2400, dur=.03):
    n = n_of(dur)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq * t) * env(n, .0003, .006)).astype(np.float32) + \
        filt(rng.standard_normal(n).astype(np.float32), "highpass", 4000) * env(n, .0001, .0015) * .4


def coin():
    """Bright token/coin shimmer: two inharmonic bells."""
    n = n_of(.6)
    t = np.arange(n) / SR
    bell = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((2637, 1), (3950, .55), (5274, .3)))
    return reverb((bell * env(n, .001, .12)).astype(np.float32) * .4, .3)
def glide(f0, f1, dur):
    """A soft sine sliding from f0 to f1: a dull flat tone, a falling 'value drop' or a sad blip."""
    n = n_of(dur)
    t = np.arange(n) / SR
    freq = f0 + (f1 - f0) * (t / dur)
    tone = np.sin(2 * np.pi * np.cumsum(freq) / SR) + .3 * np.sin(4 * np.pi * np.cumsum(freq) / SR)
    shape = np.minimum(1, t / .02) * np.minimum(1, (dur - t) / .08)
    return reverb((tone * shape).astype(np.float32) * .6, .18)


C6, E6, G6, C7, A5, E5 = 1046.5, 1318.5, 1568.0, 2093.0, 880.0, 659.3

# ---- timeline -----------------------------------------------------------------

for index, beat in enumerate(board["beats"]):
    s = beat["start"]
    side = 1 if index % 2 else -1  # alternate the direction of the cut whoosh
    if index:
        add("cut whoosh", s - .2, whoosh(.3), .34, (-.7 * side, .7 * side))
    else:
        add("open hit", s, impact(.8), .3)
    for point in beat.get("blurAt", []):
        add("cut whoosh", s + point - .2, whoosh(.3), .3, (.6, -.6))

    for o in beat["overlays"]:
        kind, at = o["type"], s + o["in"]
        if o.get("word"):
            hit, tone = s + o["wordAt"], o.get("tone", "cyan")
            if o.get("ink") and o["word"].startswith("".join(ch for ch in board["title"].split()[0] if ch.isalnum()).upper()):
                # The brand-name reveal gets the biggest moment of the reel.
                add("reveal riser", hit - .6, riser(.6), .22)
                add("reveal hit", hit, impact(1.15), .55)
                add("reveal sparkle", hit + .05, sparkle(), .22)
            elif tone == "red":
                add("hero boom", hit, impact(1.35), .55)
            elif o.get("karaoke") and tone in ("green", "cyan"):  # karaoke captions (Sarmila reel): hit plus shimmer
                add("hero hit", hit, impact(.95), .36)
                add("hero shimmer", hit + .18, sparkle(.45), .13)
            elif tone == "green":  # two-tier house captions (approved VoiceStudio to Muse)
                add("hero hit", hit, impact(.9), .3)
                add("success chime", hit + .02, chime([C6, G6], .07, .25), .14)
            elif tone == "gold":
                add("hero hit", hit, impact(1.05), .4)
                add("gold sparkle", hit + .12, sparkle(.5), .16)
            else:
                add("hero hit", hit, impact(), .42)
        if kind == "tiles":
            for k, item in enumerate(o["items"]):
                add("tile pop", s + item["at"], pop(480 + 140 * k), .3, (-.35, .35)[k % 2] if not item.get("hot") else 0)
        if kind in ("panel", "slotCard"):
            add("card swoosh", at - .08, whoosh(.2), .18)
            add("card pop", at + .12, pop(430), .26)
        if kind == "slots":
            for k, item in enumerate(o["items"]):
                add("card swoosh", s + item["at"] - .14, whoosh(.16), .14, .3)
                add("card pop", s + item["at"], pop(440 + 90 * k), .28)
        if kind == "appWindow":
            add("window rise", at - .04, whoosh(.38), .26, (-.2, .2))
            add("window land", at + .36, impact(.55), .14)
        if kind == "repoScroll":
            add("scroll rise", max(at - .3, 0), whoosh(.3), .2)
        if kind == "white" and o["in"] > 0:
            add("paper swish", at - .05, paper(), .3)
        if kind == "hand":
            x0, x1 = o["from"][0], o["to"][0]
            add("hand move", at, whoosh(.24, False), .07, ((x0 - 540) / 540, (x1 - 540) / 540))
            add("mouse click", s + o["tap"], click(), .55, (x1 - 540) / 600)
        if kind == "browser":
            add("window rise", at - .04, whoosh(.36), .24)
            span = o["loadAt"] - .1 - o["typeAt"]
            for k in range(len(o["url"])):
                add("key", s + o["typeAt"] + (k + 1) / len(o["url"]) * span, key(), .3, rng.uniform(-.25, .25))
            add("page load", s + o["loadAt"], whoosh(.28, False), .2)
            add("load chime", s + o["loadAt"] + .05, chime([A5, E6], .08, .22), .12)
        if kind == "verify":
            add("scan hum", at, hum(o["doneAt"] - o["in"]), .035)
            add("done chime", s + o["doneAt"], chime([C6, E6, G6]), .17)
        if kind == "commentSheet":
            add("sheet rise", at - .05, whoosh(.34), .26)
            for k in range(len(o["text"])):
                t_key = o["times"][k] if o.get("times") else o["typeAt"] + k * .05
                add("key", s + t_key, key(), .4, rng.uniform(-.2, .2))
            add("send swoosh", s + o["sendAt"], whoosh(.24, False), .3, (.3, .9))
            add("heart pop", s + o["sendAt"] + .4, pop(900), .22, .5)
            if o["dmAt"] < beat["duration"]:  # this reel's DM rows arrive in the next beat as notify rows
                add("plane fly-by", s + o["dmAt"] - .34, whoosh(.42), .2, (.8, -.8))
                add("dm chime", s + o["dmAt"], chime([E6, C7], .1, .3), .16)
        if kind in ("pill", "duo"):
            for k, item in enumerate(o.get("items") or [None]):
                add("tile pop", s + (item["at"] if item else o["in"]), pop(520 + 120 * k), .28)
        if kind == "typer":
            # Same deterministic, hesitant timing as motion.js typer, so every clack lands on its letter.
            add("window rise", at, whoosh(.3), .2)
            t_key = o["typeAt"]
            for k, ch in enumerate(o["text"]):
                if ch == " ":
                    add("space bar", s + t_key, key() * .6 + impact(.35)[:n_of(.05)] * .25, .38)
                else:
                    add("key", s + t_key, key(), .42, rng.uniform(-.3, .3))
                r = abs(math.fmod(math.sin(k * 12.9898) * 43758.5453, 1))
                t_key += o["step"] * (0.65 + 0.7 * r)
        if kind == "price":
            add("card swoosh", at - .06, whoosh(.24), .2)
            add("card pop", at + .2, pop(400), .26)
            for k in range(8):  # quick counter ticks up to the price
                add("count tick", s + o["countAt"] + k * .055, pop(900 + 60 * k)[:n_of(.03)], .12)
            add("strike slash", s + o["strikeAt"] - .1, whoosh(.18, False, .8), .36, (-.6, .6))
            add("strike boom", s + o["strikeAt"], impact(1.3), .5)
            add("stamp hit", s + o["strikeAt"] + .1, impact(.6), .3, .4)
        if kind == "waveBadge":
            add("badge pop", at, pop(760), .24)
        if kind == "wave":
            add("wave shimmer", at, riser(.5) * .6 + sparkle(.4)[:n_of(.5)], .2)
        if kind == "code":
            add("card swoosh", at - .08, whoosh(.2), .18)
            add("card pop", at + .12, pop(470), .26)
            add("code clicks", at + .2, np.concatenate([key(), key(), key()]), .22)
        if kind == "notify":
            add("notify swoosh", at - .1, whoosh(.24), .2, (.6, 0))
            add("dm chime", at + .05, chime([E6, C7], .1, .3), .15)
        # ---- Muse reel builders ----
        if kind == "tokenMeter":
            add("meter rise", at - .05, whoosh(.36), .26, (-.3, .3))
            add("meter land", at + .32, impact(.6), .18)
            c0, d = s + o["countAt"], o.get("dur", 1.1)
            add("count riser", c0, riser(d), .16)
            for k in range(26):  # odometer roll: fast ticks that slow down as the digits settle
                p = k / 25
                add("odometer tick", c0 + d * (1 - (1 - p) ** 1.8), tick(1800 + 1400 * p), .13, rng.uniform(-.5, .5))
            add("counter settle", c0 + d, impact(.8), .3)
            add("coin shimmer", c0 + .1, coin(), .16, (-.6, .6))
            add("coin shimmer", c0 + d + .05, coin(), .14, (.6, -.6))
            if "freeAt" in o:
                add("stamp slam", s + o["freeAt"], impact(1.1), .42, .35)
                add("success chime", s + o["freeAt"] + .03, chime([C6, E6, G6, C7], .06, .3), .16)
        if kind == "codeFlap":
            add("card swoosh", at - .06, whoosh(.26), .2)
            add("card pop", at + .25, pop(420), .2)
            step = o.get("step", .09)
            for i in range(len(o["code"])):
                land = s + o["flapAt"] + i * step + .18
                t0 = s + o["flapAt"]
                while t0 < land - .01:  # the cell flaps every 1/30 s until it lands
                    add("flap clack", t0, flap(), .16, -.5 + i / max(1, len(o["code"]) - 1))
                    t0 += 1 / 30
                add("flap land", land, pop(600 + 110 * i), .3, -.5 + i / max(1, len(o["code"]) - 1))
            add("code ready", s + o["flapAt"] + len(o["code"]) * step + .2, chime([E6, A5 * 2], .06, .22), .12)
            if "pressAt" in o:
                add("redeem confirm", s + o["pressAt"] + .08, chime([C6, G6, C7], .07, .3), .18)
        if kind == "timeline":
            add("card swoosh", at - .06, whoosh(.3), .22)
            add("card land", at + .3, impact(.5), .14)
            r0, d = s + o["runAt"], o.get("dur", 1.4)
            for k in range(12):  # each film frame snapping onto the track
                add("frame tick", r0 + d * (1 - (1 - (k + 1) / 12) ** .5) ** 1, tick(1500 + 90 * k, .025), .14, -.6 + 1.2 * k / 11)
            add("playhead riser", r0, riser(d) * .7, .14)
            add("timeline done", r0 + d, chime([G6, C7], .07, .25), .15)
        if kind == "stepRail":
            if o.get("enter", True):
                add("rail drop", at - .05, whoosh(.24, False), .18, (0, 0))
            if o.get("active", -1) >= 0:
                add("step blip", s + o.get("activeAt", o["in"]), chime([A5 * 2 * (1.12 ** o["active"])], .05, .14), .16,
                    -.6 + .3 * o["active"])
        if kind == "offerTimer":
            add("card swoosh", at - .06, whoosh(.3), .22)
            add("timer alarm", at + .3, chime([E6, E6 * 1.06], .09, .12), .1)
            k, t0 = 0, at + .12
            while t0 < s + o["out"]:  # clock tick-tock under the scrambling digits
                add("clock tick", t0, tick(2900 if k % 2 else 2100, .025), .16, .25 if k % 2 else -.25)
                t0 += .14; k += 1
            add("tag pop", s + o.get("tagAt", o["in"] + .3), pop(700), .26, .5)
        # ---- Sarmila reel builders (8 Nov 2026) ----
        if kind == "chart":
            add("card swoosh", at - .06, whoosh(.3), .22, (-.3, .2))
            add("card land", at + .3, impact(.5), .12)
            draw, span = s + o["drawAt"], o.get("drawFor", 1.4)
            if o["mode"] == "compound":
                add("growth riser", draw, riser(span), .2)
            elif o["mode"] == "down":
                add("value drop", draw, whoosh(span, False, .25), .22, (.4, -.4))
                add("drop tone", draw, glide(880, 220, span), .1)
            else:
                add("flat tone", draw, glide(330, 300, span), .06)
            for st in o.get("stats", []):
                for k in range(7):
                    add("count tick", s + st["at"] + k * st.get("dur", .7) / 8, pop(820 + 70 * k)[:n_of(.03)], .1)
                land = s + st["at"] + st.get("dur", .7)
                if st.get("tone") == "red":
                    add("sad blip", land, glide(520, 260, .35), .14)
                else:
                    add("stat land", land, pop(700), .22)
            for m in o.get("marks", []):
                add("mark pop", s + m["at"], pop(620 + 240 * o["marks"].index(m)), .3, .3)
            if o.get("tag"):
                add("tag pop", s + o["tagAt"], pop(380), .24, .4)
        if kind == "counter":
            add("counter pop", at, pop(500), .2)
            for k in range(10):
                add("count tick", s + o["at"] + k * o.get("dur", .8) / 11, pop(760 + 55 * k)[:n_of(.03)], .12)
            land = s + o["at"] + o.get("dur", .8)
            add("counter land", land, impact(.8), .26)
            add("bell", land + .02, chime([E6, C7] if o.get("tone") == "cyan" else [C6, G6], .06, .3), .15)
        if kind == "progress":
            add("scrub", s + o["at"], whoosh(o.get("dur", .8), True, .85), .2, (-.6, .6))
            add("end click", s + o["endAt"], click(), .5, .6)
            add("end pop", s + o["endAt"] + .02, pop(720), .2, .6)
        if kind == "nameCard":
            add("card swoosh", at - .05, whoosh(.32), .24, (-.5, 0))
            add("name riser", s + o["nameAt"] - .3, riser(.3), .12)
            add("name sparkle", s + o["nameAt"] + .05, sparkle(.55), .2)
            add("check pop", s + o.get("checkAt", o["title"][0][1]), pop(880), .24)
            for k in range(o.get("kids", 0)):
                add("kid pop", s + o["kidsAt"] + k * .12, pop(620 + 160 * k), .26, .35)
        if kind == "profile":
            add("card swoosh", at - .05, whoosh(.32), .24, (-.4, .1))
            for k in range(8):
                add("count tick", s + o["ageAt"] + k * .06, pop(800 + 60 * k)[:n_of(.03)], .11)
            add("age land", s + o["ageAt"] + .58, pop(640), .22)
            if o.get("capAt") is not None:
                add("cap drop", s + o["capAt"] - .1, whoosh(.18, False), .16)
                add("cap land", s + o["capAt"] + .28, impact(.45), .2)
            for k, c in enumerate(o.get("chips", [])):
                add("chip pop", s + c["at"], pop(560 + 150 * k), .26, .3)
        if kind == "transfer":
            add("block rise", at, whoosh(.28), .18)
            add("card pop", s + o["from"]["at"], pop(420), .28, -.5)
            add("card pop", s + o["to"]["at"], pop(620), .3, .5)
            for k in range(3):
                add("coin fly", s + o["flyAt"] + k * .16, whoosh(.5, True, .5), .16, (-.5, .5))
                add("coin clink", s + o["flyAt"] + k * .16 + .5, chime([G6 * (1 + .06 * k)], .05, .08), .11, .5)
            add("cash ding", s + o["flyAt"] + .72, chime([C7, E6 * 2], .07, .35), .18, .5)
        if kind == "darkBoard" and o.get("fade", .2) > .05 and o["in"] > 0:
            add("board hit", at + .02, impact(1.2), .42)
        if kind == "flash":
            add("flash riser", at - .45, riser(.45), .2)
            if o.get("tone") == "red":
                add("red sting", at, glide(220, 90, .5), .14)
        if kind == "proof":
            add("proof rise", at - .04, whoosh(.4), .24, (.2, -.2))
            add("proof land", at + .4, impact(.5), .14)
            add("ring chime", s + o["ringAt"], chime([E6, G6, C7], .06, .3), .16)
        if kind == "compare":
            for item in o["items"]:
                add("bar swell", s + item["at"], riser(item.get("dur", .6)), .16 if item["tone"] == "cyan" else .08)
                add("bar land", s + item["at"] + item.get("dur", .6), pop(760 if item["tone"] == "cyan" else 300), .24)
        if kind == "sheetList":
            add("sheet rise", at - .05, whoosh(.36), .26)
            for row in o["rows"]:
                if row["icon"] == "x":
                    add("cross buzz", s + row["at"] + .05, glide(180, 150, .18), .12)
                    add("cross pop", s + row["at"] + .05, pop(300), .24)
                else:
                    add("check chime", s + row["at"] + .05, chime([C6, G6], .07, .25), .16)
        if kind == "statement":
            add("paper slide", at - .02, paper(), .32)
            add("card pop", at + .3, pop(460), .2)
            add("lens glide", s + o["lensAt"], whoosh(.45, True, .6), .16, (.7, -.1))
            add("question ping", s + o["hotAt"], chime([A5, E6], .09, .25), .16)

track = track[:int(total * SR)]
peak = float(np.abs(track).max())
# Keep headroom under the dialogue; the assemble mix adds this at 0.5 through a limiter.
if peak > .75:
    track *= .75 / peak
pcm = (np.clip(track, -1, 1) * 32767).astype(np.int16)
with wave.open(str(EDIT / "media" / "sfx.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(dict(sorted(counts.items())), "peak before trim", round(peak, 3))
