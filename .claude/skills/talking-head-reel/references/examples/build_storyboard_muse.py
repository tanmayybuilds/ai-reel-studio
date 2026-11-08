"""Round 1 storyboard for the Muse reel. Keeps the timing cut_audio.py wrote; sets everything the user reviews.
Word times are beat seconds from analysis/speech-evidence (re-cut on real pauses; Whisper word times drift up to ~0.3 s).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
board = json.loads((ROOT / "storyboard.json").read_text(encoding="utf8"))
timing = {b["id"]: b for b in board["beats"]}
W = lambda *pairs: [list(p) for p in pairs]
STEPS = ["Chrome", "Location", "Website", "Login", "Code"]
I = lambda a, b: {"in": a, "out": b}

beats = [
  dict(id="beat-01", title="Hook: tokens ki tension?", scene="aroll",
       spoken="To abhi bhi bhai tokens ki tension le rahe ho?",
       camera=[[0, 0.74, 0], [1.16, 0.92, 0.2]], faceY=560, noBlur=True,
       cameraNote="Pehle frame se glass field mein line type hoti hai (approved Handy hook). \"Tension\" pe tez punch-in.",
       graphics=[["To abhi bhi bhai tokens ki", "Glass text field + mini keyboard, asli keys cyan glow ke saath dabti hain (yahi caption hai)"],
                 ["tension", "Bada red TENSION, frame halka shake"]],
       assets=[],
       overlays=[
         dict(type="typer", **I(0, 1.12), y=980, text="To abhi bhi bhai tokens ki", typeAt=0.04, step=0.03),
         dict(type="cap", **I(1.1, 2.12), y=1040, word="TENSION", wordAt=1.16, tone="red",
              tail=W(("le", 1.46), ("rahe", 1.55), ("ho?", 1.66)))]),

  dict(id="beat-02", title="Reveal: Meta ka naya AI, Muse", scene="white",
       spoken="Bhai, Meta ne apna naya AI launch kar diya, jiska naam hai Muse AI.",
       camera=[[0, 0.7, 0], [0, 0.7, 0]], noBlur=True,
       cameraNote="Poora white board (approved repo-card reveal). Asli muse.ai hero card slot mein rise, \"Muse AI\" pe hand tap + bada cyan MUSE AI.",
       graphics=[["launch kar diya", "Bada cyan LAUNCH"],
                 ["naya AI", "Asli muse.ai hero (Muse logo + \"Muse, AI that books reservations\") slot mein rise"],
                 ["Muse AI", "Bada cyan MUSE AI, hand naam pe tap"]],
       assets=[{"label": "muse.ai hero, Recording 183811 @ 0:00", "file": "assets/hero.jpg"}],
       overlays=[
         dict(type="white", **I(0, 3.52)),
         dict(type="cap", **I(0.04, 2.0), ink=True, y=210, lead=W(("Bhai,", 0.06), ("Meta", 0.21), ("ne", 0.51), ("apna", 0.63), ("naya", 0.87), ("AI", 1.05)),
              word="LAUNCH", wordAt=1.23, tone="cyan", tail=W(("kar", 1.53), ("diya,", 1.59))),
         dict(type="cap", **I(2.0, 3.52), ink=True, y=210, lead=W(("jiska", 2.04), ("naam", 2.39), ("hai", 2.64)), word="MUSE AI", wordAt=2.74, tone="cyan", oneLine=True),
         dict(type="slotCard", **I(0.95, 3.52), src="assets/hero.jpg", x=70, y=760, w=940, h=356),
         dict(type="hand", **I(2.2, 3.52), **{"from": [990, 1720]}, to=[560, 1000], tap=2.74)]),

  dict(id="beat-03", title="10, 20, aadhe ghante ke lambe videos", scene="aroll",
       spoken="Isse aap das minute, bees minute, yahan tak ki aadhe-aadhe ghante se lambe video generate karwa sakte ho.",
       camera=[[0, 0.64, 0], [2.94, 0.7, 0.2], [4.34, 0.8, 0.22]], faceY=480,
       cameraNote="Chehra upar, neeche timeline. \"Aadhe ghante\" pe halka zoom, \"lambe video\" pe punch-in.",
       graphics=[["das minute / bees minute", "Tiles pop: 10 minute, 20 minute (har number bolte hi)"],
                 ["aadhe-aadhe ghante", "Hot cyan tile + NEW video-editor timeline: film frames bharte hain, clock 00:00 se 30:00+ tak"],
                 ["lambe video", "Bada cyan LAMBE VIDEO"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.03, 3.9), y=690, lead=W(("Isse", 0.05), ("aap", 0.38), ("yahan tak ki", 2.26))),
         dict(type="tiles", **I(0.7, 3.9), y=800, items=[{"text": "10 minute", "at": 0.76, "small": True}, {"text": "20 minute", "at": 1.68, "small": True},
              {"text": "aadhe-aadhe ghante", "at": 2.94, "row": 1, "hot": True, "small": True}]),
         dict(type="timeline", **I(0.6, 6.2), y=1150, title="AI video", runAt=0.7, dur=2.9, toMin=30, marks=["0", "10m", "20m", "30m+"]),
         dict(type="cap", **I(3.9, 6.2), y=760, lead=W(("se", 3.98)), word="LAMBE VIDEO", wordAt=4.34, tone="cyan", oneLine=True,
              tail=W(("generate", 4.96), ("karwa", 5.46), ("sakte", 5.81), ("ho.", 6.01)))]),

  dict(id="beat-04", title="Ek bahut badi khaasiyat", scene="aroll",
       spoken="Aur iski ek bahut hi badi khaasiyat",
       camera=[[0, 0.72, 0], [0.05, 0.92, 2.0]],
       cameraNote="Tension wali line: poore clip mein slow push-in (approved). Saans lene wala plain beat, do bade beats ke beech.",
       graphics=[["khaasiyat", "Bada cyan KHAASIYAT"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.04, 2.12), y=1080, lead=W(("Aur", 0.08), ("iski", 0.17), ("ek", 0.42), ("bahut hi", 0.59), ("badi", 1.08)),
              word="KHAASIYAT", wordAt=1.47, tone="cyan")]),

  dict(id="beat-05", title="1 billion tokens, bilkul free", scene="aroll",
       spoken="ki is mein aapko 1 billion tokens bilkul free milenge.",
       camera=[[0, 0.66, 0], [1.0, 0.72, 0.25]], faceY=470,
       cameraNote="Wide, chehra upar taaki meter ko jagah mile. \"1 billion\" pe halka zoom.",
       graphics=[["1 billion tokens", "NEW billion-token meter: glass card, odometer digits 0 se 1,000,000,000 tak roll, cyan token coins orbit"],
                 ["free", "Green FREE stamp meter pe slam"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.03, 3.16), y=700, lead=W(("ki", 0.05), ("is", 0.1), ("mein", 0.31), ("aapko", 0.46))),
         dict(type="tokenMeter", **I(0.9, 3.16), y=990, value=1000000000, countAt=1.0, dur=0.9, label="Muse tokens", unit="TOKENS", freeAt=2.4, stamp="FREE"),
         dict(type="cap", **I(1.9, 3.16), y=1420, lead=W(("bilkul", 2.04), ("free", 2.4), ("milenge.", 2.64)))]),

  dict(id="beat-06", title="Jaanna chahte ho kaise?", scene="aroll",
       spoken="Jaanna chahte ho kaise?",
       camera=[[0, 0.82, 0], [0.95, 0.98, 0.18]],
       cameraNote="Tight, \"kaise\" pe aur andar. Upar how-to rail pehli baar aata hai.",
       graphics=[["kaise", "Bada cyan KAISE? + NEW how-to step rail upar slide: Chrome, Location, Website, Login, Code"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.04, 1.36), y=1060, lead=W(("Jaanna", 0.07), ("chahte", 0.5), ("ho", 0.87)), word="KAISE?", wordAt=0.99, tone="cyan"),
         dict(type="stepRail", **I(0.95, 1.36), y=200, steps=STEPS, active=-1)]),

  dict(id="beat-07", title="Step 1: laptop, Chrome extension", scene="aroll",
       spoken="Kuch nahi, bas aapko apne laptop pe aa jaana hai, aapko Chrome pe jaakar ye ek extension download kar lena hai.",
       camera=[[0, 0.64, 0], [1.01, 0.7, 0.2], [3.04, 0.78, 0.22]], faceY=470,
       cameraNote="Chehra upar. \"Laptop\" pe zoom + laptop check, \"extension\" pe punch-in + tiles.",
       graphics=[["laptop pe", "Bada cyan LAPTOP + laptop scan, green check (approved)"],
                 ["Chrome pe", "Step rail: Chrome lit; tile Chrome pop"],
                 ["extension download", "Bada cyan EXTENSION + asli Chrome Web Store card (Free VPN for Chrome - VPN Proxy VeePN, 4.4 star, 15,000,000 users) tilt ke saath rise, hand tap"]],
       assets=[{"label": "Chrome Web Store: VeePN (your screenshot)", "file": "assets/veepn-store.jpg"}],
       overlays=[
         dict(type="stepRail", **I(0, 4.68), y=200, steps=STEPS, active=0, activeAt=2.26, enter=False),
         dict(type="cap", **I(0.03, 2.0), y=1000, lead=W(("Kuch nahi,", 0.03), ("bas", 0.24), ("aapko", 0.49), ("apne", 0.75)), word="LAPTOP", wordAt=1.01, tone="cyan",
              tail=W(("pe", 1.3), ("aa", 1.56), ("jaana", 1.7), ("hai,", 1.99))),
         dict(type="verify", **I(0.95, 2.0), y=1310, doneAt=1.8),
         dict(type="cap", **I(2.0, 4.68), y=1000, lead=W(("aapko", 2.0), ("Chrome", 2.26), ("pe", 2.42), ("jaakar", 2.55), ("ye", 2.78), ("ek", 2.91)),
              word="EXTENSION", wordAt=3.04, tone="cyan", tail=W(("download", 3.46), ("kar", 3.85), ("lena", 3.92), ("hai.", 4.13))),
         dict(type="appWindow", **I(2.95, 4.68), src="assets/veepn-store.jpg", x=70, y=1330, w=940),
         dict(type="hand", **I(3.2, 4.68), **{"from": [1000, 1760]}, to=[240, 1420], tap=3.5)]),

  dict(id="beat-08", title="Step 2-3: location, website khol lo", scene="aroll",
       spoken="Phir is extension ke upar mein ye location daal ke, aapko ye website khol leni hai.",
       camera=[[0, 0.68, 0], [2.0, 0.74, 0.2], [3.1, 0.62, 0]], faceY=430, blurAt=[3.1],
       cameraNote="Pehle chehra upar, neeche asli VeePN popup; phir cut pe wide: glowing browser muse.ai type karke asli page load karta hai.",
       graphics=[["is extension ke upar", "Asli VeePN popup rise (power button, Connection is OFF)"],
                 ["location", "Bada cyan LOCATION, hand location row (United States, Oregon) pe tap; rail step 2 lit"],
                 ["ye website", "Glowing browser (approved) muse.ai type karta hai, asli landing page load + shine + scroll; rail step 3 lit"]],
       assets=[{"label": "VeePN popup, location row (your screenshot; IP row cropped out)", "file": "assets/veepn-popup.jpg"},
               {"label": "muse.ai landing page, stitched from Recording 183811", "file": "assets/page.jpg"}],
       overlays=[
         dict(type="stepRail", **I(0, 3.1), y=200, steps=STEPS, active=1, activeAt=2.0, enter=False),
         dict(type="panel", **I(0.4, 3.1), src="assets/veepn-popup.jpg", x=220, y=980, w=640),
         dict(type="hand", **I(1.5, 3.1), **{"from": [1000, 1760]}, to=[470, 1420], tap=2.0),
         dict(type="cap", **I(0.04, 3.1), y=640, lead=W(("Phir", 0.11), ("is", 0.26), ("extension", 0.49), ("ke", 1.18), ("upar", 1.35), ("mein", 1.64), ("ye", 1.79)),
              word="LOCATION", wordAt=2.0, tone="cyan", tail=W(("daal", 2.51), ("ke,", 2.7))),
         dict(type="stepRail", **I(3.1, 5.2), y=200, steps=STEPS, active=2, activeAt=3.6, enter=False),
         dict(type="browser", **I(3.1, 5.2), x=50, y=760, w=980, h=600, url="muse.ai", typeAt=3.25, loadAt=3.75, src="assets/page.jpg", **{"from": 0, "to": 260}),
         dict(type="cap", **I(3.1, 5.2), y=1410, lead=W(("aapko", 3.12), ("ye", 3.57), ("website", 3.68), ("khol", 4.43), ("leni", 4.68), ("hai.", 4.9)))]),

  dict(id="beat-09", title="Step 4: fatafat login", scene="aroll",
       spoken="Aapko fatafat apna account login karna hai.",
       camera=[[0, 0.68, 0], [1.21, 0.76, 0.2]], faceY=460,
       cameraNote="Chehra upar, neeche asli Muse login card tilt ke saath rise. \"Account login\" pe halka zoom.",
       graphics=[["account login", "Bada cyan ACCOUNT LOGIN + asli muse.ai login card (Log in or create an account, Continue); rail step 4 lit"]],
       assets=[{"label": "Login box, Recording 183811 @ 0:00", "file": "assets/login.jpg"}],
       overlays=[
         dict(type="stepRail", **I(0, 2.52), y=200, steps=STEPS, active=3, activeAt=1.21, enter=False),
         dict(type="cap", **I(0.04, 2.52), y=680, lead=W(("Aapko", 0.08), ("fatafat", 0.32), ("apna", 0.9)), word="ACCOUNT LOGIN", wordAt=1.21, tone="cyan",
              tail=W(("karna", 2.04), ("hai.", 2.2))),
         dict(type="appWindow", **I(1.15, 2.52), src="assets/login.jpg", x=140, y=1110, w=800)]),

  dict(id="beat-10", title="Step 5: referral code", scene="aroll",
       spoken="Aur referral mein ye code daalna hai.",
       camera=[[0, 0.8, 0], [0.93, 0.9, 0.18]], faceY=450,
       cameraNote="Tight, \"code\" pe punch-in. Neeche code flap board.",
       graphics=[["code", "Bada cyan CODE + NEW split-flap referral field: letters airport board ki tarah palat ke asli code QZM84E pe rukte hain, hand Redeem dabata hai; rail step 5 lit"]],
       assets=[{"label": "Invite card with code, Recording 184408 @ 0:01", "file": "assets/invite.jpg"}],
       overlays=[
         dict(type="stepRail", **I(0, 1.8), y=200, steps=STEPS, active=4, activeAt=0.93, enter=False),
         dict(type="cap", **I(0.04, 1.8), y=640, lead=W(("Aur", 0.08), ("referral", 0.2), ("mein", 0.57), ("ye", 0.72)), word="CODE", wordAt=0.93, tone="cyan",
              tail=W(("daalna", 1.19), ("hai.", 1.45))),
         dict(type="codeFlap", **I(0.5, 1.8), y=1000, code="QZM84E", flapAt=0.75, step=0.07, button="Redeem", pressAt=1.55, label="Referral code"),
         dict(type="hand", **I(1.15, 1.8), **{"from": [1000, 1760]}, to=[600, 1390], tap=1.55)]),

  dict(id="beat-11", title="Seconds mein 1 billion tokens", scene="aroll",
       spoken="Aur kuch hi seconds mein aapke account mein 1 billion tokens aa jaayenge.",
       camera=[[0, 0.72, 0], [2.0, 0.86, 0.22]], faceY=470,
       cameraNote="Chehra upar, neeche asli Settings > Usage card. \"1 billion\" pe punch-in.",
       graphics=[["aapke account mein", "Asli Muse Settings card rise: Additional tokens, 0% used (1B tokens left), Never expires"],
                 ["1 billion", "Bada green 1 BILLION"]],
       assets=[{"label": "Settings > Usage, Recording 184317 @ 0:44", "file": "assets/tokens.jpg"}],
       overlays=[
         dict(type="cap", **I(0.03, 1.95), y=690, lead=W(("Aur", 0.07), ("kuch hi", 0.2), ("seconds", 0.6), ("mein", 1.15), ("aapke", 1.35), ("account", 1.55), ("mein", 1.79))),
         dict(type="panel", **I(1.45, 3.96), src="assets/tokens.jpg", x=90, y=1130, w=900),
         dict(type="cap", **I(1.95, 3.96), y=700, word="1 BILLION", wordAt=2.0, tone="green", oneLine=True, tail=W(("tokens", 2.7), ("aa", 3.1), ("jaayenge.", 3.25)))]),

  dict(id="beat-12", title="Automate, editing, generation", scene="aroll",
       spoken="Aap chahe aap isse automate tasks karao, ya video editing karao, video generation karao,",
       camera=[[0, 0.62, 0], [1.6, 0.66, 0.2], [4.38, 0.72, 0.2]], faceY=460,
       cameraNote="Wide, tiles ko jagah; har item pe framing thoda badalta hai.",
       graphics=[["automate tasks", "Tile pop: Automate tasks karao"],
                 ["video editing", "Tile pop: ya Video editing karao"],
                 ["video generation", "Hot cyan tile: Video generation karao"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.03, 5.72), y=690, lead=W(("Aap", 0.04), ("chahe", 0.32), ("aap", 0.63), ("isse", 0.98))),
         dict(type="tiles", **I(1.5, 5.72), y=900, items=[{"text": "Automate tasks karao", "at": 1.6, "small": True},
              {"text": "ya Video editing karao", "at": 2.87, "row": 1, "small": True},
              {"text": "Video generation karao", "at": 4.38, "row": 2, "hot": True, "small": True}])]),

  dict(id="beat-13", title="Ek saal aaram se, bilkul free", scene="aroll",
       spoken="Ye ek saal tak aapke bilkul aaram se chalenge, aur ye bilkul free mein mil raha hai.",
       camera=[[0, 0.7, 0], [1.77, 0.8, 0.22], [3.95, 0.74, 0.2]], faceY=470,
       cameraNote="\"Aaram se\" pe punch-in, \"free\" pe thoda wapas, do stat cards.",
       graphics=[["ek saal", "Stat card (approved duo): 1 SAAL, aaram se"],
                 ["aaram se", "Bada cyan AARAM SE"],
                 ["free", "Doosra green card: ₹0, free mein + bada green FREE"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.04, 2.95), y=680, lead=W(("Ye", 0.11), ("ek", 0.21), ("saal", 0.42), ("tak", 0.57), ("aapke", 0.78), ("bilkul", 1.25)),
              word="AARAM SE", wordAt=1.77, tone="cyan", tail=W(("chalenge,", 2.18))),
         dict(type="duo", **I(0.35, 5.04), y=1150, items=[{"at": 0.42, "tone": "cyan", "big": "1 SAAL", "label": "aaram se"},
              {"at": 3.95, "tone": "green", "big": "₹0", "label": "free mein"}]),
         dict(type="cap", **I(2.95, 5.04), y=680, lead=W(("aur", 3.0), ("ye", 3.2), ("bilkul", 3.4)), word="FREE", wordAt=3.95, tone="green",
              tail=W(("mein", 4.25), ("mil", 4.44), ("raha", 4.55), ("hai.", 4.8)))]),

  dict(id="beat-14", title="CTA: offer kab tak? Jaldi redeem", scene="aroll",
       spoken="Pata nahi ye Meta offer kab tak rakhne wala hai, jaldi fatafat redeem kar lo.",
       camera=[[0, 0.66, 0], [0.96, 0.72, 0.3], [2.05, 0.84, 0.2]], faceY=470,
       cameraNote="\"Kab tak\" pe countdown, \"jaldi\" pe punch-in. \"Redeem\" pe white end card (yahan tum camera band karne uthte ho, isliye board usko dhakta hai).",
       graphics=[["kab tak", "NEW offer countdown: digits scramble (koi nahi jaanta kab khatam), red rim pulse"],
                 ["jaldi fatafat", "Bada white JALDI FATAFAT"],
                 ["redeem kar lo", "White end card: bada red REDEEM KAR LO slam + code flap QZM84E fast palat ke rukta hai, hand Redeem dabata hai"]],
       assets=[],
       overlays=[
         dict(type="cap", **I(0.03, 2.05), y=680, lead=W(("Pata", 0.07), ("nahi", 0.2), ("ye", 0.32), ("Meta", 0.48), ("offer", 0.72), ("kab", 0.96), ("tak", 1.12),
              ("rakhne", 1.28), ("wala", 1.6), ("hai,", 1.76))),
         dict(type="offerTimer", **I(0.9, 2.05), y=1060, title="Offer kab tak?", tag="?", tagAt=1.2),
         dict(type="cap", **I(2.05, 2.95), y=1000, word="JALDI FATAFAT", wordAt=2.09, tone="white", oneLine=True),
         dict(type="white", **I(2.95, 3.64)),
         dict(type="cap", **I(2.95, 3.64), ink=True, y=600, word="REDEEM KAR LO", wordAt=2.99, tone="red", oneLine=True),
         dict(type="codeFlap", **I(2.95, 3.64), y=860, code="QZM84E", flapAt=2.97, step=0.035, button="Redeem", pressAt=3.38, label="Referral code"),
         dict(type="hand", **I(3.0, 3.64), **{"from": [1010, 1760]}, to=[600, 1250], tap=3.38)]),
]

# ---- Round 2: the cut was tightened (scripts/tighten.py). Times above are written against the round-1 cut
# (analysis/edit-plan-r1.json); remap every time onto the new segments so each graphic still lands on its word.
R1 = {b["id"]: b["segments"] for b in json.loads((ROOT / "analysis" / "edit-plan-r1.json").read_text(encoding="utf8"))["beats"]}
TIME_KEYS = {"in", "out", "wordAt", "typeAt", "loadAt", "countAt", "freeAt", "flapAt", "pressAt", "tap", "runAt", "activeAt",
             "tagAt", "doneAt", "bottomAt", "strikeAt", "sendAt", "dmAt"}


def remap(bid, t):
    old, new = R1[bid], timing[bid]["segments"]
    cum, vo = 0.0, None
    for a, z in old:
        if t <= cum + (z - a):
            vo = a + (t - cum); break
        cum += z - a
    if vo is None:
        vo = old[-1][1] + (t - cum)
    cum = 0.0
    for a, z in new:
        if vo < a:
            return round(cum, 3)            # inside a removed pause: snap to the join
        if vo <= z:
            return round(cum + vo - a, 3)
        cum += z - a
    return round(cum, 3)


def remap_beat(beat):
    bid, dur = beat["id"], timing[beat["id"]]["duration"]
    beat["camera"] = [[remap(bid, k[0]), *k[1:]] for k in beat["camera"]]
    if "blurAt" in beat:
        beat["blurAt"] = [remap(bid, x) for x in beat["blurAt"]]
    for o in beat["overlays"]:
        for k in TIME_KEYS & o.keys():
            o[k] = dur if (k == "out" and o[k] >= R1_DUR[bid] - .05) else min(remap(bid, o[k]), dur)
        for k in ("lead", "tail", "words"):
            if k in o:
                o[k] = [[w, remap(bid, t)] for w, t in o[k]]
        for item in o.get("items", []):
            item["at"] = remap(bid, item["at"])


R1_DUR = {bid: round(sum(z - a for a, z in segs), 3) for bid, segs in R1.items()}
for beat in beats:
    remap_beat(beat)

for beat in beats:
    beat.update({k: timing[beat["id"]][k] for k in ("start", "end", "duration", "segments", "frames", "syncOffset") if k in timing[beat["id"]]})
board.update(
    title="Muse AI: 1 billion free tokens",
    styleLine="Same house style as the approved Handy reel, new accent: electric cyan (not indigo, not amber). Real room lightly blurred. Preview 720p; final 1080x1920 with layered sound effects.",
    note="Dialogue from your voiceover, synced to the camera at +1.031 s (6 ms drift). Take map in analysis/take-map.md.",
    video="media/rough-cut-sfx.mp4", beats=beats)
(ROOT / "storyboard.json").write_text(json.dumps(board, indent=2, ensure_ascii=False), encoding="utf8")
print(len(beats), "beats,", board["duration"], "s")
