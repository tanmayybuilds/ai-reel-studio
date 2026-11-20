"""Shared settings and helpers for a property tour project (the folder holding project.json)."""
import hashlib, json, subprocess, sys
from pathlib import Path

PROJ = Path(__file__).resolve().parents[1]
CONFIG = json.loads((PROJ / "project.json").read_text(encoding="utf-8-sig"))
STUDIO = Path(CONFIG["studio"])
MEDIA = PROJ / "media"
ANALYSIS = PROJ / "analysis"
MODELS = STUDIO / "Tools" / "models"
FPS = CONFIG.get("fps", 30)
TRANSITION_TYPES = {"fade", "whip", "zoom", "warp", "leak", "slide", "flash", "lens", "mirror", "spin"}


def load(name, default=None):
    f = PROJ / name
    if not f.exists():
        if default is not None:
            return default
        raise SystemExit(f"{name} is missing in {PROJ}")
    return json.loads(f.read_text(encoding="utf-8-sig"))


def save(name, value, keep_history=False):
    f = PROJ / name
    if keep_history and f.exists():
        import datetime
        (PROJ / "history").mkdir(exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        (PROJ / "history" / f"{f.stem}-{stamp}{f.suffix}").write_bytes(f.read_bytes())
    tmp = f.with_suffix(f.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf8")
    tmp.replace(f)


def save_config():
    save("project.json", CONFIG)


def tr_dur(shot):
    tr = shot.get("transition") or {}
    if tr.get("type") not in TRANSITION_TYPES:
        return 0.0
    return float(tr.get("dur", 0.5))


def timeline(tour):
    """Same maths as engine.js buildTimeline: shots run back to back; a transition is centred on the cut."""
    segs, t = [], 0.0
    for i, s in enumerate(tour["shots"]):
        segs.append({"i": i, "shot": s, "start": t, "end": t + s["dur"]})
        t += s["dur"]
    for i, g in enumerate(segs):
        g["tin"] = tr_dur(segs[i - 1]["shot"]) if i else 0.0
        g["tout"] = tr_dur(g["shot"]) if i < len(segs) - 1 else 0.0
    return segs, t


def tour_hash(tour):
    return hashlib.sha1(json.dumps(tour, sort_keys=True).encode()).hexdigest()[:12]


def run(*args, quiet=True):
    subprocess.run([str(a) for a in args], check=True,
                   stdout=subprocess.DEVNULL if quiet else None, stderr=subprocess.DEVNULL if quiet else None)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "stream=codec_type,width,height,r_frame_rate,color_transfer,duration:stream_side_data=rotation:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True).stdout
    return json.loads(out or "{}")


def audio_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


def log(*a):
    print(*a, flush=True)
    sys.stdout.flush()
