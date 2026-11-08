"""Write timeline.json for render_window.py: shots (A-roll framing or a card), hero words, subtitles, light leaks.

Every time comes from the per-beat speech evidence (cut_audio.py), so graphics land on the spoken word.
Edit this file, not timeline.json.
"""
import json, re

from project import ANALYSIS, load, save

plan = {b["id"]: b for b in load("edit-plan.json")["beats"]}
TOTAL = load("edit-plan.json")["beats"][-1]["end"]


def words(beat):
    data = json.loads((ANALYSIS / "speech-evidence" / f"{beat}.json").read_text(encoding="utf8", errors="replace"))
    out = []
    for w in data["transcription"]:
        txt = w["text"].strip()
        if txt:
            out.append((plan[beat]["start"] + w["offsets"]["from"] / 1000, plan[beat]["start"] + w["offsets"]["to"] / 1000, txt))
    return out


WORDS = {b: words(b) for b in plan}


def norm(s):
    return re.sub(r"[^a-z0-9']", "", s.lower())


def w(beat, word, n=0, lead=.04):
    """Global time of the nth occurrence of word in a beat (slightly early: Whisper starts run late)."""
    hits = [t for t, _, txt in WORDS[beat] if norm(txt) == norm(word)]
    if len(hits) <= n:
        raise SystemExit(f"{beat}: no '{word}' #{n} in {[x[2] for x in WORDS[beat]]}")
    return round(max(hits[n] - lead, plan[beat]["start"]), 3)


def B(beat):
    return plan[beat]["start"]


def E(beat):
    return plan[beat]["end"]


shots, heroes, leaks = [], [], []


def aroll(start, end, zoom, push=.04, faceY=.6):
    shots.append({"kind": "aroll", "start": start, "end": end, "camera": [[0, zoom, 0], [0, zoom, 0], [.01, zoom + push, max(end - start, .1)]],
                  "faceY": faceY})


def card(s0, s1, type_, bg="ember", **props):
    # props["start"] is when the card's own animation begins; shot start/end are s0/s1.
    shots.append({"kind": "card", "type": type_, "bg": bg, **props, "start": s0, "end": s1})


def broll(s0, s1, file, from_=0.0, push=.08):
    """A user clip (in Raw/<Video>/Assets) as a cutaway, with a slow push-in. Pair it with leaks at s0 and s1."""
    shots.append({"kind": "broll", "file": file, "from": from_, "push": push, "start": s0, "end": s1})


def hero(rows, out, x=.5, y=.035, scale=1.0):
    heroes.append({"in": rows[0]["at"], "out": out, "x": x, "y": y, "scale": scale, "rows": rows})


def r(text, style, at, dx=0, dy=0):
    return {"text": text, "style": style, "at": at, "dx": dx, "dy": dy}


# ---- beat-01: hook. "...feeling awkward walking into a room | of people doing a million a month."
c1 = w("beat-01", "of", 1)
aroll(0, c1, 1.0)
hero([r("awkward", "serif", w("beat-01", "awkward")), r("walking into", "sans", w("beat-01", "walking"), dx=-40),
      r("a room", "italic", w("beat-01", "room"), dx=60)], out=c1 - .15)
card(c1, E("beat-01"), "room", start=c1, value=w("beat-01", "million"), month=w("beat-01", "month"))
leaks.append({"t": c1})

# ---- beat-02: "his tongue ran dry and his insecurity was kicking in as soon as he stepped in."
aroll(B("beat-02"), E("beat-02"), 1.16)
leaks.append({"t": B("beat-02"), "dir": -1})
hero([r("tongue", "serif", w("beat-02", "tongue")), r("ran", "sans", w("beat-02", "ran"), dx=-70),
      r("dry", "italic", w("beat-02", "dry"), dx=50)], out=w("beat-02", "and") + .1)
hero([r("insecurity", "serif", w("beat-02", "insecurity")), r("kicking", "sans", w("beat-02", "kicking"), dx=-90),
      r("in", "italic", w("beat-02", "in"), dx=40)], out=w("beat-02", "soon"))

# ---- beat-03: "And he was only doing 50 to 100K a month."
card(B("beat-03"), E("beat-03"), "bars", bg="charcoal", start=B("beat-03"), room=B("beat-03") + .1, him=w("beat-03", "50"),
     month=w("beat-03", "month"))
leaks.append({"t": B("beat-03")})

# ---- beat-04: "So here's a card up your hand to, you know, | feel confident."
back4 = w("beat-04", "feel") - .25
card(B("beat-04"), back4, "playcard", start=B("beat-04"), card=w("beat-04", "card"), up=w("beat-04", "up"))
leaks.append({"t": B("beat-04"), "dir": -1})
aroll(back4, E("beat-04"), 1.12)
leaks.append({"t": back4})
hero([r("feel", "sans", w("beat-04", "feel")), r("confident", "serif", w("beat-04", "confident"))], out=E("beat-04") - .05)

# ---- beat-05: "And that is by building a solid personal brand."
aroll(B("beat-05"), E("beat-05"), 1.0, push=.05)
hero([r("a solid", "sans", w("beat-05", "solid")), r("personal", "serif", w("beat-05", "personal")),
      r("brand", "italic", w("beat-05", "brand"), dx=70)], out=E("beat-05") - .05)

# ---- beat-06: "Social following which is respected by everyone that you show it to"
fo = [w("beat-06", "social"), w("beat-06", "following"), w("beat-06", "respected"), w("beat-06", "everyone")]
card(B("beat-06"), E("beat-06"), "toasts", bg="charcoal", start=B("beat-06"), at=fo, respected=w("beat-06", "respected"))
leaks.append({"t": B("beat-06")})

# ---- beat-07: "when you walk into a room, people already know | who you are, what you do and what your opinions are."
c7 = w("beat-07", "who") - .12
aroll(B("beat-07"), c7, 1.14)
leaks.append({"t": B("beat-07"), "dir": -1})
hero([r("walk into a", "sans", w("beat-07", "walk")), r("room", "serif", w("beat-07", "room"))], out=w("beat-07", "people") + .25)
card(c7, E("beat-07"), "three", start=c7, rows=[["WHO", "you are", w("beat-07", "who")], ["WHAT", "you do", w("beat-07", "what")],
                                                 ["YOUR", "opinions", w("beat-07", "your")]])
leaks.append({"t": c7})

# ---- beat-08: "But there's a catch." Tight punch-in.
aroll(B("beat-08"), E("beat-08"), 1.32, push=.03, faceY=.55)
leaks.append({"t": B("beat-08"), "dir": -1})
hero([r("there's a", "sans", w("beat-08", "there's")), r("catch", "serif", w("beat-08", "catch"))], out=E("beat-08") + .05, scale=1.1)

# ---- beat-09/10: "It only works if people see how you think with proof | on camera again and again, at least 7 times..."
c9 = w("beat-09", "on") - .05
aroll(B("beat-09"), c9, 1.0)
hero([r("how", "serif", w("beat-09", "how")), r("you", "sans", w("beat-09", "you")), r("think", "italic", w("beat-09", "think"), dx=50)],
     out=w("beat-09", "proof") + .2)
seven_at = w("beat-10", "7")
gap = max(.12, (seven_at - c9 - .1) / 7)
card(c9, E("beat-10"), "seven", bg="ember", start=c9, gap=round(gap, 3), seven=seven_at, research=w("beat-10", "research"))
leaks.append({"t": c9})

# ---- beat-11: "So when it works, three things can happen."
aroll(B("beat-11"), E("beat-11"), 1.12)
leaks.append({"t": B("beat-11"), "dir": -1})
hero([r("three", "serif", w("beat-11", "three")), r("things", "italic", w("beat-11", "things"), dx=40),
      r("can happen", "sans", w("beat-11", "can"), dx=-30)], out=E("beat-11") - .05)

# ---- beat-12: "A client comes to you saying I've been following you, | and you stop chasing."
c12 = w("beat-12", "and") - .05
card(B("beat-12"), c12, "dm", bg="charcoal", start=B("beat-12"), typing=w("beat-12", "comes"), message=w("beat-12", "i've"))
leaks.append({"t": B("beat-12")})
aroll(c12, E("beat-12"), 1.0)
leaks.append({"t": c12, "dir": -1})
hero([r("stop", "serif", w("beat-12", "stop")), r("chasing", "italic", w("beat-12", "chasing"), dx=50)], out=E("beat-12") - .05)

# ---- beat-13: "You can charge more and nobody asks you for a discount."
card(B("beat-13"), E("beat-13"), "price", bg="ember", start=B("beat-13"), charge=w("beat-13", "charge"), more=w("beat-13", "more"),
     chip=w("beat-13", "nobody"), strike=w("beat-13", "discount."))
leaks.append({"t": B("beat-13")})

# ---- beat-14: "You win deals even when you are not in the actual room and people pick you."
aroll(B("beat-14"), E("beat-14"), 1.15)
leaks.append({"t": B("beat-14"), "dir": -1})
hero([r("win", "serif", w("beat-14", "win")), r("deals", "italic", w("beat-14", "deals"), dx=40)], out=w("beat-14", "not"))
hero([r("people", "sans", w("beat-14", "people")), r("pick", "serif", w("beat-14", "pick")), r("you", "italic", w("beat-14", "you.", 0), dx=40)],
     out=E("beat-14") - .05)

# ---- beat-15: "If you want help to build a system that is raw and authentic that people recognize and respect."
aroll(B("beat-15"), E("beat-15"), 1.0, push=.05)
hero([r("raw", "serif", w("beat-15", "raw")), r("and", "sans", w("beat-15", "and")), r("authentic", "italic", w("beat-15", "authentic"))],
     out=w("beat-15", "people"))
hero([r("recognize &", "sans", w("beat-15", "recognize")), r("respect", "serif", w("beat-15", "respect."))], out=E("beat-15") - .05)

# ---- beat-16: "Comment the word attract and we'll set it up for you."
card(B("beat-16"), E("beat-16"), "comment", bg="ember", start=B("beat-16"), typeAt=w("beat-16", "attract"), typeDur=.45,
     send=w("beat-16", "set"))
leaks.append({"t": B("beat-16")})

# ---- beat-17: "only if you're doing at least twenty to thirty K a month."
aroll(B("beat-17"), E("beat-17") + .5, 1.12)
leaks.append({"t": B("beat-17"), "dir": -1})
hero([r("at least", "sans", w("beat-17", "at")), r("20–30K", "serif", w("beat-17", "20")), r("a month", "italic", w("beat-17", "month."), dx=40)],
     out=E("beat-17") + .5)

# ---- subtitles: 2-3 lowercase words, spoken spelling, numbers as digits -----------------------------------------
FIX = {"7": "7", "k": "k", "twenty": "20", "thirty": "30", "i've": "I've", "attract": "ATTRACT"}
flat = [(a, b, txt) for beat in plan for a, b, txt in WORDS[beat]]
subs, group = [], []


def flush(end):
    if group:
        text = " ".join(g[2] for g in group)
        text = re.sub(r"(\d+) k\b", r"\1k", text)
        subs.append({"in": round(group[0][0] - .04, 3), "out": round(end, 3), "text": text})
        group.clear()


for i, (a, b, txt) in enumerate(flat):
    clean = re.sub(r"[^\w'’\-]", "", txt)
    clean = FIX.get(clean.lower(), clean.lower())
    if clean == "k" and group:
        group[-1] = (group[-1][0], b, group[-1][2] + "k")
        continue
    group.append((a, b, clean))
    nxt = flat[i + 1][0] if i + 1 < len(flat) else b + .4
    end_phrase = bool(re.search(r"[.,?!]$", txt))
    if len(group) >= 3 or end_phrase or len(" ".join(g[2] for g in group)) > 14:
        flush(min(nxt - .04, b + .6) if end_phrase else nxt - .04)
flush(TOTAL)

save("timeline.json", {"headline": "Here's how to walk into any room with confidence", "accent": [232, 119, 90],
                       "shots": shots, "heroes": heroes, "subs": subs, "leaks": leaks})
print(len(shots), "shots,", len(heroes), "hero stacks,", len(subs), "subtitles,", len(leaks), "leaks, total", TOTAL)
