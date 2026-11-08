"""Split a track at real pauses and transcribe each piece alone, so retakes cannot merge.

Usage: list_takes.py vo|cam [--floor -36] [--pause 0.22]
Writes analysis/takes-<track>.txt: one line per island, "start-end (length) text", in that track's seconds.
"""
import argparse, re, subprocess

from project import ANALYSIS, CONFIG, MODEL, WHISPER, run

ap = argparse.ArgumentParser()
ap.add_argument("track", choices=["vo", "cam"])
ap.add_argument("--floor", type=float, help="silence threshold in dB (default -36 for vo, -33 for cam)")
ap.add_argument("--pause", type=float, default=.22, help="shortest pause that splits two islands, in seconds")
args = ap.parse_args()

wav = ANALYSIS / f"{args.track}16k.wav"
floor = args.floor if args.floor is not None else (-36 if args.track == "vo" else -33)
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", f"silencedetect=noise={floor}dB:d={args.pause}", "-f", "null", "-"],
                     capture_output=True, text=True, encoding="utf8", errors="replace").stderr
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)], capture_output=True, text=True).stdout)
islands = [(a, b) for a, b in zip([0.0] + ends, starts + [duration]) if b - a > .35]

out = ANALYSIS / f"islands-{args.track}"
out.mkdir(exist_ok=True)
rows = []
for i, (a, b) in enumerate(islands):
    f = out / f"{i:03d}.wav"
    run("ffmpeg", "-y", "-ss", f"{max(a - .08, 0):.3f}", "-to", f"{b + .08:.3f}", "-i", wav, f)
    # -mc 0: no carried-over context, so a retake is heard fresh instead of merged with the take before it.
    r = subprocess.run([str(WHISPER), "-m", str(MODEL), "-f", str(f), "-l", CONFIG.get("language", "auto"), "-nt", "-np", "-mc", "0", "-t", "6"], capture_output=True)
    text = " ".join(r.stdout.decode("utf8", "replace").split())
    rows.append(f"{a:7.2f}-{b:7.2f} ({b - a:4.1f}s) {text}")
    print(rows[-1], flush=True)
(ANALYSIS / f"takes-{args.track}.txt").write_text("\n".join(rows), encoding="utf8")
