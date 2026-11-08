"""Settings shared by every script: project.json in the Edit folder, plus the studio's tool paths."""
import json, subprocess, sys
from pathlib import Path

EDIT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((EDIT / "project.json").read_text(encoding="utf-8-sig"))
STUDIO = Path(CONFIG["studio"])
sys.path.insert(0, str(STUDIO / ".claude" / "skills" / "talking-head-reel" / "scripts"))
from studio_paths import whisper_cli  # noqa: E402  (finds whisper-cli on Windows, macOS and Linux)

WHISPER = whisper_cli(STUDIO)
MODEL = STUDIO / "Tools" / "models" / CONFIG.get("whisperModel", "ggml-small-q5_1.bin")
FPS = CONFIG["fps"]
ANALYSIS = EDIT / "analysis"
MEDIA = EDIT / "media"


def resolve(value):
    """Paths in project.json are relative to the Edit folder unless absolute."""
    return None if value is None else (EDIT / value).resolve()


def save_config():
    (EDIT / "project.json").write_text(json.dumps(CONFIG, indent=2, ensure_ascii=False), encoding="utf8")


def load(name):
    return json.loads((EDIT / name).read_text(encoding="utf8"))


def save(name, value):
    (EDIT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf8")


def dialogue_wav():
    """Full-rate dialogue: the separate voiceover when there is one, otherwise the camera audio."""
    return ANALYSIS / ("vo-full.wav" if CONFIG.get("voiceover") else "cam-full.wav")


def run(*args):
    subprocess.run([str(a) for a in args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def concat_scenes():
    """Join the rendered beat scenes, in storyboard order, into media/rough-cut.mp4."""
    beats = load("storyboard.json")["beats"]
    scenes = [MEDIA / f"{b['id']}-scene.mp4" for b in beats]
    missing = [s.name for s in scenes if not s.exists()]
    if missing:
        print("rough cut skipped, scenes missing:", ", ".join(missing))
        return None
    listing = MEDIA / "concat.txt"
    listing.write_text("".join(f"file '{s.as_posix()}'\n" for s in scenes), encoding="utf8")
    out = MEDIA / "rough-cut.mp4"
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", "-movflags", "+faststart", out)
    return out
