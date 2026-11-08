"""Final assembly: rough cut + transparent motion layer + dialogue and SFX mix, then captions file and checks.

Usage: assemble.py [--sfx-volume 0.5]
Needs: every beat scene rendered at --height 1920, media/overlay.mov, media/sfx.wav (make_sfx.py).
Writes the export named in project.json, an SRT beside it, and analysis/export-sheet.jpg to look at.
"""
import argparse, json, re, subprocess

from project import ANALYSIS, CONFIG, FPS, MEDIA, concat_scenes, load, resolve, run


def stamp(t):
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames,duration:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def log_of(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", *map(str, args)], capture_output=True, text=True, encoding="utf8", errors="replace").stderr


ap = argparse.ArgumentParser()
ap.add_argument("--sfx-volume", type=float, default=.5)
args = ap.parse_args()

board = load("storyboard.json")
rough = concat_scenes()
if rough is None:
    raise SystemExit("render every beat with render_scene.py --height 1920 first")
height = next(s["height"] for s in probe(rough)["streams"] if s["codec_type"] == "video")
if height != CONFIG["height"]:
    raise SystemExit(f"scenes are {height}px tall; re-render all of them with render_scene.py --height {CONFIG['height']}")
for need in ("overlay.mov", "sfx.wav", "dialogue-master.wav"):
    if not (MEDIA / need).exists():
        raise SystemExit(f"media/{need} is missing")

run("ffmpeg", "-y", "-i", MEDIA / "dialogue-master.wav", "-i", MEDIA / "sfx.wav", "-filter_complex",
    f"[1:a]volume={args.sfx_volume}[s];[0:a][s]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.84:level=disabled[m]",
    "-map", "[m]", "-ar", "48000", "-ac", "2", MEDIA / "final-audio.wav")

out = resolve(CONFIG["export"])
out.parent.mkdir(parents=True, exist_ok=True)
# The overlay is rendered from sRGB screenshots, so convert with explicit BT.709 tags or colours shift.
run("ffmpeg", "-y", "-i", rough, "-i", MEDIA / "overlay.mov", "-i", MEDIA / "final-audio.wav", "-filter_complex",
    "[0:v][1:v]overlay=format=auto:shortest=1,scale=out_color_matrix=bt709:in_color_matrix=bt601:flags=accurate_rnd,format=yuv420p[v]",
    "-map", "[v]", "-map", "2:a", "-r", FPS, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", out)

srt = out.with_name(out.stem + "-captions.srt")
srt.write_text("\n".join(f"{i}\n{stamp(b['start'])} --> {stamp(b['end'])}\n{b['spoken']}\n" for i, b in enumerate(board["beats"], 1)), encoding="utf8")

info = probe(out)
video = next(s for s in info["streams"] if s["codec_type"] == "video")
audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
black = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", log_of("-i", out, "-vf", "blackdetect=d=0.1:pix_th=0.06", "-an", "-f", "null", "-"))
loud = log_of("-i", out, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-")
lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", loud)
peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", loud)
errors = log_of("-v", "error", "-i", out, "-f", "null", "-").strip()
print(f"export {out}")
print(f"  {video['width']}x{video['height']}, {video.get('nb_frames')} frames, video {float(video['duration']):.2f}s, audio {float(audio['duration']):.2f}s, storyboard {board['duration']:.2f}s")
print(f"  loudness {lufs[-1] if lufs else '?'} LUFS, true peak {peak[-1] if peak else '?'} dBFS")
print(f"  black segments: {len(black)} {black[:4] if black else ''}")
print(f"  decode errors: {errors[:300] if errors else 'none'}")
print(f"  captions {srt}")

duration = float(info["format"]["duration"])
run("ffmpeg", "-y", "-i", out, "-vf", f"fps=24/{duration:.3f},scale=270:-1,tile=8x3:padding=4", "-frames:v", "1", "-q:v", "3", ANALYSIS / "export-sheet.jpg")
print("  look at analysis/export-sheet.jpg (24 frames from the real export)")
