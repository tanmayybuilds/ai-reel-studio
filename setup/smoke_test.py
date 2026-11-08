"""End-to-end smoke test of the studio tools. Run from the studio folder with the venv Python:
    Tools/vision-venv/Scripts/python.exe setup/smoke_test.py      (Windows)
    Tools/vision-venv/bin/python setup/smoke_test.py              (macOS / Linux)
Writes into a temporary folder only. Exit code 0 when all four tests pass.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

STUDIO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STUDIO / ".claude" / "skills" / "talking-head-reel" / "scripts"))
from studio_paths import chrome, model, whisper_cli  # noqa: E402

results = []


def test(name):
    def wrap(fn):
        try:
            detail = fn()
            results.append((name, True, detail))
        except Exception as e:  # noqa: BLE001 - report every failure, keep going
            results.append((name, False, f"{type(e).__name__}: {e}"))
        return fn
    return wrap


tmp = Path(tempfile.mkdtemp(prefix="reel-smoke-"))


@test("ffmpeg: encode a 1080x1920 H.264 + AAC clip")
def _ffmpeg():
    out = tmp / "test.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=2",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    "-shortest", "-fps_mode", "cfr", str(out)], check=True)
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", str(out)],
                                     capture_output=True, text=True, check=True).stdout)
    codecs = sorted(s["codec_name"] for s in info["streams"])
    assert codecs == ["aac", "h264"], codecs
    return f"{out.stat().st_size // 1024} KB, {codecs}"


@test("whisper.cpp: transcribe the speech sample with ggml-small-q5_1")
def _whisper():
    wav = STUDIO / "setup" / "samples" / "jfk.wav"
    r = subprocess.run([str(whisper_cli(STUDIO)), "-m", str(model(STUDIO)), "-f", str(wav), "-l", "en", "-nt", "-np", "-t", "4"],
                       capture_output=True, timeout=600)
    text = r.stdout.decode("utf8", errors="replace").strip()
    assert r.returncode == 0, r.stderr.decode("utf8", errors="replace")[-400:]
    assert "country" in text.lower(), text
    return text[:70] + "..."


@test("mediapipe + opencv: face detection and selfie segmentation run")
def _vision():
    import cv2, mediapipe as mp, numpy as np
    frame = np.full((640, 360, 3), 128, np.uint8)
    with mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=.5) as fd:
        fd.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    with mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1) as seg:
        mask = seg.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).segmentation_mask
    assert mask.shape == (640, 360)
    return f"opencv {cv2.__version__}, mediapipe {mp.__version__}"


@test("puppeteer-core + Chrome: render a page to PNG")
def _chrome():
    browser = chrome(STUDIO)
    assert browser, "Chrome not found (Tools/paths.json has no 'chrome')"
    png = tmp / "page.png"
    js = tmp / "shot.cjs"
    js.write_text(
        "const p = require(%s);\n"
        "(async () => { const b = await p.launch({executablePath: %s, headless: true, args: ['--no-sandbox']});\n"
        "  const pg = await b.newPage(); await pg.setViewport({width: 540, height: 960});\n"
        "  await pg.setContent('<body style=\"background:#0e0b08;color:#2ee6ff;font:900 80px sans-serif\">REEL</body>');\n"
        "  await pg.screenshot({path: %s}); await b.close(); })().catch(e => { console.error(e); process.exit(1); });\n"
        % (json.dumps(str(STUDIO / "Tools" / "node_modules" / "puppeteer-core")), json.dumps(str(browser)), json.dumps(str(png))),
        encoding="utf8")
    r = subprocess.run(["node", str(js)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0 and png.exists(), r.stderr[-400:]
    return f"{png.stat().st_size // 1024} KB screenshot via {Path(browser).name}"


width = max(len(n) for n, _, _ in results)
for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")
print(f"temp files: {tmp}")
sys.exit(0 if all(ok for _, ok, _ in results) else 1)
