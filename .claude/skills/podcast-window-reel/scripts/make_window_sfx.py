"""Sound for the podcast-window style, from the same timeline.json the picture uses.

  media/sfx.wav    fire whoosh on every light leak (the reference's signature), soft air ticks on hero words,
                   and UI sounds on the cards (pops, notification chimes, key presses, send whoosh, strike swish)
  media/music.wav  a generated warm low drone/pad bed, like the reference's constant low music bed.
                   Replace with a licensed track in v2: put it in Raw/<Video>/Assets/music.* and mix_window.py uses it.
"""
import json, wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

EDIT = Path(__file__).resolve().parents[1]
SR = 48000
TL = json.loads((EDIT / "timeline.json").read_text(encoding="utf8"))
plan = json.loads((EDIT / "edit-plan.json").read_text(encoding="utf8"))
TOTAL = plan["beats"][-1]["end"]
rng = np.random.default_rng(7)
track = np.zeros((int((TOTAL + 2) * SR), 2), np.float32)


def n_of(d):
    return int(d * SR)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return (np.minimum(t / max(attack, 1e-5), 1) * np.exp(-t / decay)).astype(np.float32)


def filt(x, kind, freq, order=2):
    return sosfilt(butter(order, freq, kind, fs=SR, output="sos"), x).astype(np.float32)


_ir = None


def reverb(x, mix=.22, length=1.1):
    global _ir
    if _ir is None:
        n = n_of(length)
        _ir = filt(rng.standard_normal(n).astype(np.float32), "lowpass", 5000) * env(n, .004, length / 5)
        _ir /= np.sqrt((_ir ** 2).sum())
    wet = fftconvolve(x, _ir)
    out = np.zeros(len(wet), np.float32)
    out[:len(x)] = x
    return out + wet.astype(np.float32) * mix


def add(at, sound, gain, pan=0.):
    i = int(at * SR)
    if i < 0:
        sound, i = sound[-i:], 0
    if i >= len(track) or not len(sound):
        return
    p = np.linspace(pan[0], pan[1], len(sound)) if isinstance(pan, tuple) else np.full(len(sound), pan)
    angle = (p + 1) * np.pi / 4
    stereo = np.stack([sound * np.cos(angle), sound * np.sin(angle)], 1) * np.sqrt(2)
    end = min(len(track), i + len(stereo))
    track[i:end] += stereo[:end - i] * gain


def whoosh(dur=.5, peak=.62, lo=250, hi=5200):
    n = n_of(dur)
    noise = rng.standard_normal(n).astype(np.float32)
    out = np.zeros(n, np.float32)
    block = 480
    for a in range(0, n, block):
        f = lo * (hi / lo) ** (a / n) if a / n < peak else hi * (lo * 2 / hi) ** ((a / n - peak) / (1 - peak))
        seg = noise[max(0, a - 960):a + block]
        out[a:a + block] = filt(seg, "bandpass", [f * .5, min(f * 1.9, 20000)])[-len(noise[a:a + block]):]
    t = np.linspace(0, 1, n)
    return out * np.where(t < peak, (t / peak) ** 1.8, ((1 - t) / (1 - peak)) ** 2).astype(np.float32) * 1.6


def fire(dur=.62, peak=.45):
    """Light-leak sound: an airy whoosh, a low 'fwoomp' swell and a little crackle."""
    n = n_of(dur)
    t = np.linspace(0, 1, n)
    shape = np.where(t < peak, (t / peak) ** 2, ((1 - t) / (1 - peak)) ** 1.6).astype(np.float32)
    body = filt(rng.standard_normal(n).astype(np.float32), "lowpass", 380) * shape * 2.2
    crackle = np.zeros(n, np.float32)
    for at in rng.uniform(.25, .8, 14):
        m = n_of(.006)
        k = n_of(at * dur)
        crackle[k:k + m] += filt(rng.standard_normal(m).astype(np.float32), "highpass", 2500) * env(m, .0002, .0015)
    return reverb(whoosh(dur, peak) * .8 + body + crackle * .5, .25)


def pop(freq=520, dur=.12):
    n = n_of(dur)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (freq * t + freq * 2.2 * t ** 2 / dur)).astype(np.float32) * env(n, .0008, .03)
    tick = filt(rng.standard_normal(n).astype(np.float32), "highpass", 3000) * env(n, .0002, .002)
    return reverb(body + tick * .3, .12)


def air_tick():
    n = n_of(.18)
    return reverb(filt(rng.standard_normal(n).astype(np.float32), "bandpass", [1500, 9000]) * env(n, .004, .03) * .6
                  + np.sin(2 * np.pi * 150 * np.arange(n) / SR).astype(np.float32) * env(n, .002, .05) * .5, .25)


def knock(depth=1.):
    n = n_of(.5 * depth)
    t = np.arange(n) / SR
    freq = 40 / depth + (90 / depth - 40 / depth) * np.exp(-t / .04)
    sub = np.sin(2 * np.pi * np.cumsum(freq) / SR).astype(np.float32) * env(n, .002, .14 * depth)
    air = filt(rng.standard_normal(n).astype(np.float32), "bandpass", [900, 6000]) * env(n, .001, .03)
    return reverb(sub + air * .3, .2)


def key():
    n = n_of(.05)
    t = np.arange(n) / SR
    c = rng.uniform(2200, 4200)
    return (filt(rng.standard_normal(n).astype(np.float32), "bandpass", [c * .6, c * 1.5]) * env(n, .0003, .004)
            + np.sin(2 * np.pi * rng.uniform(260, 340) * t).astype(np.float32) * env(n, .0005, .008) * .5)


def chime(notes, gap=.075, decay=.3):
    n = n_of(gap * len(notes) + decay * 4)
    out = np.zeros(n, np.float32)
    for k, f in enumerate(notes):
        m = n_of(decay * 4)
        t = np.arange(m) / SR
        bell = np.sin(2 * np.pi * f * t) + .28 * np.sin(2 * np.pi * 2 * f * t) + .1 * np.sin(2 * np.pi * 3.01 * f * t)
        out[n_of(gap * k):n_of(gap * k) + m] += bell.astype(np.float32) * env(m, .002, decay)
    return reverb(out * .5, .3)


def swish(dur=.22):
    n = n_of(dur)
    return filt(rng.standard_normal(n).astype(np.float32), "highpass", 2500) * (np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5).astype(np.float32) * .7


def riser(dur=.6):
    n = n_of(dur)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(180 + 520 * (t / dur) ** 2) / SR).astype(np.float32)
    return (tone * .25 + whoosh(dur, .97)[:n] * .6) * ((t / dur) ** 2).astype(np.float32)


C6, E6, G6, A5, E5 = 1046.5, 1318.5, 1568.0, 880.0, 659.3

# ---- leaks: the signature fire whoosh, peaking on the cut ------------------------------------------------------
for lk in TL["leaks"]:
    d = lk.get("dir", 1)
    add(lk["t"] - .62 * .45, fire(), .55, pan=(-.6 * d, .6 * d))

# ---- hero words: a soft air tick on each stack's first word ----------------------------------------------------
for h in TL["heroes"]:
    add(h["rows"][0]["at"] - .01, air_tick(), .32)
    big = [r for r in h["rows"] if r["style"] == "serif"]
    if big and big[0]["at"] != h["rows"][0]["at"]:
        add(big[0]["at"] - .01, air_tick(), .26)

# ---- cards -------------------------------------------------------------------------------------------------------
for s in TL["shots"]:
    if s["kind"] != "card":
        continue
    typ = s["type"]
    if typ == "room":
        for i in range(7):
            add(s["start"] + .05 + i * .07, pop(420 + i * 40), .22, pan=-.6 + i * .2)
        add(s["value"], knock(1.1), .55)
        add(s["month"], air_tick(), .3)
    elif typ == "bars":
        add(s["room"], riser(.55), .35)
        add(s["him"], pop(300), .35)
        add(s["month"], air_tick(), .3)
    elif typ == "playcard":
        add(s["card"] - .05, whoosh(.45, .5), .4, pan=(-.3, .3))
        add(s["card"] + .35, swish(.16), .35)
        add(s["card"] + .45, knock(.8), .35)
    elif typ == "toasts":
        for i, at in enumerate(s["at"]):
            add(at, chime([E6, A5] if i % 2 else [A5, E6], .06, .18), .28, pan=(-.2 + .13 * i))
            add(at, pop(600), .12)
        add(s["respected"], air_tick(), .3)
    elif typ == "three":
        for _, _, at in s["rows"]:
            add(at, knock(.9), .42)
    elif typ == "seven":
        for i in range(7):
            add(s["start"] + .1 + i * s["gap"], pop(380 + i * 55, .1), .3, pan=-.5 + i * .16)
        add(s["seven"], knock(1.2), .6)
        add(s["research"], chime([C6, G6], .07, .25), .25)
    elif typ == "dm":
        add(s["start"], whoosh(.35, .6), .3)
        for k in range(3):
            add(s["typing"] + k * .18, pop(900, .06), .08)
        add(s["message"], pop(700), .35)
        add(s["message"] + .03, chime([E6, C6], .06, .2), .3)
    elif typ == "price":
        add(s["charge"], knock(1.0), .5)
        add(s["chip"], pop(520), .3)
        add(s["strike"], swish(.25), .55, pan=(-.5, .5))
    elif typ == "comment":
        for k in range(7):
            add(s["typeAt"] + k * s["typeDur"] / 7, key(), .45, pan=-.1 + k * .03)
        add(s["send"] - .05, whoosh(.35, .5, 600, 7000), .4, pan=(0, .7))
        add(s["send"] + .1, chime([C6, E6, G6], .06, .25), .3)

track = track[:int(TOTAL * SR)]
peak = float(np.abs(track).max())
track *= .5 / max(peak, 1e-6)


def write(path, data):
    pcm = (np.clip(data, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())


write(EDIT / "media" / "sfx.wav", track)

# ---- music bed: slow warm pad on Am - F - C - G, a sub drone underneath, filtered dark -----------------------------
n = int((TOTAL + 1) * SR)
t = np.arange(n) / SR
chords = [[110.0, 164.8, 220.0, 261.6], [87.3, 130.8, 220.0, 261.6], [65.4, 98.0, 164.8, 196.0], [98.0, 146.8, 246.9, 293.7]]
bar = 4.0
music = np.zeros((n, 2), np.float32)
for k in range(int(np.ceil(TOTAL / bar)) + 1):
    notes = chords[k % 4]
    a, b = int(k * bar * SR), min(n, int((k + 1) * bar * SR + 1.5 * SR))
    if a >= n:
        break
    tt = t[a:b] - k * bar
    shape = np.minimum(1, tt / 1.2) * np.clip((bar + 1.5 - tt) / 1.5, 0, 1)
    for j, f in enumerate(notes):
        for det, pan in ((-.6, -.5), (.6, .5)):
            v = (np.sin(2 * np.pi * (f + det) * tt) + .3 * np.sin(2 * np.pi * 2 * (f + det) * tt)) * shape / len(notes)
            angle = (pan + 1) * np.pi / 4
            music[a:b, 0] += (v * np.cos(angle)).astype(np.float32)
            music[a:b, 1] += (v * np.sin(angle)).astype(np.float32)
sub = (np.sin(2 * np.pi * 55 * t) * .35 * (.85 + .15 * np.sin(2 * np.pi * .25 * t))).astype(np.float32)
music += sub[:, None]
music = np.stack([filt(music[:, c], "lowpass", 1100) for c in range(2)], 1)
fade = np.minimum(1, t / 1.0) * np.clip((TOTAL + .6 - t) / 1.2, 0, 1)
music *= fade[:, None].astype(np.float32)
music *= .5 / float(np.abs(music).max())
write(EDIT / "media" / "music.wav", music[:int(TOTAL * SR)])
print("sfx.wav and music.wav written,", len(TL["leaks"]), "leaks,", len(TL["heroes"]), "hero ticks")
