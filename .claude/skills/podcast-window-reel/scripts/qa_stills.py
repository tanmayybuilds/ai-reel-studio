"""Tile analysis/qa/still-*.png into labelled contact sheets (analysis/qa/sheet-N.jpg)."""
import sys
from pathlib import Path

import cv2
import numpy as np

qa = Path(__file__).resolve().parents[1] / "analysis" / "qa"
files = sorted(qa.glob("still-*.png"))
cols, w = int(sys.argv[1]) if len(sys.argv) > 1 else 6, 300
tiles = []
for f in files:
    im = cv2.imread(str(f))
    im = cv2.resize(im, (w, int(im.shape[0] * w / im.shape[1])), interpolation=cv2.INTER_AREA)
    cv2.putText(im, f.stem.replace("still-", "") + "s", (8, 28), cv2.FONT_HERSHEY_SIMPLEX, .8, (0, 255, 255), 2)
    tiles.append(im)
per = cols * 2
for n in range(0, len(tiles), per):
    chunk = tiles[n:n + per]
    while len(chunk) % cols:
        chunk.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(chunk[i:i + cols]) for i in range(0, len(chunk), cols)]
    cv2.imwrite(str(qa / f"sheet-{n // per + 1}.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
print(len(files), "stills")
