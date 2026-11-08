"""Render the A-roll scenes: speaker matte, dark studio set, desk, tracked camera, blur-in on cuts.

Usage: render_scene.py [--height 1280] [--only beat-03]
Storyboard previews use 1280 (720x1280). The final render needs --height 1920.
Camera moves come from storyboard.json. Captions and graphics stay in the HTML layer.
"""
import argparse, subprocess

import cv2
import mediapipe as mp
import numpy as np

from project import CONFIG, FPS, MEDIA, concat_scenes, load, resolve

SOURCE = resolve(CONFIG["source"])
SW, SH = CONFIG["sourceSize"]


def read_frames(start_frame, count):
    cmd = ["ffmpeg", "-loglevel", "error", "-ss", f"{start_frame / FPS:.4f}", "-i", str(SOURCE),
           "-frames:v", str(count), "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = SW * SH * 3
    for _ in range(count):
        data = proc.stdout.read(size)
        if len(data) < size:
            break
        yield np.frombuffer(data, np.uint8).reshape(SH, SW, 3)
    proc.stdout.close()
    proc.wait()


class Matte:
    """Clean-plate difference for crisp edges; selfie segmentation decides what counts as the person.
    Without a clean plate it falls back to segmentation alone, which is softer at the hair and shoulders."""

    def __init__(self):
        self.seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0)
        self.plate = None
        if CONFIG.get("cleanPlate") is not None:
            # cleanPlateSpan: how many frames the empty-room run really lasts (default 40, sampled every 13).
            frames = list(read_frames(int(CONFIG["cleanPlate"] * FPS), CONFIG.get("cleanPlateSpan", 40)))[::13]
            plate = np.median(frames, axis=0).astype(np.uint8)
            if CONFIG.get("talkPlate"):
                plate = self.talk_plate(plate)
            self.plate = cv2.cvtColor(cv2.GaussianBlur(plate, (0, 0), 1.2), cv2.COLOR_BGR2LAB).astype(np.int16)

    def talk_plate(self, empty_room):
        """The room as it really is during the talk: per pixel, the median of talk frames where the speaker isn't.
        Needed when furniture moved after the empty-room frames. Pixels the speaker always covers keep the empty room."""
        times = np.linspace(4, CONFIG["sourceDuration"] - 4, 18)
        stack, seen = [], []
        for t in times:
            frame = next(read_frames(int(t * FPS), 1))
            person = self.seg.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).segmentation_mask > .1
            seen.append(cv2.dilate(person.astype(np.uint8), np.ones((61, 61), np.uint8)) == 0)
            stack.append(frame)
        stack, seen = np.array(stack), np.array(seen)
        talk = np.zeros(empty_room.shape, np.float32)
        ok = np.zeros(empty_room.shape[:2], bool)
        for y in range(0, SH, 120):  # in bands, so the float stack stays small
            band = stack[:, y:y + 120].astype(np.float32)
            band[~seen[:, y:y + 120]] = np.nan
            with np.errstate(all="ignore"):
                talk[y:y + 120] = np.nanmedian(band, axis=0)
            ok[y:y + 120] = ~np.isnan(talk[y:y + 120]).any(2)
        # The camera's exposure shifts once someone sits down, so match the empty room to the talk before filling.
        gain = np.median(talk[ok], axis=0) / np.maximum(np.median(empty_room[ok].astype(np.float32), axis=0), 1)
        plate = np.clip(empty_room * gain, 0, 255)
        plate[ok] = talk[ok]
        plate = plate.astype(np.uint8)
        cv2.imwrite(str(MEDIA.parent / "analysis" / "talk-plate.jpg"), plate)
        return plate

    def __call__(self, frame):
        coarse = self.seg.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).segmentation_mask
        if self.plate is None:
            return cv2.GaussianBlur(np.clip((coarse - .35) / .4, 0, 1).astype(np.float32), (0, 0), 1.5)
        lab = cv2.cvtColor(cv2.GaussianBlur(frame, (0, 0), 1.2), cv2.COLOR_BGR2LAB).astype(np.int16)
        # A lower lightness weight (matteWeights in project.json) stops wall shadows reading as the person.
        diff = (np.abs(lab - self.plate) * np.array(CONFIG.get("matteWeights", [.45, 1.2, 1.2]))).sum(2)
        diff = np.clip((diff - 13) / 16, 0, 1).astype(np.float32)
        region = cv2.dilate((coarse > .15).astype(np.uint8), np.ones((41, 41), np.uint8)).astype(np.float32)
        core = cv2.erode((coarse > .85).astype(np.uint8), np.ones((31, 31), np.uint8)).astype(np.float32)
        m = np.maximum(diff * region, core)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        # Clothes close to the wall colour leave holes; anything enclosed by the outline is the person.
        contours, _ = cv2.findContours((m > .5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        solid = np.zeros(m.shape, np.uint8)
        cv2.drawContours(solid, [c for c in contours if cv2.contourArea(c) > 4000], -1, 1, -1)
        m = np.maximum(m, cv2.erode(solid, np.ones((5, 5), np.uint8)).astype(np.float32))
        # Drop floating specks (switchboard and whiteboard edges): keep only islands at least hand-sized.
        count, labels, stats, _ = cv2.connectedComponentsWithStats((m > .25).astype(np.uint8), connectivity=8)
        keep = np.zeros(count, bool)
        keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 6000
        m = m * keep[labels]
        return cv2.GaussianBlur(cv2.erode(m, np.ones((3, 3), np.uint8)), (0, 0), 1.1)


def guided(guide, src, r, eps):
    """He et al. guided filter (grey guide): src's edges snap to the edges in guide."""
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mi, mp_ = box(guide), box(src)
    a = (box(guide * src) - mi * mp_) / (box(guide * guide) - mi * mi + eps)
    b = mp_ - a * mi
    return box(a) * guide + box(b)


class MatteV3:
    """Segmentation-led matte (Whitestair, 4 Nov 2026). The clean-plate difference leaked wherever the room
    resembled the speaker (white sleeve on a pale pink wall, switchboard edges by the hair), so here:
      1. selfie segmentation runs on a crop around the speaker (matteCrop), for more mask detail;
      2. a guided filter on the frame snaps the soft mask to real image edges (hair, sleeves);
      3. thin protrusions and floating specks are opened away;
      4. a light temporal blend (reset at every cut) stops the edge from shimmering."""

    def __init__(self):
        self.seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0)
        self.crop = CONFIG.get("matteCrop", [0, 0, SW, SH])
        self.prev = None

    def reset(self):
        self.prev = None

    def __call__(self, frame):
        x0, y0, x1, y1 = self.crop
        coarse = np.zeros((SH, SW), np.float32)
        part = cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2RGB)
        coarse[y0:y1, x0:x1] = self.seg.process(part).segmentation_mask
        if self.prev is not None:
            coarse = coarse * .7 + self.prev * .3
        self.prev = coarse
        soft = np.clip((coarse - .3) / .4, 0, 1).astype(np.float32)
        # Guided filter at half size: fast, and the radius still reaches across a hair-width of error.
        g = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (SW // 2, SH // 2)).astype(np.float32) / 255
        s = cv2.resize(soft, (SW // 2, SH // 2))
        refined = cv2.resize(guided(g, s, 6, 4e-3), (SW, SH))
        alpha = np.clip((refined - .2) / .6, 0, 1).astype(np.float32)
        # Cut thin spikes (a few px wide) and specks, then keep only body-sized islands.
        solid = cv2.morphologyEx((alpha > .5).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
        keep = np.zeros(count, bool)
        keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 6000
        solid = keep[labels].astype(np.uint8)
        # Fill enclosed holes (shirt patches close to the wall colour).
        contours, _ = cv2.findContours(solid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filled = np.zeros_like(solid)
        cv2.drawContours(filled, contours, -1, 1, -1)
        allowed = cv2.dilate(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(np.float32)
        alpha = np.maximum(alpha * allowed, cv2.erode(filled, np.ones((9, 9), np.uint8)).astype(np.float32))
        # Choke the edge ~2 px so no pale wall fringe rides along the sleeves.
        alpha = cv2.erode(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        return cv2.GaussianBlur(alpha, (0, 0), 1.0)


def build_set(w, h):
    """Procedural dark shelf wall with a gold LED line, kept out of focus like the reference set.
    Colours are BGR and follow Brand Kit/brand-kit.md; change them here when the brand kit changes."""
    k = h / 1920
    s = np.zeros((h, w, 3), np.float32)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    s += np.array([10, 13, 17], np.float32) * (1.25 - yy * .7)
    for x in (.16, .47, .81):  # shelf uprights
        cv2.rectangle(s, (int(x * w), 0), (int(x * w + 34 * k), h), (5, 6, 8), -1)
    for y, power in ((.205, 1.0), (.545, .42)):  # shelf lines, top one lit
        y0 = int(y * h)
        cv2.rectangle(s, (0, y0 - int(150 * k)), (w, y0), (7, 9, 12), -1)
        cv2.rectangle(s, (0, y0), (w, y0 + int(7 * k)), (150 * power, 215 * power, 255 * power), -1)
        cone = np.exp(-(((yy - y - .05) / .085) ** 2)) * (yy >= y)
        s += cone * np.array([24, 52, 88], np.float32) * power
    for x, y, rw, rh in ((.1, .47, 76, 104), (.92, .47, 58, 128)):  # vases on the shelf
        cv2.ellipse(s, (int(x * w), int(y * h)), (int(rw * k), int(rh * k)), 0, 0, 360, (24, 46, 70), -1)
    s = cv2.GaussianBlur(s, (0, 0), 7 * k)
    xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :, None]
    return s * (1 - .55 * xx ** 2)


def room_backdrop(frame, face, w, h):
    """The real room, cover-scaled, heavily blurred and darkened: a portrait-mode background.
    Used when bgMode is "blur" in project.json, because matte errors over the same room are invisible.
    frame is the empty room (analysis/talk-plate.jpg), never the live frame, or the speaker's own blur ghosts behind him."""
    s = max(w / SW, h / SH) * 1.04
    sw, sh = int(SW * s), int(SH * s)
    x0 = int(np.clip(face[0] * s - w / 2, 0, sw - w))
    small = cv2.resize(frame, (sw // 6, sh // 6), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 7)
    room = cv2.resize(small, (sw, sh), interpolation=cv2.INTER_LINEAR)[(sh - h) // 2:(sh - h) // 2 + h, x0:x0 + w].astype(np.float32)
    # Darker and a little desaturated, so white captions and cards stay readable on it.
    grey = room.mean(2, keepdims=True)
    room = (grey + (room - grey) * .75) * .58
    xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :, None]
    yy = np.linspace(-1, 1, h, dtype=np.float32)[:, None, None]
    room *= 1 - .35 * (xx ** 2 + .6 * yy ** 2)
    pad = cv2.resize(room, (int(w * 1.3), int(h * 1.3)))  # same headroom compose() gives the set
    return pad


def build_desk(w, h):
    """Glossy dark desk; its top edge hides the bottom of the camera frame."""
    k = h / 1920
    d = np.zeros((h, w, 4), np.float32)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    d[..., 0], d[..., 1], d[..., 2] = 12 + 8 * (1 - yy) ** 3, 18 + 15 * (1 - yy) ** 3, 26 + 28 * (1 - yy) ** 3
    xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
    d[:int(70 * k), :, :3] += (np.exp(-(xx / .55) ** 2) * 26)[..., None] * np.array([.5, .8, 1.2], np.float32)
    d[:int(3 * k) + 1, :, :3] = (48, 74, 104)
    d[..., 3] = 1
    return d


def ease(p):
    p = np.clip(p, 0, 1)
    return 4 * p ** 3 if p < .5 else 1 - (-2 * p + 2) ** 3 / 2


def zoom_at(t, keys):
    """keys: [[time, zoom, transition_seconds]]; each key eases in over its transition."""
    z = keys[0][1]
    for at, target, dur in keys[1:]:
        if t >= at:
            z = z + (target - z) * ease((t - at) / max(dur, .01))
    return z


def compose(frame, m, z, face, backdrop, desk, w, h, rim=True, face_at=None, room=None):
    k = h / 1920
    s = z * h / SH
    face_y = (face_at or 640 - 70 * (z - .64)) * k  # face sits in the upper third, like the reference
    tx = w / 2 - face[0] * s
    ty = face_y - face[1] * s
    if room is not None:
        # Video-call style: the live frame itself, lightly blurred, at exactly the speaker's scale and place.
        # A thin band around the speaker is swapped for the empty room first, so no blurred copy of him
        # haloes his edges. Canvas the camera never covered (above the frame) gets a softer, feathered fill.
        # Masked (normalised) blur: only wall pixels are averaged, so his colours never bleed into a halo.
        person_px = cv2.dilate((m > .05).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
        wall = cv2.resize(1 - person_px.astype(np.float32), (SW // 2, SH // 2), interpolation=cv2.INTER_AREA)[..., None]
        half = cv2.resize(frame, (SW // 2, SH // 2), interpolation=cv2.INTER_AREA).astype(np.float32)
        sig = CONFIG.get("bgBlur", 4) / 2
        num, den = cv2.GaussianBlur(half * wall, (0, 0), sig), cv2.GaussianBlur(wall, (0, 0), sig)[..., None]
        wide_num, wide_den = cv2.GaussianBlur(half * wall, (0, 0), 30), cv2.GaussianBlur(wall, (0, 0), 30)[..., None]
        near = num / np.maximum(den, 1e-3)
        wide = wide_num / np.maximum(wide_den, 1e-3)
        mix = np.clip(den / .25, 0, 1)  # where little wall is nearby, use the wider average
        soft = cv2.resize(near * mix + wide * (1 - mix), (SW, SH))
        src = frame
        a = np.float32([[s, 0, tx], [0, s, ty]])
        inside = cv2.warpAffine(soft, a, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        valid = cv2.warpAffine(np.ones((SH, SW), np.float32), a, (w, h), flags=cv2.INTER_LINEAR)
        valid = cv2.GaussianBlur(cv2.erode(valid, np.ones((9, 9), np.uint8)), (0, 0), 40 * k)[..., None]
        cover = max(h / SH, w / SW) * 1.05
        c = np.float32([[cover, 0, w / 2 - face[0] * cover], [0, cover, face_y - face[1] * cover]])
        far = cv2.resize(cv2.GaussianBlur(wide, (0, 0), 6), (SW, SH))  # wall-only, so his hair never smears into it
        fill = cv2.warpAffine(far, c, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        out = inside * valid + fill * (1 - valid)
        person = cv2.warpAffine(frame, a, (w, h), flags=cv2.INTER_LANCZOS4).astype(np.float32)
        alpha = cv2.warpAffine(m, a, (w, h), flags=cv2.INTER_LINEAR)[..., None]
        out = out * (1 - alpha) + person * alpha
        desk_y = int(ty + (SH - 40) * s)
        if desk_y < h:
            visible = desk[:h - desk_y]
            out[desk_y:h] = out[desk_y:h] * (1 - visible[..., 3:]) + visible[..., :3] * visible[..., 3:]
        return np.clip(out, 0, 255).astype(np.uint8)
    # Backdrop drifts less than the speaker, which reads as depth.
    bs = 1 + .22 * (z - .64)
    bh, bw = backdrop.shape[:2]
    bm = np.float32([[bs, 0, (w - bw * bs) / 2 + (face[0] - SW * .48) * .05], [0, bs, (h - bh * bs) * .3]])
    out = cv2.warpAffine(backdrop, bm, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    a = np.float32([[s, 0, tx], [0, s, ty]])
    person = cv2.warpAffine(frame, a, (w, h), flags=cv2.INTER_LANCZOS4).astype(np.float32)
    alpha = cv2.warpAffine(m, a, (w, h), flags=cv2.INTER_LINEAR)[..., None]
    # Grade: warmer, a little more contrast, and pulls down coloured wall bounce.
    person = np.clip((person - 128) * 1.09 + 124, 0, 255) * np.array([.93, .97, 1.03], np.float32)
    if rim:
        inner = cv2.GaussianBlur(alpha, (0, 0), 7 * k)[..., None]
        edge = np.clip(alpha - inner, 0, 1) * np.exp(-((np.arange(h, dtype=np.float32)[:, None, None] / h - .25) / .3) ** 2)
        person = person + edge * np.array([60, 135, 210], np.float32)
    out = out * (1 - alpha) + person * alpha

    desk_y = int(ty + (SH - 40) * s)
    if desk_y < h:
        visible = desk[:h - desk_y]
        region = out[desk_y:h]
        out[desk_y:h] = region * (1 - visible[..., 3:]) + visible[..., :3] * visible[..., 3:]
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--height", type=int, default=1280)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    h, w = args.height, args.height * 9 // 16

    plan = load("edit-plan.json")
    board = load("storyboard.json")["beats"]
    camera = {b["id"]: b["camera"] for b in board}
    face_at = {b["id"]: b.get("faceY") for b in board}
    blur_points = {b["id"]: ([] if b.get("noBlur") else [0]) + b.get("blurAt", []) for b in board}
    track = load("analysis/face-track.json")
    known = [(p["t"], p["cx"], p["cy"]) for p in track if p["cx"]]
    ts, cxs, cys = (np.array(v, float) for v in zip(*known))

    matte = MatteV3() if CONFIG.get("matte") == "v3" else Matte()
    backdrop = build_set(int(w * 1.3), int(h * 1.3))  # room for the backdrop to scale
    desk = build_desk(w, h)
    MEDIA.mkdir(exist_ok=True)
    room = None
    if CONFIG.get("bgMode") == "room":
        # Empty room during the talk: patches the band around the speaker before the live frame is blurred.
        plate_file = MEDIA.parent / "analysis" / "talk-plate.jpg"
        if not plate_file.exists():
            # Only the older Matte writes the plate; a fresh project on MatteV3 would otherwise fall back to the dark set silently.
            CONFIG["talkPlate"] = True
            Matte()
        room = cv2.imread(str(plate_file))
        if room is None:
            raise SystemExit("bgMode is room but analysis/talk-plate.jpg could not be built")

    for beat in plan["beats"]:
        if args.only and beat["id"] not in args.only.split(","):
            continue
        name = MEDIA / f"{beat['id']}-scene.mp4"
        audio = ["-ss", str(beat["start"]), "-t", str(beat["duration"]), "-i", str(MEDIA / "dialogue-master.wav")]
        enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
                                *audio, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                                "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", "-shortest", str(name)], stdin=subprocess.PIPE)
        index = 0
        for src_in, count in beat["frames"]:
            # A median face position per piece keeps the frame from wandering with small head moves.
            span = np.linspace(src_in / FPS, (src_in + count) / FPS, 9)
            face = (float(np.median(np.interp(span, ts, cxs))), float(np.median(np.interp(span, ts, cys))))
            if hasattr(matte, "reset"):
                matte.reset()  # no temporal blend across a cut
            back = backdrop
            for frame in read_frames(src_in, count):
                t = index / FPS
                img = compose(frame, matte(frame), zoom_at(t, camera[beat["id"]]), face, back, desk, w, h,
                              face_at=face_at[beat["id"]], room=room)
                for point in blur_points[beat["id"]]:  # the reference opens every cut slightly out of focus
                    if 0 <= t - point < .28:
                        img = cv2.GaussianBlur(img, (0, 0), (1 - (t - point) / .28) ** 1.5 * 22 * h / 1920 + .01)
                enc.stdin.write(img.tobytes())
                index += 1
        enc.stdin.close()
        enc.wait()
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(min(.6, beat["duration"] / 2)), "-i", str(name), "-frames:v", "1", "-q:v", "3", str(MEDIA / f"{beat['id']}.jpg")], check=True)
        print(beat["id"], index, "frames", flush=True)
    if concat_scenes():
        print("rough cut: media/rough-cut.mp4")


if __name__ == "__main__":
    main()
