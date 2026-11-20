"""Download the free local models this skill uses into Tools/models (about 275 MB: voice, depth, upscaler), verified by SHA-256,
and install kokoro-onnx into the vision venv. Safe to re-run: files already present and verified are skipped.

  <venv python> .claude/skills/property-tour-reel/scripts/install_models.py [--no-depth] [--no-voice]
"""
import argparse, hashlib, subprocess, sys, urllib.request
from pathlib import Path

STUDIO = next(p for p in [Path.cwd(), *Path(__file__).resolve().parents] if (p / "Tools").is_dir() and (p / "Raw").is_dir())
MODELS = STUDIO / "Tools" / "models"
FILES = {
    "voice": [
        ("kokoro/kokoro-v1.0.int8.onnx", "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
         "6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb"),
        ("kokoro/voices-v1.0.bin", "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
         "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
    ],
    "upscale": [
        ("upscale/swin2sr-realworld-x4.onnx", "https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model.onnx",
         "f496dc73dcc01d778b1a12eb4c4038d6b27cd1c0b5bcd4258455ed6d7816c835"),
    ],
    "depth": [
        ("depth/depth-anything-v2-small.onnx", "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
         "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c"),
    ],
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(rel, url, digest):
    dst = MODELS / rel
    if dst.exists() and sha256(dst) == digest:
        print("ok      ", rel)
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_suffix(dst.suffix + ".part")
    for attempt in range(5):
        try:
            have = part.stat().st_size if part.exists() else 0
            req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
            with urllib.request.urlopen(req, timeout=60) as r, open(part, "ab" if have and r.status == 206 else "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            break
        except Exception as e:  # resume on dropped connections
            print("  retrying after:", e)
    if sha256(part) != digest:
        part.unlink(missing_ok=True)
        raise SystemExit(f"{rel}: checksum mismatch, download discarded")
    part.replace(dst)
    print("download", rel)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-depth", action="store_true")
    ap.add_argument("--no-voice", action="store_true")
    a = ap.parse_args()
    if not a.no_voice:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "kokoro-onnx", "soundfile"], check=True)
        for f in FILES["voice"]:
            fetch(*f)
    if not a.no_depth:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "onnxruntime"], check=True)
        for f in FILES["depth"] + FILES["upscale"]:
            fetch(*f)
    print("models ready in", MODELS)


if __name__ == "__main__":
    main()
