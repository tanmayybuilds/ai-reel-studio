"""Cut the dialogue from edit-plan.json, re-transcribe every beat as speech evidence, and sync timing into storyboard.json.

Segments in edit-plan.json are in dialogue seconds: voiceover time when there is a voiceover, otherwise camera time.
Camera time = dialogue time + syncOffset, cut on whole frames so picture and sound stay locked.
"""
import json

from project import ANALYSIS, CONFIG, FPS, MEDIA, MODEL, WHISPER, dialogue_wav, load, resolve, run, save

plan = load("edit-plan.json")
offset = CONFIG.get("syncOffset", 0)
evidence = ANALYSIS / "speech-evidence"
evidence.mkdir(parents=True, exist_ok=True)
MEDIA.mkdir(exist_ok=True)

chain, labels, output = [], [], 0.0
for b, beat in enumerate(plan["beats"]):
    beat["start"] = round(output, 3)
    beat["frames"] = []
    shift = beat.get("syncOffset", offset)  # a per-beat override, only when the recorders drift
    for s, (vo_in, vo_out) in enumerate(beat["segments"]):
        src_in = round((vo_in + shift) * FPS)
        frames = round((vo_out - vo_in) * FPS)
        beat["frames"].append([src_in, frames])
        a, d = (src_in / FPS) - shift, frames / FPS
        label = f"s{b}_{s}"
        # 8 ms fades stop clicks at every join.
        chain.append(f"[0:a]atrim={a:.4f}:{a + d:.4f},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st={d - 0.008:.4f}:d=0.008[{label}]")
        labels.append(f"[{label}]")
        output += d
    beat["end"] = round(output, 3)
    beat["duration"] = round(beat["end"] - beat["start"], 3)

loud = CONFIG.get("loudness", -14)
graph = ";".join(chain) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=0:a=1,loudnorm=I={loud}:TP=-1.5:LRA=7,aresample=48000[out]"
run("ffmpeg", "-y", "-i", dialogue_wav(), "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-ac", "2", MEDIA / "dialogue-master.wav")

for beat in plan["beats"]:
    wav = evidence / f"{beat['id']}.wav"
    run("ffmpeg", "-y", "-ss", beat["start"], "-t", beat["duration"], "-i", MEDIA / "dialogue-master.wav", "-ar", "16000", "-ac", "1", wav)
    run(WHISPER, "-m", MODEL, "-f", wav, "-l", CONFIG.get("language", "auto"), "-ml", "1", "-sow", "-ojf", "-of", evidence / beat["id"], "-np", "-t", "6")
    # whisper.cpp can split a multibyte character across tokens, so decode leniently.
    words = json.loads((evidence / f"{beat['id']}.json").read_text(encoding="utf8", errors="replace"))["transcription"]
    print(beat["id"], f"{beat['start']:.2f}-{beat['end']:.2f}", " ".join(f"{w['text'].strip()}@{w['offsets']['from'] / 1000:.2f}" for w in words if w["text"].strip()))

save("edit-plan.json", plan)

board = load("storyboard.json")
timing = {b["id"]: b for b in plan["beats"]}
board["beats"] = [beat for beat in board["beats"] if beat["id"] in timing]
order = [b["id"] for b in plan["beats"]]
board["beats"].sort(key=lambda beat: order.index(beat["id"]))
for beat in board["beats"]:
    t = timing[beat["id"]]
    beat.update(start=t["start"], end=t["end"], duration=t["duration"], segments=t["segments"], syncOffset=t.get("syncOffset", offset))
board["duration"] = plan["beats"][-1]["end"]
board["sourceName"] = resolve(CONFIG["source"]).name
save("storyboard.json", board)
missing = [i for i in order if i not in {b["id"] for b in board["beats"]}]
if missing:
    print("warning: no storyboard entry for", ", ".join(missing))
print("total", plan["beats"][-1]["end"])
