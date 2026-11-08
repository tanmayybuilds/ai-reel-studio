"""Break a reference (or approved) video into things you can look at: 1 fps frames, labelled sheets,
cut times, motion runs around each cut, pauses, loudness and a word-timed transcript.

Usage, from the studio folder:
  python .claude/skills/talking-head-reel/scripts/study_reference.py "References/<file>.mp4" [--name "Short name"] [--language hi] [--runs 9.4:0.7,15:1.3]
Output: Editing Style/Reference Analysis/<name>/
"""
import argparse, json, re, subprocess
from pathlib import Path

from studio_paths import model as studio_model, whisper_cli

LABEL = "drawtext=text='%{eif\\:t\\:d}s':x=6:y=6:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6"


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


def log_of(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", *map(str, args)], capture_output=True, text=True, encoding="utf8", errors="replace").stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--name")
    ap.add_argument("--language", default="auto", help="whisper language code, e.g. en, hi, or auto")
    ap.add_argument("--runs", default="", help="extra motion runs as start:duration, comma separated")
    ap.add_argument("--out", help="output folder (default: Editing Style/Reference Analysis/<name>)")
    args = ap.parse_args()

    video = Path(args.video).resolve()
    studio = next(p for p in [Path.cwd(), *video.parents] if (p / "Tools").is_dir())
    name = args.name or re.sub(r"\s+", " ", re.split(r"[#|]", video.stem)[0]).strip()[:40] or "reference"
    out = Path(args.out).resolve() if args.out else studio / "Editing Style" / "Reference Analysis" / name
    (out / "frames").mkdir(parents=True, exist_ok=True)

    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration",
                                      "-of", "json", str(video)], capture_output=True, text=True, check=True).stdout)
    stream, duration = info["streams"][0], float(info["format"]["duration"])
    num, den = (int(x) for x in stream["r_frame_rate"].split("/"))

    ff("-i", video, "-vf", "fps=1", "-q:v", "2", out / "frames" / "f%03d.jpg")
    ff("-i", video, "-vf", f"fps=1,scale=300:-1,{LABEL},tile=6x2:padding=4", "-q:v", "3", out / "sheet-%02d.jpg")

    cuts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", log_of("-i", video, "-vf", "select='gt(scene,0.22)',showinfo", "-f", "null", "-"))]
    (out / "scene-cuts.txt").write_text("\n".join(f"{c:.2f}" for c in cuts), encoding="utf8")

    runs = [(max(c - .3, 0), .8) for c in cuts[:12]]
    runs += [tuple(float(v) for v in r.split(":")) for r in args.runs.split(",") if r]
    for start, length in runs:
        ff("-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", video, "-vf", "fps=12,scale=220:-1,tile=10x1:padding=3", "-frames:v", "1", "-q:v", "3", out / f"mo-{start:05.2f}.jpg")

    silence = [line.split("] ")[-1] for line in log_of("-i", video, "-af", "silencedetect=noise=-32dB:d=0.12", "-f", "null", "-").splitlines() if "silence_" in line]
    (out / "silence.txt").write_text("\n".join(silence), encoding="utf8")
    loud = log_of("-i", video, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-")
    summary = loud[loud.rfind("Summary:"):] if "Summary:" in loud else loud[-600:]
    (out / "loudness.txt").write_text(summary, encoding="utf8")

    ff("-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out / "ref.wav")
    whisper, model = whisper_cli(studio), studio_model(studio)
    subprocess.run([str(whisper), "-m", str(model), "-f", str(out / "ref.wav"), "-l", args.language, "-ml", "1", "-sow", "-osrt",
                    "-of", str(out / "ref-words"), "-np", "-t", "6"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    shots = [b - a for a, b in zip([0.0] + cuts, cuts + [duration])]
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", summary)
    report = {"video": video.name, "size": f"{stream['width']}x{stream['height']}", "fps": round(num / den, 3), "duration": round(duration, 2),
              "cuts": len(cuts), "averageShot": round(sum(shots) / len(shots), 2), "loudness": lufs[-1] if lufs else None}
    (out / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps(report, indent=2))
    print(f"look at: {out / 'sheet-01.jpg'} (and the rest), mo-*.jpg for motion, frames/ for single frames")


if __name__ == "__main__":
    main()
