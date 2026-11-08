"""Contact sheets of an export: every hero stack at full reveal, plus one frame every N seconds.

Usage: export_sheet.py <export.mp4> [--every 3]  -> analysis/export-sheet-*.jpg
"""
import argparse, json
from pathlib import Path

import cv2
import numpy as np

EDIT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--every", type=float, default=3)
args = ap.parse_args()
tl = json.loads((EDIT / "timeline.json").read_text(encoding="utf8"))
cap = cv2.VideoCapture(args.video)
fps = cap.get(cv2.CAP_PROP_FPS)
total = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
times = sorted({round(min(h["out"] - .05, h["rows"][-1]["at"] + .3), 2) for h in tl["heroes"]} |
               {round(t, 2) for t in np.arange(.5, total, args.every)})
tiles = []
for t in times:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
    ok, fr = cap.read()
    if not ok:
        continue
    fr = cv2.resize(fr[200:1700], (240, 400), interpolation=cv2.INTER_AREA)
    cv2.putText(fr, f"{t:.1f}", (6, 24), cv2.FONT_HERSHEY_SIMPLEX, .7, (0, 255, 255), 2)
    tiles.append(fr)
cols, per = 8, 16
for n in range(0, len(tiles), per):
    chunk = tiles[n:n + per]
    while len(chunk) % cols:
        chunk.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(chunk[i:i + cols]) for i in range(0, len(chunk), cols)])
    cv2.imwrite(str(EDIT / "analysis" / f"export-sheet-{n // per + 1}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(tiles), "frames on", (len(tiles) + per - 1) // per, "sheets")
