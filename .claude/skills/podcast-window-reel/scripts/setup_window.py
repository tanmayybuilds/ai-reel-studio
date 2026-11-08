"""Install the podcast-window scripts into a talking-head-reel project and set its project.json.

Usage, from the studio folder:
  python .claude/skills/podcast-window-reel/scripts/setup_window.py "Raw/<Video>/Edit" [--window 1350] [--port N]
--window: window height in px on the 1080x1920 canvas (715 = the reference's exact 3:2; 1350 = 4:5 for vertical selfies).
"""
import argparse, json, shutil, socket
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = ["render_window.py", "make_window_sfx.py", "mix_window.py", "qa_stills.py", "export_sheet.py"]

ap = argparse.ArgumentParser()
ap.add_argument("edit")
ap.add_argument("--window", type=int, default=1350)
ap.add_argument("--port", type=int, default=0)
args = ap.parse_args()

edit = Path(args.edit).resolve()
cfg_path = edit / "project.json"
cfg = json.loads(cfg_path.read_text(encoding="utf-8-sig"))
for name in SCRIPTS:
    dst = edit / "scripts" / name
    if dst.exists():
        print("kept existing", dst.name)
    else:
        shutil.copy2(HERE / name, dst)
        print("copied", name)
example = edit / "scripts" / "build_timeline.py"
if not example.exists():
    shutil.copy2(HERE / "build_timeline_example.py", example)
    print("copied build_timeline_example.py -> scripts/build_timeline.py (rewrite its beat section)")

wh = args.window
cfg["sourceFps"] = cfg.get("sourceFps", cfg.get("fps"))
cfg["fps"] = 30
cfg["window"] = {"y": (1920 - wh) // 2 if wh > 715 else 603, "h": wh}
if args.port:
    cfg["port"] = args.port
else:
    port = cfg.get("port", 4320)
    with socket.socket() as s:
        while s.connect_ex(("127.0.0.1", port)) == 0:
            port += 1
    cfg["port"] = port
cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf8")  # no BOM
print("project.json: fps 30, window", cfg["window"], "port", cfg["port"])
