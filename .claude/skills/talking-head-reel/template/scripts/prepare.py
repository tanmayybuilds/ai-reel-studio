"""First pass over the raw footage: audio tracks, voiceover sync, face track, empty-room clean plate and contact sheets.

Usage: prepare.py [--skip-face]
Writes into analysis/ and updates project.json (syncOffset, cleanPlate, sourceSize, sourceDuration).
Warns when the empty-room frame picked for cleanPlate looks under-exposed.
"""
import argparse, json, subprocess, wave

import numpy as np

from project import ANALYSIS, CONFIG, EDIT, resolve, run, save_config


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    stream = data["streams"][0] if data.get("streams") else {}
    return stream.get("width"), stream.get("height"), float(data["format"]["duration"])


def extract(src, stem):
    run("ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", ANALYSIS / f"{stem}16k.wav")
    run("ffmpeg", "-y", "-i", src, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", ANALYSIS / f"{stem}-full.wav")


def envelope(path, block):
    with wave.open(str(path)) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)
    n = len(data) // block
    return np.sqrt((data[:n * block].reshape(n, block) ** 2).mean(1))


def normalized(x):
    return (x - x.mean()) / (x.std() + 1e-9)


def sync_offset():
    """Seconds to add to voiceover time to get camera time, from loudness-envelope correlation."""
    cam, vo = normalized(envelope(ANALYSIS / "cam16k.wav", 160)), normalized(envelope(ANALYSIS / "vo16k.wav", 160))
    size = 1 << int(np.ceil(np.log2(len(cam) + len(vo))))
    corr = np.fft.irfft(np.fft.rfft(cam, size) * np.conj(np.fft.rfft(vo, size)), size)
    reach = 3000  # 30 s either way
    lags = np.r_[0:reach, -reach:0]
    coarse = lags[np.argmax(np.r_[corr[:reach], corr[-reach:]])] / 100

    # Refine to 1 ms in windows across the take; the spread shows any drift between recorders.
    cam1, vo1 = envelope(ANALYSIS / "cam16k.wav", 16), envelope(ANALYSIS / "vo16k.wav", 16)
    windows = []
    for start in np.arange(4, len(vo1) / 1000 - 12, 15):
        s, e = int(start * 1000), int((start + 8) * 1000)
        b = normalized(vo1[s:e])
        best = (None, 0.0)
        for lag in range(int(coarse * 1000) - 50, int(coarse * 1000) + 51):
            if s + lag < 0 or e + lag > len(cam1):
                continue
            score = float(np.mean(normalized(cam1[s + lag:e + lag]) * b))
            if score > best[1]:
                best = (lag / 1000, score)
        if best[0] is not None:
            windows.append({"voAt": round(float(start), 1), "offset": best[0], "correlation": round(best[1], 3)})
    good = [w["offset"] for w in windows if w["correlation"] >= .6]
    offset = float(np.median(good)) if good else coarse
    spread = max(abs(x - offset) for x in good) if good else None
    (ANALYSIS / "sync.json").write_text(json.dumps({"coarse": coarse, "offset": offset, "spread": spread, "windows": windows}, indent=2))
    return offset, spread, len(good), len(windows)


def face_track(source, duration, size):
    import cv2
    import mediapipe as mp
    cap = cv2.VideoCapture(str(source))
    detector = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=.5)
    track, thumbs, lumas = [], {}, {}
    for s in range(int(duration)):
        cap.set(cv2.CAP_PROP_POS_MSEC, s * 1000)
        ok, frame = cap.read()
        if not ok:
            break
        lumas[s] = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean())
        found = detector.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).detections
        if found:
            b = found[0].location_data.relative_bounding_box
            track.append({"t": s, "cx": round((b.xmin + b.width / 2) * size[0]), "cy": round((b.ymin + b.height / 2) * size[1]), "h": round(b.height * size[1])})
        else:
            track.append({"t": s, "cx": None, "cy": None, "h": None})
            thumbs[s] = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32)
    (ANALYSIS / "face-track.json").write_text(json.dumps(track))
    # The empty room is a stretch with no face where nothing moves between samples.
    # (Person segmentation is no help here: furniture such as a chair reads as part of a person.)
    runs, current = [], []
    for s in sorted(thumbs):
        if current and s == current[-1] + 1 and np.abs(thumbs[s] - thumbs[current[-1]]).mean() < 6:
            current.append(s)
        else:
            if len(current) >= 2:
                runs.append(current)
            current = [s]
    if len(current) >= 2:
        runs.append(current)
    found_faces = sum(1 for p in track if p["cx"])
    return track, found_faces, runs, lumas


def plate_exposure(source, at, track, runs, lumas):
    """Warn when the empty-room frames at cleanPlate look under-exposed. Cameras often open dark and settle,
    and the exposure shifts once someone sits down (Handy: the empty room read about 12% darker than the talk;
    0.2 s was replaced with 1.8 s). A dark plate gives a dark, mismatched room behind the speaker."""
    import cv2
    span = CONFIG.get("cleanPlateSpan", 40) / CONFIG["fps"]  # how long render_scene reads the plate for
    cap = cv2.VideoCapture(str(source))
    levels = []
    for t in np.linspace(at, at + span, 5):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if ok:
            levels.append(float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean()))
    if not levels:
        print(f"  warning: could not read the cleanPlate frame at {at}s")
        return
    talk = [lumas[p["t"]] for p in track if p["cx"] and p["t"] in lumas] or list(lumas.values())
    talk = float(np.median(talk))
    first, darkest, brightest = levels[0], min(levels), max(levels)
    print(f"cleanPlate brightness {first:.0f} (plate range {darkest:.0f}-{brightest:.0f}, talk median {talk:.0f}, 0-255)")
    settling = darkest < .92 * brightest
    dark = first < .8 * talk or first < 45
    if not (settling or dark):
        if first < .9 * talk:
            print(f"  note: the empty room is {round((1 - first / talk) * 100)}% darker than the talk; talkPlate gain-matches it, "
                  "but look at analysis/talk-plate.jpg after the first room-mode render")
        return
    why = "the exposure is still changing across the plate" if settling else "it is much darker than the talk"
    print(f"  warning: the cleanPlate frames at {at}s look under-exposed ({why}); the room plate will come out dark")
    # Suggest the first empty-room second, in any run, that is as bright as the empty room gets and has a full plate after it.
    # (A brightness jump also splits a run, so the settled part is often the next run.)
    bright = max(lumas[s] for r in runs for s in r)
    better = next((s for r in runs for s in r if s != int(at) and lumas[s] >= .95 * bright and s + .2 + span <= r[-1] + 1), None)
    if better is not None:
        print(f"  try cleanPlate {better + .2} in project.json (exposure settled there), check it on the contact sheet, "
              "and delete analysis/talk-plate.jpg if it exists")
    else:
        print("  pick a later, settled empty-room moment from analysis/aroll-sheet-*.jpg and set cleanPlate by hand")


def sheets(source, duration):
    label = "drawtext=text='%{eif\\:t\\:d}s':x=4:y=4:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6"
    run("ffmpeg", "-y", "-i", source, "-vf", f"fps=1,scale=240:-1,{label},tile=8x6:padding=2", "-q:v", "4", ANALYSIS / "aroll-sheet-%02d.jpg")
    assets = resolve(CONFIG.get("assets"))
    if assets and assets.exists():
        for f in sorted(assets.iterdir()):
            if f.suffix.lower() in (".mp4", ".mov", ".mkv", ".webm"):
                run("ffmpeg", "-y", "-i", f, "-vf", f"fps=1/2,scale=360:-1,{label},tile=5x4:padding=3", "-frames:v", "1", "-q:v", "3", ANALYSIS / f"asset-{f.stem}.jpg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-face", action="store_true")
    args = ap.parse_args()
    ANALYSIS.mkdir(exist_ok=True)
    (EDIT / "media").mkdir(exist_ok=True)
    source = resolve(CONFIG["source"])
    w, h, duration = probe(source)
    CONFIG.update(sourceSize=[w, h], sourceDuration=round(duration, 3))
    print(f"source {source.name}: {w}x{h}, {duration:.1f}s at {CONFIG['fps']} fps")

    extract(source, "cam")
    if CONFIG.get("voiceover"):
        extract(resolve(CONFIG["voiceover"]), "vo")
        offset, spread, good, total = sync_offset()
        CONFIG["syncOffset"] = round(offset, 4)
        print(f"sync: camera time = voiceover time + {offset:.4f}s ({good}/{total} windows agree, worst drift {spread if spread is None else round(spread * 1000)} ms)")
        if spread is not None and spread > 1 / CONFIG["fps"]:
            print("  warning: drift is over one frame; split the offset per section (see references/takes-and-cuts.md)")
    else:
        CONFIG["syncOffset"] = 0
        print("no separate voiceover: dialogue comes from the camera audio")

    if not args.skip_face:
        track, found, runs, lumas = face_track(source, duration, (w, h))
        print(f"face found in {found} of {len(track)} one-second samples")
        if runs:
            print("empty-room runs (s):", ", ".join(f"{r[0]}-{r[-1] + 1}" for r in runs))
            if CONFIG.get("cleanPlate") is None:
                longest = max(runs, key=len)  # the plate reads 1.6 s of frames from here
                CONFIG["cleanPlate"] = longest[0] + .2
                print(f"cleanPlate set to {CONFIG['cleanPlate']}s; check analysis/aroll-sheet-*.jpg that the room is really empty there")
        else:
            print("no empty-room moment found: the matte falls back to segmentation only (softer edges)")
            if CONFIG.get("bgMode") == "room":
                print("  room mode needs cleanPlate for analysis/talk-plate.jpg: set it by hand, or remove bgMode for the dark set")
        if CONFIG.get("cleanPlate") is not None:
            plate_exposure(source, CONFIG["cleanPlate"], track, runs, lumas)
    sheets(source, duration)
    save_config()
    print("contact sheets: analysis/aroll-sheet-*.jpg, analysis/asset-*.jpg")


if __name__ == "__main__":
    main()
