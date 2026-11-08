"""Synthesize the sound-effects track from the same timeline as the graphics."""
import json, wave
from pathlib import Path

import numpy as np

EDIT = Path(__file__).resolve().parents[1]
SR = 48000
board = json.loads((EDIT / "storyboard.json").read_text(encoding="utf8"))
total = board["duration"]
track = np.zeros(int((total + 1) * SR), np.float32)
rng = np.random.default_rng(7)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(t / attack, 1) * np.exp(-t / decay)


def add(at, sound, gain):
    i = int(at * SR)
    if 0 <= i < len(track):
        end = min(len(track), i + len(sound))
        track[i:end] += sound[:end - i] * gain


def whoosh(dur=.3, rising=True):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # A one-pole low-pass whose cutoff sweeps gives air moving past.
    sweep = np.linspace(.02, .32, n) if rising else np.linspace(.32, .02, n)
    out, state = np.zeros(n, np.float32), 0.
    for i in range(n):
        state += sweep[i] * (noise[i] - state)
        out[i] = state
    return out * np.hanning(n)


def tone(freq, dur, decay, attack=.002):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t).astype(np.float32) * env(n, attack, decay)


def thump():
    n = int(.26 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (58 * t + 42 * (1 - np.exp(-t / .03)) * .03)).astype(np.float32) * env(n, .002, .08)


def pop():
    n = int(.1 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (320 * t + 700 * t ** 2 / .2)).astype(np.float32) * env(n, .001, .025)


def click():
    n = int(.03 * SR)
    return rng.standard_normal(n).astype(np.float32) * env(n, .0003, .004) / 4


events = {"whoosh": 0, "thump": 0, "pop": 0, "click": 0, "chime": 0}
for index, beat in enumerate(board["beats"]):
    s = beat["start"]
    if index:
        add(s - .12, whoosh(), .3)
        events["whoosh"] += 1
    for point in beat.get("blurAt", []):
        add(s + point - .12, whoosh(), .3)
    for o in beat["overlays"]:
        kind = o["type"]
        if o.get("word"):
            add(s + o["wordAt"], thump(), .5)
            events["thump"] += 1
        if kind == "tiles":
            for item in o["items"]:
                add(s + item["at"], pop(), .34)
                events["pop"] += 1
        if kind in ("pill", "panel", "code", "waveBadge", "slotCard"):
            add(s + o["in"], pop(), .3)
            events["pop"] += 1
        if kind == "slots":
            for item in o["items"]:
                add(s + item["at"], pop(), .32)
                events["pop"] += 1
        if kind == "duo":
            for item in o["items"]:
                add(s + item["at"], pop(), .3)
        if kind == "appWindow":
            add(s + o["in"], whoosh(.34), .28)
        if kind == "hand":
            add(s + o["tap"], click(), .4)
            events["click"] += 1
        if kind == "repoScroll":  # counter ticks that slow as it lands
            for p in np.linspace(.02, 1, 26):
                add(s + 2.3 * (1 - (1 - p) ** (1 / 3)) * .96, click(), .1)
        if kind == "browser":
            for i in range(14):
                add(s + o["typeAt"] + i * (o["loadAt"] - .1 - o["typeAt"]) / 14, click(), .13)
            add(s + o["loadAt"], whoosh(.3, False), .3)
            add(s + o["loadAt"] + .03, tone(880, .4, .12), .09)
            add(s + o["loadAt"] + .11, tone(1320, .5, .16), .09)
            events["chime"] += 1
        if kind == "verify":
            add(s + o["doneAt"], tone(988, .4, .12), .1)
            add(s + o["doneAt"] + .08, tone(1480, .5, .16), .1)
            events["chime"] += 1
        if kind == "commentSheet":
            add(s + o["in"], whoosh(.3), .3)
            for i in range(len(o["text"])):
                add(s + o["typeAt"] + i * .05, click(), .16)
            add(s + o["sendAt"], whoosh(.24, False), .3)
            add(s + o["sendAt"] + .44, pop(), .3)
            add(s + o["dmAt"] - .3, whoosh(.34), .22)
            add(s + o["dmAt"], tone(1046, .45, .13), .11)
            add(s + o["dmAt"] + .1, tone(1568, .6, .18), .11)
            events["chime"] += 1

track = np.clip(track, -1, 1)[:int(total * SR)]
pcm = (np.repeat(track[:, None], 2, 1) * 32767).astype(np.int16)
with wave.open(str(EDIT / "media" / "sfx.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(events, "peak", float(np.abs(track).max()))
