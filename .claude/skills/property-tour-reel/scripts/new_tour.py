"""Start a property tour project: copy the template into Raw/<Property>/Tour (Tour-v2 ... never overwrites)
and write project.json.

  python .claude/skills/property-tour-reel/scripts/new_tour.py "Raw/<Property>" [--title "2 BHK Vikhroli"]
         [--accent "#2EE6FF"] [--voice af_heart] [--engine kokoro|say|recorded] [--port N]

Raw/<Property>/ holds the photos and clips (any sub-folders), plus optional:
  agent.jpg / logo.png      agent photo and agency logo (picked up by name)
  Voice/intro.m4a ...       the user's own voice lines (engine "recorded")
  Music/<track>             a licensed music track
  listing.txt / .md / .pdf  the listing details
"""
import argparse, json, re, shutil, socket, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL.parent / "talking-head-reel" / "scripts"))
from studio_paths import chrome  # noqa: E402


def free_port(start):
    for port in range(start, start + 60):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)):
                return port
    raise SystemExit("no free port found")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("property_dir")
    ap.add_argument("--title")
    ap.add_argument("--accent")
    ap.add_argument("--voice")
    ap.add_argument("--engine", choices=["kokoro", "say", "recorded"])
    ap.add_argument("--port", type=int)
    args = ap.parse_args()

    src = Path(args.property_dir).resolve()
    if not src.is_dir():
        raise SystemExit(f"{src} is not a folder")
    studio = next((p for p in [Path.cwd(), *src.parents] if (p / "Tools").is_dir() and (p / "Raw").is_dir()), None)
    if studio is None:
        raise SystemExit("run this from the studio folder (the one with Tools and Raw)")
    proj, n = src / "Tour", 1
    while proj.exists() and any(proj.iterdir()):
        n += 1
        proj = src / f"Tour-v{n}"
    shutil.copytree(SKILL / "template", proj, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))

    profile = json.loads((studio / "studio.json").read_text(encoding="utf-8-sig")) if (studio / "studio.json").exists() else {}
    title = args.title or src.name
    browser = chrome(studio)
    engine = args.engine or ("recorded" if (src / "Voice").is_dir() else "kokoro")
    config = {
        "title": title,
        "name": src.name,
        "slug": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "property-tour",
        "studio": studio.as_posix(),
        "source": src.as_posix(),
        "fps": 30, "width": 1080, "height": 1920,
        "accent": args.accent or (profile.get("accent") or {}).get("main", "#2EE6FF"),
        "voiceEngine": engine,
        "voice": args.voice or ("af_heart" if engine == "kokoro" else "Aman" if engine == "say" else None),
        "voiceSpeed": 1.0,
        "music": "auto", "musicDb": -17, "sfxDb": -10,
        "loudness": profile.get("loudness", -14),
        "enhance": True,
        "port": args.port or free_port(4380),
        "chrome": browser.as_posix() if browser else None,
    }
    (proj / "project.json").write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf8")
    if browser is None:
        print("WARNING: Chrome not found; set 'chrome' in project.json before rendering.")
    print(f"project: {proj}")
    print(f"editor:  node editor/server.cjs  ->  http://127.0.0.1:{config['port']}")
    print("next:    $py scripts/prep_media.py   (from the project folder)")


if __name__ == "__main__":
    main()
