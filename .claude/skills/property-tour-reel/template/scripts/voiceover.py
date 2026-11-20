"""Make the voiceover, one line per group (intro, room-01.., outro), from the "vo" text in plan.json.

Engines (project.json "voiceEngine", or --engine):
  kokoro   free local neural TTS (Tools/models/kokoro). Voices: af_heart, af_bella, bf_emma, bf_isabella, bm_george,
           am_michael ... ; hf_alpha / hf_beta / hm_omega / hm_psi speak Hindi (write the line in Devanagari or Hinglish).
  say      macOS built-in voices (Aman, Tara, Rishi for Indian English; Lekha for Hindi). No download needed.
  recorded the user's own recordings: Raw/<Property>/Voice/intro.m4a, room-01.m4a, ..., outro.m4a (any audio type).

Writes media/vo/<key>.wav (trimmed, 48 kHz mono) and voiceover.json with each line's length.
Then run build_tour.py (or build_tour.py --retime after editing in the editor) so shots fit the voice.

  $py scripts/voiceover.py [--engine kokoro|say|recorded] [--voice af_heart] [--speed 1.0] [--only room-02]
  $py scripts/voiceover.py --list-voices
"""
import argparse, re, subprocess, sys
from pathlib import Path

import numpy as np

from tourlib import CONFIG, MEDIA, MODELS, PROJ, audio_duration, load, log, save

SR = 48000


def speech_text(text):
    """Write numbers and Indian real-estate shorthand the way a person reads them aloud."""
    t = text
    t = re.sub(r"₹\s?([\d.,]+)\s?(Cr|cr|crore)\b\.?", r"\1 crore rupees", t)
    t = re.sub(r"₹\s?([\d.,]+)\s?(L|Lac|lac|Lakh|lakh|lakhs)\b\.?", r"\1 lakh rupees", t)
    t = re.sub(r"₹\s?([\d,]+)", r"\1 rupees", t)
    t = re.sub(r"\b(\d)\s?BHK\b", r"\1 B H K", t, flags=re.I)
    t = re.sub(r"\bBHK\b", "B H K", t)
    t = re.sub(r"\bsq\.?\s?ft\.?", "square feet", t, flags=re.I)
    t = re.sub(r"\bsqft\b", "square feet", t, flags=re.I)
    t = re.sub(r"\bkm\b", "kilometres", t)
    t = re.sub(r"\bmins?\b", "minutes", t)
    t = re.sub(r"\bRERA\b", "Rera", t)
    t = t.replace("&", " and ").replace("·", ",").replace("|", ",")
    t = re.sub(r"(\d),(\d{2,3})", r"\1\2", t)  # 1,050 -> 1050 (spoken as a number)
    return re.sub(r"\s+", " ", t).strip()


def lines_from_plan():
    plan = load("plan.json")
    out = {}
    hook = plan.get("hook") or plan.get("intro") or {}
    if hook.get("vo"):
        out["intro"] = (hook["vo"], hook.get("voSay"))
    for i, sh in enumerate(plan.get("shots", [])):   # reference style: one line per shot
        if sh.get("vo"):
            out[f"shot-{i + 1:02d}"] = (sh["vo"], sh.get("voSay"))
    if plan.get("specs", {}).get("vo"):
        out["specs"] = (plan["specs"]["vo"], plan["specs"].get("voSay"))
    for i, r in enumerate(plan.get("rooms", [])):
        if r.get("vo"):
            out[f"room-{i + 1:02d}"] = (r["vo"], r.get("voSay"))
    if plan.get("outro", {}).get("vo"):
        out["outro"] = (plan["outro"]["vo"], plan["outro"].get("voSay"))
    return out


def trim_to_wav(src, dst, speed=1.0):
    """Trim leading/trailing silence, resample to 48 kHz mono, optional tempo change."""
    chain = ["silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05",
             "areverse", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08", "areverse"]
    if abs(speed - 1.0) > 0.01:
        chain.append(f"atempo={speed}")
    chain += ["afade=t=in:d=0.02", "areverse", "afade=t=in:d=0.06", "areverse"]
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", ",".join(chain), "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", str(dst)], check=True)


_kokoro = None


def kokoro_say(text, voice, speed, dst):
    global _kokoro
    import soundfile as sf
    from kokoro_onnx import Kokoro
    if _kokoro is None:
        _kokoro = Kokoro(str(MODELS / "kokoro" / "kokoro-v1.0.int8.onnx"), str(MODELS / "kokoro" / "voices-v1.0.bin"))
    lang = {"a": "en-us", "b": "en-gb", "h": "hi", "e": "es", "f": "fr-fr", "i": "it", "j": "ja", "p": "pt-br", "z": "cmn"}.get(voice[0], "en-us")
    samples, sr = _kokoro.create(text, voice=voice, speed=speed, lang=lang)
    raw = dst.with_suffix(".raw.wav")
    sf.write(str(raw), samples, sr)
    trim_to_wav(raw, dst)
    raw.unlink(missing_ok=True)


def mac_say(text, voice, speed, dst):
    if sys.platform != "darwin":
        raise SystemExit("the 'say' engine needs macOS; use --engine kokoro")
    raw = dst.with_suffix(".aiff")
    rate = int(175 * speed)
    subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", str(raw), text], check=True)
    trim_to_wav(raw, dst)
    raw.unlink(missing_ok=True)


def recorded(key, dst, speed):
    folder = Path(CONFIG["source"]) / "Voice"
    found = sorted(p for p in folder.glob(f"{key}.*") if p.suffix.lower() in {".wav", ".m4a", ".mp3", ".aac", ".flac", ".ogg", ".opus", ".mp4", ".mov"})
    if not found:
        raise SystemExit(f"no recording for {key} in {folder} (expected {key}.m4a or similar)")
    trim_to_wav(found[0], dst, speed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["kokoro", "say", "recorded"])
    ap.add_argument("--voice")
    ap.add_argument("--speed", type=float)
    ap.add_argument("--only", help="comma-separated line keys to redo")
    ap.add_argument("--list-voices", action="store_true")
    args = ap.parse_args()
    if args.list_voices:
        from kokoro_onnx import Kokoro
        k = Kokoro(str(MODELS / "kokoro" / "kokoro-v1.0.int8.onnx"), str(MODELS / "kokoro" / "voices-v1.0.bin"))
        log("kokoro:", ", ".join(k.get_voices()))
        if sys.platform == "darwin":
            out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
            log("say (Indian):", ", ".join(l.split("  ")[0].strip() for l in out.splitlines() if "_IN" in l))
        return

    engine = args.engine or CONFIG.get("voiceEngine", "kokoro")
    voice = args.voice or CONFIG.get("voice") or ("af_heart" if engine == "kokoro" else "Aman")
    speed = args.speed or CONFIG.get("voiceSpeed", 1.0)
    CONFIG.update({"voiceEngine": engine, "voice": voice, "voiceSpeed": speed})
    save("project.json", CONFIG)

    lines = lines_from_plan()
    if not lines:
        raise SystemExit("plan.json has no 'vo' lines")
    only = set(args.only.split(",")) if args.only else None
    (MEDIA / "vo").mkdir(parents=True, exist_ok=True)
    old = load("voiceover.json", {"lines": {}})
    result = {"engine": engine, "voice": voice, "speed": speed, "lines": {}}
    for key, (text, say_override) in lines.items():
        dst = MEDIA / "vo" / f"{key}.wav"
        spoken = say_override or speech_text(text)
        prev = old.get("lines", {}).get(key)
        same_voice = (old.get("engine"), old.get("voice"), old.get("speed")) == (engine, voice, speed)
        keep = prev and dst.exists() and ((only is not None and key not in only) or (only is None and same_voice and prev.get("spoken") == spoken))
        if keep:
            result["lines"][key] = prev
            continue
        if engine == "kokoro":
            kokoro_say(spoken, voice, speed, dst)
        elif engine == "say":
            mac_say(spoken, voice, speed, dst)
        else:
            recorded(key, dst, speed)
        dur = round(audio_duration(dst), 3)
        result["lines"][key] = {"text": text, "spoken": spoken, "file": f"media/vo/{key}.wav", "dur": dur}
        log(f"{key:<8} {dur:5.2f}s  {spoken}")
    save("voiceover.json", result)
    total = sum(l["dur"] for l in result["lines"].values())
    log(f"voiceover.json: {len(result['lines'])} lines, {total:.1f}s of speech ({engine}, {voice}). Next: build_tour.py (or --retime)")


if __name__ == "__main__":
    main()
