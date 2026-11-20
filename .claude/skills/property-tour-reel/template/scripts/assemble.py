"""Mux media/video.mp4 with media/mix.wav into Exports/<Property>/<slug>-vN.mp4 (never overwrites),
copy the SRT beside it, print the checks and write analysis/export-sheet.jpg to look at.

  $py scripts/assemble.py [--version N]
"""
import argparse, json, re, shutil, subprocess
from pathlib import Path

from tourlib import ANALYSIS, CONFIG, MEDIA, PROJ, load, log, probe, tour_hash


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", type=int)
    args = ap.parse_args()
    video, mix = MEDIA / "video.mp4", MEDIA / "mix.wav"
    for f in (video, mix):
        if not f.exists():
            raise SystemExit(f"missing {f.relative_to(PROJ)}: run render_tour.cjs and make_audio.py first")
    tour = load("tour.json")
    mj = load("media/mix.json", {})
    if mj.get("tourHash") != tour_hash(tour):
        log("warning: tour.json changed after make_audio.py ran; re-run make_audio.py so sound effects and voice match")
    if video.stat().st_mtime < (PROJ / "tour.json").stat().st_mtime:
        log("warning: tour.json is newer than media/video.mp4; re-render so the picture matches")

    out_dir = Path(CONFIG.get("exportDir") or Path(CONFIG["studio"]) / "Exports" / CONFIG["name"])
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = CONFIG.get("slug", "property-tour")
    v = args.version or 1
    while (out_dir / f"{slug}-v{v}.mp4").exists():
        if args.version:
            raise SystemExit(f"{slug}-v{v}.mp4 already exists; exports are never overwritten. Use a higher --version.")
        v += 1
    out = out_dir / f"{slug}-v{v}.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(mix), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    srt = MEDIA / "captions.srt"
    if srt.exists():
        shutil.copyfile(srt, out.with_name(out.stem + "-captions.srt"))

    pr = probe(out)
    vs = next(s for s in pr["streams"] if s["codec_type"] == "video")
    dur = float(pr["format"]["duration"])
    vd = float(probe(video)["format"]["duration"])
    ad = float(probe(mix)["format"]["duration"])
    meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(out), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", meas)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", meas)
    black = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(out), "-vf", "blackdetect=d=0.15:pix_th=0.06", "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
    blacks = re.findall(r"black_start:([\d.]+)", black)
    log(f"export: {out}")
    log(f"  size {vs['width']}x{vs['height']} @ {vs['r_frame_rate']}, duration {dur:.2f}s (video {vd:.2f}, audio {ad:.2f}, tour {tour.get('duration', 0):.2f})")
    log(f"  loudness {lufs[-1] if lufs else '?'} LUFS, true peak {peak[-1] if peak else '?'} dBFS")
    log(f"  black segments: {', '.join(blacks) if blacks else 'none'}")
    if abs(vd - ad) > 0.1:
        log("  warning: video and audio lengths differ by more than 0.1 s")

    ANALYSIS.mkdir(exist_ok=True)
    n = 24
    sheet = ANALYSIS / "export-sheet.jpg"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-vf", f"fps={n / dur:.5f},scale=270:-2,tile=8x3:padding=6:color=0x111111",
                    "-frames:v", "1", str(sheet)], check=True)
    log(f"  sheet: {sheet.relative_to(PROJ)}")


if __name__ == "__main__":
    main()
