"""Stitch a scrolling screen recording (a README, a web page, a long app view) into one tall image.

Usage: stitch_scroll.py <recording.mp4> <out.jpg> [--crop x0,y0,x1,y1]
Crop to the content column, away from browser chrome, so the stitched page is clean.
The tall image feeds the repoScroll and browser overlays (their from/to are pixel offsets into it).
"""
import argparse

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("recording")
ap.add_argument("out")
ap.add_argument("--crop", default="", help="x0,y0,x1,y1 in recording pixels; default is the whole frame")
args = ap.parse_args()

cap = cv2.VideoCapture(args.recording)
crop = [int(v) for v in args.crop.split(",")] if args.crop else None
strip_h = 60
canvas, prev, index = None, None, 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    index += 1
    if index % 2:
        continue
    view = frame[crop[1]:crop[3], crop[0]:crop[2]] if crop else frame
    if prev is None:
        canvas, prev = view.copy(), view
        continue
    # Find how far the page moved: locate a band of the old frame inside the new one.
    gray_new, gray_old = cv2.cvtColor(view, cv2.COLOR_BGR2GRAY), cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    band = gray_old[-200:-200 + strip_h]
    anchor = view.shape[0] - 200
    if band.std() < 4:  # a flat band matches everywhere; use one higher up
        band, anchor = gray_old[300:300 + strip_h], 300
    score = cv2.matchTemplate(gray_new, band, cv2.TM_CCOEFF_NORMED)
    _, best, _, loc = cv2.minMaxLoc(score)
    moved = anchor - loc[1]
    if best > .9 and moved > 0:
        canvas = np.vstack([canvas, view[-moved:]])
    prev = view

cv2.imwrite(args.out, canvas, [cv2.IMWRITE_JPEG_QUALITY, 88])
print("stitched", canvas.shape[1], "x", canvas.shape[0])
