"""Build the reel's sound: voiceover placed on the timeline, music ducked under the voice, and sound effects
on every transition and text reveal. Writes media/mix.wav (-14 LUFS, -1.5 dBTP), media/mix.json and media/captions.srt.

Music: the first audio file in Raw/<Property>/Music/ or media/music.* is used (looped/trimmed, faded).
Without one, a soft generated bed (pad + plucked arpeggio + light beat) is used. Tell the user it is a placeholder.

  $py scripts/make_audio.py [--music none|auto|FILE] [--music-db -20] [--sfx-db -9] [--no-sfx]
"""
import argparse, subprocess
from pathlib import Path

import numpy as np
from scipy import signal
import soundfile as sf

from tourlib import CONFIG, MEDIA, PROJ, load, log, save, timeline, tour_hash

SR = 48000
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}


def db(x):
    return 10 ** (x / 20)


def read_mono(path):
    tmp = MEDIA / "_tmp.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), str(tmp)], check=True)
    a, _ = sf.read(str(tmp), dtype="float32", always_2d=True)
    tmp.unlink(missing_ok=True)
    return a


def place(buf, clip, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if clip.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        clip = np.stack([clip * l * 1.414, clip * r * 1.414], 1)
    if i < 0:
        clip, i = clip[-i:], 0
    n = min(len(clip), len(buf) - i)
    if n > 0:
        buf[i:i + n] += clip[:n] * gain


def env(n, a, r, shape=1.0):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na) ** shape
    e[-nr:] *= np.linspace(1, 0, nr) ** shape
    return e


rng = np.random.default_rng(11)


def noise(d):
    return rng.standard_normal(int(d * SR)).astype(np.float32)


def sweep_filter(x, f0, f1, q=1.2):
    """Band-pass sweep by processing short blocks (cheap and good enough for whooshes)."""
    out = np.zeros_like(x)
    blk = 512
    zi = None
    n_blocks = max(1, len(x) // blk)
    for b in range(n_blocks + 1):
        s = x[b * blk:(b + 1) * blk]
        if not len(s):
            break
        f = f0 * (f1 / f0) ** (b / n_blocks)
        bb, aa = signal.iirpeak(min(f, SR / 2 - 100), q, fs=SR)
        if zi is None:
            zi = signal.lfilter_zi(bb, aa) * 0
        out[b * blk:b * blk + len(s)], zi = signal.lfilter(bb, aa, s, zi=zi)
    return out


def sfx_whip(d=0.42, rev=False):
    x = sweep_filter(noise(d), 600, 5200) * env(int(d * SR), d * 0.55, d * 0.45, 1.5)
    return (x[::-1] if rev else x) * 0.9


def sfx_riser(d=0.6):
    x = sweep_filter(noise(d), 300, 7000, 2.0) * np.linspace(0, 1, int(d * SR)) ** 2.2
    t = np.arange(int(d * SR)) / SR
    tone = np.sin(2 * np.pi * (180 * t + 500 * t * t / d)) * 0.25 * np.linspace(0, 1, len(t)) ** 2
    return (x + tone) * 0.8


def sfx_thump(d=0.35, f=62):
    t = np.arange(int(d * SR)) / SR
    return np.sin(2 * np.pi * f * t * (1 + 0.6 * np.exp(-t * 30))) * np.exp(-t * 9) * 0.9


def sfx_swell(d=0.9):
    t = np.arange(int(d * SR)) / SR
    x = sweep_filter(noise(d), 2500, 9000, 0.8) * 0.5
    sh = sum(np.sin(2 * np.pi * f * t + p) for f, p in [(880, 0), (1320, 1), (1760, 2), (2640, .5)]) * 0.06
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6
    return (x + sh) * e


def sfx_tick(f=2400, d=0.06):
    t = np.arange(int(d * SR)) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 70) * 0.5


def sfx_chime():
    d = 1.2
    t = np.arange(int(d * SR)) / SR
    return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) * a for f, k, a in [(1046.5, 4, .3), (1568, 5, .2), (2093, 6, .12)])


def sfx_pop():
    d = 0.09
    t = np.arange(int(d * SR)) / SR
    return np.sin(2 * np.pi * (500 + 900 * np.exp(-t * 40)) * t) * np.exp(-t * 45) * 0.45


def generated_bed(total, bpm=120, fast_end=0.0):
    """Placeholder music on the tour's beat grid (beat 1 at t=0).
    Fast act: four-on-the-floor kick, claps on 2 and 4, off-beat hats, eighth-note bass and a 16th arpeggio.
    A riser into the act change and an impact on it. Slow act: warm pad and a gentle pluck, no drums."""
    n = int(total * SR) + SR
    t = np.arange(n) / SR
    beat = 60 / bpm
    bar = beat * 4
    chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 52, 55, 59, 64], [55, 59, 62, 67, 69]]  # Am9, Fmaj7, Cmaj7, G6
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    out = np.zeros((n, 2), np.float32)
    for c_i in range(int(total / bar) + 2):  # pad, everywhere
        ch = chords[c_i % 4]
        s, e = int(c_i * bar * SR), min(n, int((c_i + 1) * bar * SR + 0.6 * SR))
        if s >= n:
            break
        tt = t[s:e] - t[s]
        seg = sum(signal.sawtooth(2 * np.pi * hz(m - 12 + det) * tt) * 0.02 for m in ch for det in (-0.08, 0.08))
        seg *= np.minimum(1, tt / 0.5) * np.minimum(1, (tt[-1] - tt + 1e-3) / 0.6)
        out[s:e] += np.stack([seg, seg], 1)
    b, a = signal.butter(2, 1500, fs=SR)
    out = signal.lfilter(b, a, out, axis=0).astype(np.float32)
    in_fast = lambda x: x < fast_end - 0.02
    # arpeggio: 16ths in the fast act, eighths in the slow act
    k, x = 0, 0.0
    while x < total:
        fast = in_fast(x)
        step = beat / 4 if fast else beat / 2
        ch = chords[int(x / bar) % 4]
        m = ch[[0, 2, 4, 2, 1, 3, 4, 3][k % 8]] + 12
        tt = np.arange(int(0.45 * SR)) / SR
        note = (np.sin(2 * np.pi * hz(m) * tt) + 0.3 * np.sin(4 * np.pi * hz(m) * tt)) * np.exp(-tt * (11 if fast else 6)) * (0.06 if fast else 0.07)
        place(out, note, x, pan=0.35 if k % 2 else -0.35)
        k += 1
        x += step
    # drums and bass, fast act only
    for k in range(int(fast_end / beat)):
        tb = k * beat
        ch = chords[int(tb / bar) % 4]
        place(out, sfx_thump(0.32, 52) * 0.75, tb)
        hat = sweep_filter(noise(0.05), 8000, 10000, 1.0) * env(int(0.05 * SR), 0.003, 0.045) * 0.12
        place(out, hat, tb + beat / 2, pan=0.25)
        if k % 4 in (1, 3):
            clap = sweep_filter(noise(0.16), 1400, 1800, 0.9) * env(int(0.16 * SR), 0.002, 0.15, 2.0) * 0.5
            place(out, clap, tb, pan=-0.1)
        for half in (0, 0.5):
            tt = np.arange(int(beat * 0.45 * SR)) / SR
            bass = signal.sawtooth(2 * np.pi * hz(ch[0] - 24) * tt) * np.exp(-tt * 6) * 0.09
            bb, ba = signal.butter(2, 300, fs=SR)
            place(out, signal.lfilter(bb, ba, bass), tb + half * beat)
    if fast_end > 2:
        place(out, sfx_riser(min(2.0, bar)) * 0.45, fast_end - min(2.0, bar))
        place(out, sfx_thump(0.9, 40) * 0.9, fast_end)
        place(out, sfx_swell(1.4) * 0.5, fast_end - 0.1)
    return out[:int(total * SR)]


def find_music(arg):
    if arg == "none":
        return None
    if arg not in (None, "auto"):
        return Path(arg)
    for folder in (Path(CONFIG["source"]) / "Music", MEDIA):
        if folder.exists():
            for f in sorted(folder.iterdir()):
                if f.suffix.lower() in AUDIO_EXT and (folder.name == "Music" or f.stem.startswith("music")):
                    return f
    return "generated"


def srt_time(s):
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_srt(tour, vo):
    lines, n = [], 1
    for clip in tour.get("audio", {}).get("vo", []):
        text = vo["lines"][clip["key"]]["text"]
        words = text.split()
        chunks, cur = [], []
        for w in words:
            cur.append(w)
            if len(cur) >= 7 or w.endswith((".", ",", "?", "!")) and len(cur) >= 3:
                chunks.append(" ".join(cur)); cur = []
        if cur:
            chunks.append(" ".join(cur))
        total_chars = sum(len(c) for c in chunks) or 1
        t = clip["start"]
        for c in chunks:
            d = clip["dur"] * len(c) / total_chars
            lines.append(f"{n}\n{srt_time(t)} --> {srt_time(t + d)}\n{c}\n")
            n += 1
            t += d
    (MEDIA / "captions.srt").write_text("\n".join(lines), encoding="utf8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--music", default=CONFIG.get("music", "auto"))
    ap.add_argument("--music-db", type=float, default=CONFIG.get("musicDb", -17))
    ap.add_argument("--sfx-db", type=float, default=CONFIG.get("sfxDb", -10))
    ap.add_argument("--no-sfx", action="store_true")
    args = ap.parse_args()

    tour = load("tour.json")
    vo = load("voiceover.json", {"lines": {}})
    segs, total = timeline(tour)
    n = int(total * SR)
    voice = np.zeros((n, 2), np.float32)
    active = np.zeros(n, np.float32)
    for clip in tour.get("audio", {}).get("vo", []):
        a = read_mono(PROJ / clip["file"]).mean(1)
        rms = np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2)) if np.any(np.abs(a) > 0.01) else 0.1
        a = a * (0.12 / max(rms, 1e-4))
        place(voice, a, clip["start"])
        i0, i1 = int(clip["start"] * SR), min(n, int((clip["start"] + clip["dur"]) * SR))
        active[max(0, i0):i1] = 1
        if clip["start"] + clip["dur"] > total + 0.05:
            log(f"warning: voice line {clip['key']} runs past the end ({clip['start'] + clip['dur']:.2f}s > {total:.2f}s); run build_tour.py --retime")

    # music, ducked under the voice
    music_src = find_music(args.music)
    music = np.zeros((n, 2), np.float32)
    mus = tour.get("audio", {}).get("music", {})
    fast_end = tour.get("audio", {}).get("fastEnd", 0.0)
    if music_src == "generated":
        music = generated_bed(total, mus.get("bpm", 120), fast_end)
        log("music: generated placeholder bed (put a licensed track in Raw/<Property>/Music/ to replace it)")
    elif music_src:
        m = read_mono(music_src)
        m = m[int(mus.get("offset", 0) * SR):] if mus.get("file") == str(music_src) else m  # first beat lands on t=0
        reps = int(np.ceil(n / len(m)))
        music = np.tile(m, (reps, 1))[:n]
        log(f"music: {music_src}")
    if music_src:
        rms = np.sqrt(np.mean(music ** 2)) or 1
        music *= db(args.music_db) * 0.12 / rms * 1.0
        k = int(0.35 * SR)
        duck = np.convolve(active, np.ones(k) / k, mode="same")
        duck = 1 - 0.62 * np.clip(duck * 1.6, 0, 1)
        music *= duck[:, None]
        if fast_end:  # the detail half sits back under the voice
            calm = np.ones(n, np.float32)
            i = int(fast_end * SR)
            calm[i:] = db(-4)
            calm = np.convolve(calm, np.ones(int(0.5 * SR)) / int(0.5 * SR), mode="same")
            music *= calm[:, None]
        music *= env(n, 0.6, 2.2)[:, None]

    # sound effects
    fx = np.zeros((n, 2), np.float32)
    if not args.no_sfx:
        for i, g in enumerate(segs):
            s = g["shot"]
            tr = (s.get("transition") or {})
            if i < len(segs) - 1 and tr.get("type"):
                b = g["end"]
                d = float(tr.get("dur", 0.5))
                kind = tr["type"]
                pan = -0.6 if tr.get("dir") in ("left", None) else 0.6
                quick = s.get("act") == "fast"
                if kind in ("whip", "slide"):
                    w = sfx_whip(max(0.3, d)) * (0.5 if quick else 1.0)
                    place(fx, w, b - len(w) / SR * 0.55, pan=pan)
                elif kind == "lens":
                    place(fx, sfx_riser(0.45) * 0.7, b - 0.42)
                    place(fx, sfx_thump(0.5, 58) * 0.7, b)
                    place(fx, sfx_whip(0.35, rev=True) * 0.5, b + 0.02, pan=pan)
                elif kind == "spin":
                    place(fx, sfx_whip(0.42, rev=True) * 0.8, b - 0.38, pan=-pan)
                    place(fx, sfx_whip(0.38) * 0.8, b, pan=pan)
                elif kind == "mirror":
                    w = sfx_whip(0.45)
                    place(fx, w, b - 0.3, pan=pan)
                    place(fx, sfx_swell(0.5) * 0.35, b)
                elif kind == "zoom" and quick:
                    place(fx, sfx_riser(0.3) * 0.45, b - 0.28)
                elif kind == "zoom":
                    r = sfx_riser(0.55)
                    place(fx, r, b - 0.5)
                    place(fx, sfx_thump(0.4, 70) * 0.6, b)
                elif kind == "warp":
                    place(fx, sfx_whip(0.6, rev=True), b - 0.45)
                    place(fx, sfx_swell(0.7) * 0.7, b - 0.2)
                elif kind == "leak":
                    place(fx, sfx_swell(max(0.8, d + 0.2)), b - d / 2 - 0.1)
                elif kind == "flash":
                    place(fx, sfx_thump(0.5, 50), b)
                    place(fx, sfx_swell(0.5) * 0.6, b - 0.25)
            if s.get("kind") == "grid":  # card grows, rows split, carousels swipe, hero expands
                T = {"two": 0.85, "three": 1.75, "swipes": [2.25, 2.95], "expand": 3.45, **(s.get("timing") or {})}
                place(fx, sfx_swell(0.7) * 0.4, g["start"] + 0.05)
                for at in (T["two"], T["three"]):
                    place(fx, sfx_pop() * 0.8, g["start"] + at + 0.1)
                for sw in T["swipes"]:
                    for r, dl in enumerate((0, 0.12, 0.24)):
                        place(fx, sfx_whip(0.3) * 0.32, g["start"] + sw + dl, pan=(-0.5, 0.5, -0.5)[r])
                place(fx, sfx_riser(0.5) * 0.45, g["start"] + T["expand"] - 0.3)
                title = s.get("title") or {}
                if title.get("text"):
                    place(fx, sfx_thump(0.7, 46) * 0.85, g["start"] + title.get("at", 3.55) + 0.05)
                    place(fx, sfx_swell(0.9) * 0.35, g["start"] + title.get("at", 3.55))
            if s.get("kind") == "specs":
                for k in range(len(s.get("items") or [])):
                    place(fx, sfx_pop() * 0.7, g["start"] + s.get("at", 0.35) + 0.3 + k * 0.16)
            if s.get("kind") == "collage":
                for k in range(6):
                    place(fx, sfx_pop() * 0.6, g["start"] + 0.1 + k * 0.07, pan=(k % 3 - 1) * 0.5)
                exp = (s.get("timing") or {}).get("expandStart", 1.5)
                place(fx, sfx_riser(0.6) * 0.5, g["start"] + exp - 0.5)
                title = s.get("title") or {}
                if title.get("text"):
                    place(fx, sfx_thump(0.6, 48), g["start"] + title.get("at", 2.1) + 0.15)
                    place(fx, sfx_swell(0.6) * 0.4, g["start"] + title.get("at", 2.1) + 0.1)
            if s.get("label") and s["label"].get("style") == "ref":
                for j in range(5):  # soft sparkle as letters fade in
                    place(fx, sfx_tick(2600 + 300 * j, 0.05) * 0.25, g["start"] + s["label"].get("at", 0.7) + 0.12 + j * 0.13, pan=(j % 3 - 1) * 0.4)
            elif s.get("label"):
                place(fx, sfx_tick(2100) * 0.7, g["start"] + s["label"].get("at", 0.45) + 0.08)
                place(fx, sfx_whip(0.25) * 0.25, g["start"] + s["label"].get("at", 0.45) + 0.05, pan=-0.4)
            for k, st in enumerate(s.get("stats") or []):
                place(fx, sfx_pop(), g["start"] + st.get("at", 1.0) + k * 0.25)
            if s.get("kind") == "outro":
                place(fx, sfx_chime() * 0.6, g["start"] + s.get("at", 0.25) + 0.2)
        peak = np.max(np.abs(fx)) or 1
        fx *= min(1.0, 0.7 / peak) * db(args.sfx_db + 10) * 0.5

    mix = voice + music + fx
    raw = MEDIA / "mix-raw.wav"
    sf.write(str(raw), np.clip(mix, -1, 1), SR, subtype="FLOAT")
    out = MEDIA / "mix.wav"
    lufs = CONFIG.get("loudness", -14)
    meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(raw), "-af", f"loudnorm=I={lufs}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    import json, re
    js = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", meas, re.S).group(0))
    af = (f"loudnorm=I={lufs}:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
          f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true,alimiter=limit=0.84:level=false")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", af, "-ar", str(SR), "-c:a", "pcm_s16le", str(out)], check=True)
    raw.unlink(missing_ok=True)
    save("media/mix.json", {"tourHash": tour_hash(tour), "duration": total, "music": str(music_src), "inputLufs": js["input_i"]})
    write_srt(tour, vo)
    log(f"media/mix.wav: {total:.2f}s, loudness {lufs} LUFS target; captions media/captions.srt")


if __name__ == "__main__":
    main()
