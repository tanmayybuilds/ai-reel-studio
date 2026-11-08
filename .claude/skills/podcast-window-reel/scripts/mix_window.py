"""Mix and export: media/window-video.mp4 + dialogue-master + sfx + music (ducked under the voice) -> export + SRT.

Usage: mix_window.py [--version 1]
Music: Raw/<Video>/Assets/music.(mp3|wav|m4a) when the user supplies one, else the generated media/music.wav.
Checks printed: duration of picture and sound, integrated loudness, true peak.
"""
import argparse, json, re, subprocess
from pathlib import Path

from project import CONFIG, MEDIA, load, resolve

ap = argparse.ArgumentParser()
ap.add_argument("--version", default="1")
ap.add_argument("--music-gain", type=float, default=.16)
ap.add_argument("--sfx-gain", type=float, default=.55)
args = ap.parse_args()

export = Path(CONFIG["export"])
export = export.with_name(re.sub(r"-v\d+$", "", export.stem) + f"-v{args.version}.mp4")
export.parent.mkdir(parents=True, exist_ok=True)
if export.exists():
    raise SystemExit(f"{export} exists: exports are never overwritten, pass a new --version")

assets = resolve(CONFIG["assets"])
music = next((p for p in sorted(assets.glob("music.*")) if p.suffix.lower() in (".mp3", ".wav", ".m4a", ".aac", ".flac")), MEDIA / "music.wav")
total = load("edit-plan.json")["beats"][-1]["end"]

graph = (f"[1:a]aresample=48000,asplit=2[d][key];"
         f"[3:a]aresample=48000,aloop=loop=-1:size=2e9,atrim=0:{total},volume={args.music_gain}[m];"
         f"[m][key]sidechaincompress=threshold=0.03:ratio=5:attack=25:release=350[md];"
         f"[2:a]aresample=48000,volume={args.sfx_gain}[s];"
         f"[d][s][md]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[a]")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(MEDIA / "window-video.mp4"), "-i", str(MEDIA / "dialogue-master.wav"),
                "-i", str(MEDIA / "sfx.wav"), "-i", str(music), "-filter_complex", graph, "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-shortest", str(export)], check=True)


def stamp(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


subs = load("timeline.json")["subs"]
srt = export.with_name(export.stem + "-captions.srt")
srt.write_text("".join(f"{i}\n{stamp(s['in'])} --> {stamp(s['out'])}\n{s['text']}\n\n" for i, s in enumerate(subs, 1)), encoding="utf8")

probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration,width,height,r_frame_rate",
                                   "-of", "json", str(export)], capture_output=True, text=True).stdout)
loud = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(export), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"],
                      capture_output=True, text=True, encoding="utf8", errors="replace").stderr
summary = loud[loud.rfind("Summary:"):]
print("export", export)
print("music ", music.name)
for s in probe["streams"]:
    print(s["codec_type"], s.get("width", ""), s.get("height", ""), s.get("r_frame_rate", ""), s.get("duration"))
print(" ".join(re.findall(r"I:\s+[-\d.]+ LUFS|Peak:\s+[-\d.]+ dBFS", summary)))
print("srt   ", srt.name, len(subs), "cues")
