"""Start a new edit: copy the template into Raw/<Video>/Edit and write project.json.

Usage, from the studio folder:
  python .claude/skills/talking-head-reel/scripts/new_project.py "Raw/<Video>" [--title "My Reel"]
      [--source FILE] [--voiceover FILE|none] [--edit-dir DIR] [--port N]

Never overwrites: if Raw/<Video>/Edit already has files, it uses Edit-v2, Edit-v3 and so on.
"""
import argparse, json, re, shutil, socket, subprocess
from pathlib import Path

from studio_paths import WINDOWS, chrome, venv_python

SKILL = Path(__file__).resolve().parents[1]
VIDEO_EXT = {".mov", ".mp4", ".mxf", ".mkv", ".m4v", ".avi"}
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".mpeg", ".mpg", ".mp4"}


def studio_profile(studio):
    """Defaults chosen in the first-run interview (studio.json), so every project starts in the house style."""
    f = studio / "studio.json"
    return json.loads(f.read_text(encoding="utf-8-sig")) if f.exists() else {}


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,r_frame_rate,width,height:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True).stdout
    return json.loads(out or "{}")


def has_video(info):
    return any(s.get("codec_type") == "video" and s.get("width") for s in info.get("streams", []))


def has_audio(info):
    return any(s.get("codec_type") == "audio" for s in info.get("streams", []))


def free_port(start):
    for port in range(start, start + 50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)):
                return port
    raise SystemExit("no free port found")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video_dir")
    ap.add_argument("--title")
    ap.add_argument("--source")
    ap.add_argument("--voiceover", help="audio file with the clean dialogue, or 'none' to use the camera audio")
    ap.add_argument("--edit-dir")
    ap.add_argument("--port", type=int)
    args = ap.parse_args()

    video_dir = Path(args.video_dir).resolve()
    if not video_dir.is_dir():
        raise SystemExit(f"{video_dir} is not a folder")
    studio = next((p for p in [Path.cwd(), *video_dir.parents] if (p / "Tools").is_dir() and (p / "Raw").is_dir()), None)
    if studio is None:
        raise SystemExit("run this from the studio folder (the one with Tools and Raw)")

    files = [f for f in video_dir.iterdir() if f.is_file()]
    infos = {f: probe(f) for f in files if f.suffix.lower() in VIDEO_EXT | AUDIO_EXT}
    if args.source:
        source = Path(args.source).resolve()
    else:
        videos = [f for f, i in infos.items() if has_video(i)]
        if not videos:
            raise SystemExit("no camera file found; pass --source")
        source = max(videos, key=lambda f: f.stat().st_size)
    if args.voiceover == "none":
        voiceover = None
    elif args.voiceover:
        voiceover = Path(args.voiceover).resolve()
    else:
        audio = [f for f, i in infos.items() if f != source and has_audio(i) and not has_video(i)]
        voiceover = max(audio, key=lambda f: f.stat().st_size) if audio else None
        if len(audio) > 1:
            print("several audio files; using", voiceover.name, "- pass --voiceover to choose another")

    info = probe(source)
    stream = next(s for s in info["streams"] if s.get("codec_type") == "video")
    num, den = (int(x) for x in stream["r_frame_rate"].split("/"))
    fps = round(num / den, 3)
    fps = int(fps) if fps == int(fps) else fps

    if args.edit_dir:
        edit = Path(args.edit_dir).resolve()
    else:
        edit, n = video_dir / "Edit", 1
        while edit.exists() and any(edit.iterdir()):
            n += 1
            edit = video_dir / f"Edit-v{n}"
    if edit.exists() and any(edit.iterdir()):
        raise SystemExit(f"{edit} is not empty")

    title = args.title or video_dir.name
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    shutil.copytree(SKILL / "template", edit, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
    profile = studio_profile(studio)
    browser = chrome(studio)
    if browser is None:
        print("WARNING: Chrome not found. Run the setup installer or set 'chrome' in project.json before rendering overlays.")
    config = {
        "title": title,
        "studio": studio.as_posix(),
        "source": source.as_posix(),
        "voiceover": voiceover.as_posix() if voiceover else None,
        "assets": (video_dir / "Assets").as_posix() if (video_dir / "Assets").is_dir() else None,
        "fps": fps,
        "width": 1080,
        "height": 1920,
        "language": profile.get("whisperLanguage", "auto"),
        "loudness": profile.get("loudness", -14),
        "syncOffset": 0,
        "cleanPlate": None,
        # House default: the real room lightly blurred (video-call look), MatteV3, and a talk plate for room mode.
        # "set" puts a cutout of the speaker on a dark shelf set instead (needs a clean empty-room frame).
        "bgMode": profile.get("background", "room"),
        "bgBlur": profile.get("bgBlur", 5),
        "matte": "v3",
        "talkPlate": True,
        "port": args.port or free_port(4320),
        "chrome": browser.as_posix() if browser else None,
        "whisperModel": profile.get("whisperModel", "ggml-small-q5_1.bin"),
        "export": (studio / "Exports" / video_dir.name / f"{slug}-v1.mp4").as_posix(),
    }
    (edit / "project.json").write_text(json.dumps(config, indent=2), encoding="utf8")
    (edit / "edit-plan.json").write_text(json.dumps({"beats": []}, indent=2), encoding="utf8")
    board = {"title": title, "video": "media/rough-cut.mp4", "styleLine": "", "note": "", "duration": 0, "beats": []}
    (edit / "storyboard.json").write_text(json.dumps(board, indent=2), encoding="utf8")
    for folder in ("analysis", "media"):
        (edit / folder).mkdir(exist_ok=True)

    if WINDOWS:
        name, launcher = "Start Storyboard.cmd", f'@echo off\r\ncd /d "{edit}"\r\nnode storyboard\\server.cjs\r\npause\r\n'
    else:
        name, launcher = "start-storyboard.sh", f'#!/bin/sh\ncd "{edit}" && exec node storyboard/server.cjs\n'
    for target in [edit / name] + ([studio / name] if studio in edit.parents else []):  # the studio launcher opens the newest project
        target.write_text(launcher, encoding="utf8", errors="replace", newline="")
        if not WINDOWS:
            target.chmod(0o755)

    print(f"edit folder  {edit}")
    print(f"source       {source.name} ({stream.get('width')}x{stream.get('height')}, {fps} fps)")
    print(f"voiceover    {voiceover.name if voiceover else 'none (camera audio is the dialogue)'}")
    print(f"assets       {config['assets'] or 'none'}")
    print(f"dashboard    http://127.0.0.1:{config['port']}" + (f"  ({name} in the studio folder now opens this project)" if studio in edit.parents else ""))
    print(f"export       {config['export']}")
    print(f"next: {venv_python(studio)} -X utf8 scripts/prepare.py, run from the edit folder")


if __name__ == "__main__":
    main()
