"""Prepare the property's photos and clips for the tour engine.

For every photo: fix rotation (EXIF), convert HEIC, straighten converging verticals' tilt, gently lift
exposure / white balance / local contrast, resize, make a depth map (Depth Anything V2 if the model is
installed, otherwise a room-shaped guess) and find the most interesting point (saliency) to aim the camera at.
For every clip: tone-map HDR, scale, re-encode with short GOPs so the renderer can seek frame-exactly.
Writes media.json (ids p01.., c01..; stable across re-runs) and analysis/media-sheet.jpg to look at.

Usage (from the project folder):  $py scripts/prep_media.py [--no-enhance] [--no-straighten] [--no-depth] [--only p03,p04]
"""
import argparse, hashlib, json, re, shutil, subprocess, sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps, ImageDraw, ImageFont

from tourlib import ANALYSIS, CONFIG, MEDIA, MODELS, PROJ, load, log, probe, save

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
SPECIAL = re.compile(r"^(agent|broker|owner|logo|brand)", re.I)
LONG_SIDE = 2560
DEPTH_MODEL = MODELS / "depth" / "depth-anything-v2-small.onnx"
SR_MODEL = MODELS / "upscale" / "swin2sr-realworld-x4.onnx"
SR_BELOW = 1000  # photos whose long side is under this get AI upscaled x4 (portal photos are often 320 px)
SKIP_FOLDERS = {"Voice", "Music", "Listing", "Unused"}


def natural(p):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r"(\d+)", p.name)]


def sources():
    """Every photo and clip under Raw/<Property>/, except inside project folders (Tour*, Edit*) and Voice/ or Music/."""
    src = Path(CONFIG["source"])
    files = []
    for f in sorted(src.rglob("*"), key=natural):
        if not f.is_file() or any(part.startswith(".") for part in f.relative_to(src).parts):
            continue
        top = f.relative_to(src).parts[0]
        if len(f.relative_to(src).parts) > 1 and (top.startswith(("Tour", "Edit")) or top in SKIP_FOLDERS):
            continue
        files.append(f)
    return src, files


def read_photo(path):
    if path.suffix.lower() in {".heic", ".heif"}:
        tmp = ANALYSIS / "heic" / (path.stem + ".jpg")
        tmp.parent.mkdir(parents=True, exist_ok=True)
        if sys.platform == "darwin":
            subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(tmp)], check=True, capture_output=True)
        else:
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(path), str(tmp)], check=True)
        path = tmp
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)


def tilt_angle(img):
    """Median deviation from vertical of long near-vertical lines (degrees, + = clockwise lean)."""
    h, w = img.shape[:2]
    s = 1200 / max(h, w)
    small = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    g = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (3, 3), 0)
    edges = cv2.Canny(g, 60, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 720, threshold=80, minLineLength=int(small.shape[0] * 0.12), maxLineGap=8)
    if lines is None:
        return 0.0, 0
    angs, wts = [], []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        dx, dy = x2 - x1, y2 - y1
        if abs(dy) < 1:
            continue
        a = np.degrees(np.arctan2(dx, dy))
        a = (a + 90) % 180 - 90
        if abs(a) < 6:
            angs.append(a)
            wts.append(np.hypot(dx, dy))
    if len(angs) < 4:
        return 0.0, len(angs)
    order = np.argsort(angs)
    a, wt = np.array(angs)[order], np.array(wts)[order]
    c = np.cumsum(wt)
    return float(a[np.searchsorted(c, c[-1] / 2)]), len(angs)


def straighten(img, deg):
    h, w = img.shape[:2]
    r = np.radians(abs(deg))
    scale = (np.cos(r) + max(w / h, h / w) * np.sin(r))  # zoom so no empty corners show
    m = cv2.getRotationMatrix2D((w / 2, h / 2), -deg, scale)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def enhance(img):
    """Gentle real-estate grade: partial grey-world white balance, shadow lift, local contrast, a little vibrance."""
    f = img.astype(np.float32) / 255.0
    means = f.reshape(-1, 3).mean(0)
    gain = means.mean() / np.maximum(means, 1e-4)
    f = f * (1 + 0.5 * (gain - 1))
    lum = cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_BGR2GRAY)
    mean = float(lum.mean())
    if mean < 0.48:  # lift dark interiors toward a bright, airy look
        gamma = np.interp(mean, [0.2, 0.48], [0.72, 0.95])
        f = np.power(np.clip(f, 0, 1), gamma)
    lab = cv2.cvtColor((np.clip(f, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2LAB)
    l = lab[:, :, 0]
    clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8)).apply(l)
    lab[:, :, 0] = cv2.addWeighted(l, 0.55, clahe, 0.45, 0)
    out = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR).astype(np.float32)
    hsv = cv2.cvtColor(out.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    s = hsv[:, :, 1] / 255.0
    hsv[:, :, 1] = np.clip(s + 0.12 * s * (1 - s) * 2, 0, 1) * 255
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


_sr_sess = None


def upscale(img):
    """Swin2SR real-world x4 (trained on JPEG / blur / noise degradations), run in overlapping tiles."""
    global _sr_sess
    import onnxruntime as ort
    if _sr_sess is None:
        _sr_sess = ort.InferenceSession(str(SR_MODEL), providers=["CPUExecutionProvider"])
    h, w = img.shape[:2]
    tile, pad = 192, 16
    out = np.zeros((h * 4, w * 4, 3), np.float32)
    weight = np.zeros((h * 4, w * 4, 1), np.float32)
    rgb = img[:, :, ::-1].astype(np.float32) / 255.0
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            ya, xa = max(0, y0 - pad), max(0, x0 - pad)
            yb, xb = min(h, y0 + tile + pad), min(w, x0 + tile + pad)
            patch = rgb[ya:yb, xa:xb]
            ph, pw = (8 - patch.shape[0] % 8) % 8, (8 - patch.shape[1] % 8) % 8
            patch = cv2.copyMakeBorder(patch, 0, ph, 0, pw, cv2.BORDER_REFLECT)
            res = _sr_sess.run(None, {"pixel_values": patch.transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
            res = res[:(yb - ya) * 4, :(xb - xa) * 4]
            wy = np.minimum(np.arange(res.shape[0]) + 1, np.arange(res.shape[0])[::-1] + 1).clip(max=pad * 4)[:, None]
            wx = np.minimum(np.arange(res.shape[1]) + 1, np.arange(res.shape[1])[::-1] + 1).clip(max=pad * 4)[None, :]
            wgt = (np.minimum(wy, wx).astype(np.float32) if (ya or xa or yb < h or xb < w) else np.ones(res.shape[:2], np.float32))[:, :, None]
            out[ya * 4:yb * 4, xa * 4:xb * 4] += res * wgt
            weight[ya * 4:yb * 4, xa * 4:xb * 4] += wgt
    out = out / np.maximum(weight, 1e-6)
    return (np.clip(out, 0, 1) * 255).round().astype(np.uint8)[:, :, ::-1].copy()


_depth_sess = None


def depth_map(img):
    global _depth_sess
    h, w = img.shape[:2]
    if DEPTH_MODEL.exists():
        import onnxruntime as ort
        if _depth_sess is None:
            _depth_sess = ort.InferenceSession(str(DEPTH_MODEL), providers=["CPUExecutionProvider"])
        s = 518 / min(h, w)
        nh, nw = int(round(h * s / 14)) * 14, int(round(w * s / 14)) * 14
        x = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_CUBIC)[:, :, ::-1].astype(np.float32) / 255.0
        x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        d = _depth_sess.run(None, {"pixel_values": x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        method = "depth-anything-v2"
    else:  # room-shaped guess: floor and walls near the edges are close, the middle is far
        yy, xx = np.mgrid[0:256, 0:256] / 255.0
        d = np.maximum(np.abs(xx - 0.5) * 1.2, np.clip(yy - 0.45, 0, 1) * 1.6) + 0.15 * yy
        method = "heuristic"
    d = d.astype(np.float32)
    lo, hi = np.percentile(d, [2, 98])
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)       # 1 = near
    d = np.clip(d - np.median(d) + 0.5, 0, 1)
    tw = 720 if w >= h else int(720 * w / h)
    th = int(tw * h / w)
    d = cv2.resize(d, (tw, th), interpolation=cv2.INTER_CUBIC)
    guide = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (tw, th)).astype(np.float32) / 255.0
    try:
        d = cv2.ximgproc.guidedFilter(guide, d, 10, 1e-3)
    except Exception:
        pass
    d = cv2.GaussianBlur(d, (0, 0), 4)  # soft depth avoids tearing at object edges
    return (np.clip(d, 0, 1) * 255).astype(np.uint8), method


def focus_point(img):
    small = cv2.resize(img, (320, int(320 * img.shape[0] / img.shape[1])))
    try:
        sal = cv2.saliency.StaticSaliencyFineGrained_create()
        ok, m = sal.computeSaliency(small)
        m = m.astype(np.float32)
    except Exception:
        g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        m = np.abs(cv2.Laplacian(g, cv2.CV_32F))
    m = cv2.GaussianBlur(m, (0, 0), 6)
    thr = np.percentile(m, 90)
    ys, xs = np.nonzero(m >= thr)
    if not len(xs):
        return [0.5, 0.5]
    fx, fy = xs.mean() / m.shape[1], ys.mean() / m.shape[0]
    return [round(float(np.clip(fx, 0.25, 0.75)), 3), round(float(np.clip(fy, 0.3, 0.7)), 3)]


def dhash(img):
    g = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (17, 16), interpolation=cv2.INTER_AREA)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def process_photo(f, mid, args, entry):
    img = read_photo(f)
    info = {"kind": "photo", "src": str(f), "srcW": img.shape[1], "srcH": img.shape[0]}
    if max(img.shape[:2]) < SR_BELOW and SR_MODEL.exists() and not args.no_upscale:
        img = upscale(img)
        info["upscaled"] = 4
    if not args.no_straighten:
        deg, n = tilt_angle(img)
        info["tilt"] = round(deg, 2)
        if 0.3 <= abs(deg) <= 4.5 and n >= 6:
            img = straighten(img, deg)
            info["straightened"] = True
    if not args.no_enhance and CONFIG.get("enhance", True):
        img = enhance(img)
    h, w = img.shape[:2]
    s = min(1.0, LONG_SIDE / max(h, w))
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    out = MEDIA / "photos" / f"{mid}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    thumb = MEDIA / "thumbs" / f"{mid}.jpg"
    thumb.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(thumb), cv2.resize(img, (360, int(360 * h / w))), [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not args.no_depth:
        d, method = depth_map(img)
        (MEDIA / "depth").mkdir(exist_ok=True)
        cv2.imwrite(str(MEDIA / "depth" / f"{mid}.png"), d)
        info["depth"] = f"media/depth/{mid}.png"
        info["depthMethod"] = method
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sm = cv2.resize(lum, (1000, int(1000 * h / w)))
    info.update({"file": f"media/photos/{mid}.jpg", "thumb": f"media/thumbs/{mid}.jpg", "w": w, "h": h,
                 "aspect": round(w / h, 3), "brightness": round(float(lum.mean()) / 255, 3),
                 "sharpness": round(float(cv2.Laplacian(sm, cv2.CV_64F).var()), 1),
                 "focus": focus_point(img), "dhash": dhash(img)})
    return info


def process_clip(f, mid):
    pr = probe(f)
    v = next((s for s in pr.get("streams", []) if s.get("codec_type") == "video"), None)
    if not v:
        return None
    hdr = v.get("color_transfer") in {"arib-std-b67", "smpte2084"}
    out = MEDIA / "clips" / f"{mid}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    chain = []
    if hdr:
        chain.append("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p")
    chain += ["scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)':flags=lanczos", "fps=30", "format=yuv420p"]
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(f), "-vf", ",".join(chain), "-an", "-c:v", "libx264", "-preset", "fast",
                    "-crf", "18", "-g", "10", "-bf", "0", "-movflags", "+faststart", str(out)], check=True)
    po = probe(out)
    vs = next(s for s in po["streams"] if s.get("codec_type") == "video")
    dur = float(po["format"]["duration"])
    thumb = MEDIA / "thumbs" / f"{mid}.jpg"
    thumb.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{dur / 2:.2f}", "-i", str(out), "-frames:v", "1", "-vf", "scale=360:-2", str(thumb)], check=True)
    return {"kind": "video", "src": str(f), "file": f"media/clips/{mid}.mp4", "thumb": f"media/thumbs/{mid}.jpg",
            "w": int(vs["width"]), "h": int(vs["height"]), "aspect": round(int(vs["width"]) / int(vs["height"]), 3), "dur": round(dur, 3), "hdr": hdr}


def contact_sheet(media):
    ids = [k for k in media if not k.startswith("_")]
    if not ids:
        return
    cols, tw, th = 6, 300, 340
    rows = (len(ids) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (18, 20, 24))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
        small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    except Exception:
        font = small = ImageFont.load_default()
    for i, mid in enumerate(ids):
        m = media[mid]
        im = Image.open(PROJ / m["thumb"]).convert("RGB")
        im.thumbnail((tw - 16, th - 70))
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.paste(im, (x + (tw - im.width) // 2, y + 8))
        draw.text((x + 10, y + th - 58), mid, fill=(46, 230, 255), font=font)
        note = f"{m['kind']} {m['w']}x{m['h']}" + (f" {m['dur']:.1f}s" if m["kind"] == "video" else f" L{m['brightness']:.2f}")
        if m.get("dupOf"):
            note += f" ~{m['dupOf']}"
        draw.text((x + 10, y + th - 26), note, fill=(200, 200, 200), font=small)
    ANALYSIS.mkdir(exist_ok=True)
    sheet.save(ANALYSIS / "media-sheet.jpg", quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-enhance", action="store_true")
    ap.add_argument("--no-straighten", action="store_true")
    ap.add_argument("--no-depth", action="store_true")
    ap.add_argument("--no-upscale", action="store_true")
    ap.add_argument("--only", help="comma-separated media ids to redo")
    args = ap.parse_args()

    src, files = sources()
    media = load("media.json", {})
    by_src = {m["src"]: k for k, m in media.items() if not k.startswith("_")}
    counters = {"p": 0, "c": 0}
    for k in media:
        if re.match(r"^[pc]\d+$", k):
            counters[k[0]] = max(counters[k[0]], int(k[1:]))
    only = set(args.only.split(",")) if args.only else None
    extras = {}
    for f in files:
        ext = f.suffix.lower()
        if SPECIAL.match(f.stem) and ext in PHOTO_EXT:
            kind = "logo" if re.match(r"^(logo|brand)", f.stem, re.I) else "agent"
            dst = MEDIA / f"{kind}{'.png' if kind == 'logo' else '.jpg'}"
            dst.parent.mkdir(parents=True, exist_ok=True)
            img = read_photo(f)
            if kind == "logo" and ext == ".png":
                shutil.copyfile(f, dst)
            else:
                cv2.imwrite(str(dst), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
            extras[kind] = f"media/{dst.name}"
            log(f"{kind}: {f.name} -> {dst.name}")
            continue
        if ext not in PHOTO_EXT | VIDEO_EXT:
            continue
        kind = "p" if ext in PHOTO_EXT else "c"
        mid = by_src.get(str(f))
        if not mid:
            counters[kind] += 1
            mid = f"{kind}{counters[kind]:02d}"
        if only and mid not in only:
            continue
        if mid in media and not only and (PROJ / media[mid]["file"]).exists():
            continue
        log(f"{mid}: {f.relative_to(src)}")
        info = process_photo(f, mid, args, media.get(mid)) if kind == "p" else process_clip(f, mid)
        if info:
            media[mid] = info
    # near-duplicate photos (same angle shot twice)
    photos = [k for k, m in media.items() if not k.startswith("_") and m["kind"] == "photo"]
    for i, a in enumerate(photos):
        media[a].pop("dupOf", None)
        for b in photos[:i]:
            if bin(media[a]["dhash"] ^ media[b]["dhash"]).count("1") <= 10:
                media[a]["dupOf"] = b
                break
    media["_extras"] = {**media.get("_extras", {}), **extras}
    save("media.json", dict(sorted(media.items(), key=lambda kv: (kv[0].startswith("_"), kv[0]))))
    contact_sheet({k: v for k, v in media.items() if not k.startswith("_")})
    n_p = sum(1 for k in media if k.startswith("p"))
    n_c = sum(1 for k in media if k.startswith("c"))
    log(f"media.json: {n_p} photos, {n_c} clips; extras {media['_extras']}; sheet analysis/media-sheet.jpg")
    for k, m in media.items():
        if k.startswith("_"):
            continue
        flags = []
        if m.get("dupOf"):
            flags.append(f"near-duplicate of {m['dupOf']}")
        if m["kind"] == "photo" and m["brightness"] < 0.32:
            flags.append("dark")
        if m["kind"] == "photo" and m["sharpness"] < 40:
            flags.append("soft/blurry")
        if m["kind"] == "photo" and max(m.get("srcW", m["w"]), m.get("srcH", m["h"])) < 1400:
            flags.append(f"low resolution source ({m.get('srcW')}x{m.get('srcH')}" + (", AI upscaled x4)" if m.get("upscaled") else ")"))
        if flags:
            log(f"  {k}: {', '.join(flags)}")


if __name__ == "__main__":
    main()
