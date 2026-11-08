"""Check that every tool the reel workflow needs is installed. Run it from the studio folder with any Python 3.

Usage: python .claude/skills/talking-head-reel/scripts/check_setup.py [--install-venv] [--json]
--install-venv  creates Tools/vision-venv from setup/requirements.txt (needs internet, about 600 MB).
--json          prints a machine-readable report as well.
Exit code 0 means ready; 1 means something is missing (each line says how to fix it).
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from studio_paths import MAC, WINDOWS, chrome, model, studio_root, venv_python, whisper_cli  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--install-venv", action="store_true")
ap.add_argument("--json", action="store_true")
args = ap.parse_args()

studio = studio_root() or Path.cwd()
tools = studio / "Tools"
venv = venv_python(studio)
requirements = studio / "setup" / "requirements.txt"

if args.install_venv and not venv.exists():
    subprocess.run([sys.executable, "-m", "venv", str(tools / "vision-venv")], check=True)
    subprocess.run([str(venv), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", str(requirements)], check=True)


def version(cmd, pattern=r"(\d+\.\d+(?:\.\d+)?)"):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        m = re.search(pattern, out.stdout + out.stderr)
        return m.group(1) if m else "?"
    except (OSError, subprocess.TimeoutExpired):
        return None


def at_least(v, minimum):
    try:
        return tuple(int(x) for x in v.split(".")[:2]) >= minimum
    except (AttributeError, ValueError):
        return False


hint = "winget install " if WINDOWS else "brew install " if MAC else "sudo apt install "
ffmpeg_v = version(["ffmpeg", "-version"], r"ffmpeg version n?(\d+\.\d+)") if shutil.which("ffmpeg") else None
node_v = version(["node", "--version"], r"v(\d+\.\d+)") if shutil.which("node") else None
whisper = whisper_cli(studio)
browser = chrome(studio)

checks = [
    (f"ffmpeg {ffmpeg_v or ''} (5.1 or newer)", at_least(ffmpeg_v, (5, 1)), hint + ("Gyan.FFmpeg" if WINDOWS else "ffmpeg")),
    ("ffprobe", shutil.which("ffprobe") is not None, "comes with FFmpeg"),
    (f"node {node_v or ''} (20.19 or newer)", at_least(node_v, (20, 19)), hint + ("OpenJS.NodeJS.LTS" if WINDOWS else "node")),
    (f"whisper-cli ({whisper})", Path(whisper).exists(), "run the setup installer (setup/install.ps1 or setup/install.sh)"),
    ("whisper model ggml-small-q5_1.bin", model(studio).exists(), "run the setup installer, or see setup/INSTALL.md"),
    ("whisper VAD model ggml-silero-v6.2.0.bin", model(studio, "ggml-silero-v6.2.0.bin").exists(), "run the setup installer"),
    ("puppeteer-core (Tools/node_modules)", (tools / "node_modules" / "puppeteer-core").exists(), "cd Tools; npm ci"),
    (f"Chrome ({browser})", browser is not None, "install Google Chrome, or let the installer fetch Chrome for Testing"),
    ("yt-dlp", any((tools / "bin" / n).exists() for n in ("yt-dlp.exe", "yt-dlp")) or shutil.which("yt-dlp") is not None, "run the setup installer"),
    ("vision venv", venv.exists(), "rerun with --install-venv"),
]
if venv.exists():
    probe = subprocess.run([str(venv), "-c", "import numpy, cv2, mediapipe, PIL, scipy; print(numpy.__version__, cv2.__version__, mediapipe.__version__, scipy.__version__)"],
                           capture_output=True, text=True)
    checks.append(("vision packages " + probe.stdout.strip(), probe.returncode == 0, f"{venv} -m pip install -r setup/requirements.txt"))
checks.append(("studio profile (studio.json)", (studio / "studio.json").exists(), "finish the first-run interview in AGENTS.md"))
checks.append(("brand kit (Brand Kit/brand-kit.md)", (studio / "Brand Kit" / "brand-kit.md").exists(), "finish the first-run interview in AGENTS.md"))

ok = True
for name, passed, fix in checks:
    print(("ok      " if passed else "MISSING ") + name + ("" if passed else f"  ->  {fix}"))
    ok &= bool(passed)
print("ready" if ok else "fix the missing items first")
if args.json:
    print(json.dumps([{"check": n, "ok": bool(p), "fix": f} for n, p, f in checks], indent=2))
sys.exit(0 if ok else 1)
