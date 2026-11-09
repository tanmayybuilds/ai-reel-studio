"""Change the motion-graphics accent colour of the reel template (or of one project).

The accent is the colour of hero words, tiles, tickers, send buttons and glows. It lives as hex and rgba
values in storyboard/style.css and motion.js, plus a tone name ("cyan") used in storyboard.json and make_sfx.py.
This script swaps all of them in one pass and records the result in storyboard/accent.json, so it can be run
again later to change colour again.

Usage, from the studio folder:
  python .claude/skills/talking-head-reel/scripts/set_accent.py --preset lime
  python .claude/skills/talking-head-reel/scripts/set_accent.py --hex "#FF5FA2" --name pink
  python .claude/skills/talking-head-reel/scripts/set_accent.py --preset amber --target "Raw/<Video>/Edit"
  python .claude/skills/talking-head-reel/scripts/set_accent.py --list
--target defaults to the skill template, so every new project starts in the new colour.
--hex builds the full palette (light, main, deep, on-white stops, ink, glass darks) from one main colour.

Presets are palettes that shipped on real reels: cyan (the template default), amber and lime.
Keep red (danger) and green (success) free: an accent close to either is rejected unless --force is given.
"""
import argparse, colorsys, json, re
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
SLOTS = ["light", "light2", "main", "mid", "deep", "white1", "white2", "white3", "ink", "ink2",
         "dark1", "dark2", "dark3", "bg"]
RGBA = ["mainRgb", "deepRgb", "glass1", "glass2", "shadow"]  # stored as "r, g, b"

PRESETS = {
    "cyan": {  # Muse reel, 5 Nov 2026 (the template ships in this colour)
        "light": "#b8f6ff", "light2": "#7aeeff", "main": "#2ee6ff", "mid": "#12c4f5", "deep": "#0098e6",
        "white1": "#00b4e0", "white2": "#0077b6", "white3": "#00508a", "ink": "#00222e", "ink2": "#00476b",
        "dark1": "#0d3b55", "dark2": "#081c28", "dark3": "#04212f", "bg": "#0c1820",
        "mainRgb": "46, 230, 255", "deepRgb": "0, 152, 230", "glass1": "14, 28, 38", "glass2": "5, 10, 14", "shadow": "0, 14, 24"},
    "lime": {  # Abliterated-model reel, 7 Nov 2026
        "light": "#efffb8", "light2": "#ddff7a", "main": "#c6ff3a", "mid": "#a8f01a", "deep": "#6fcf00",
        "white1": "#74c400", "white2": "#4a8f00", "white3": "#2f6200", "ink": "#172400", "ink2": "#3a5c00",
        "dark1": "#2c4a05", "dark2": "#121c04", "dark3": "#142104", "bg": "#121a08",
        "mainRgb": "198, 255, 58", "deepRgb": "111, 207, 0", "glass1": "22, 30, 12", "glass2": "8, 11, 4", "shadow": "10, 16, 0"},
    "amber": {  # Whitestair and Handy reels, 3-5 Nov 2026
        "light": "#ffd98a", "light2": "#ffcf6e", "main": "#ffb52e", "mid": "#ff9a1e", "deep": "#ff7a00",
        "white1": "#ffab1f", "white2": "#f07800", "white3": "#b34700", "ink": "#1c0f00", "ink2": "#7a3a00",
        "dark1": "#553a0d", "dark2": "#281c08", "dark3": "#2f2104", "bg": "#1e160d",
        "mainRgb": "255, 181, 46", "deepRgb": "255, 122, 0", "glass1": "42, 30, 18", "glass2": "14, 10, 6", "shadow": "24, 12, 0"},
}
RESERVED = {"red", "green", "white", "dark", "light"}


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c))):02x}" for c in rgb)


def hls(h):
    r, g, b = (c / 255 for c in hex_to_rgb(h))
    return colorsys.rgb_to_hls(r, g, b)


def from_main(main):
    """Build a palette by rotating every cyan slot onto the new hue, keeping its lightness and saturation."""
    base = PRESETS["cyan"]
    h0 = hls(base["main"])[0]
    h1, l1, s1 = hls(main)
    shift = h1 - h0

    def rot(hexv, keep_main=False):
        h, l, s = hls(hexv)
        if keep_main:
            return main.lower()
        s = min(1, s * (s1 / max(hls(base["main"])[2], 1e-6))) if s1 < .6 else s  # muted mains give muted stops
        return rgb_to_hex(c * 255 for c in colorsys.hls_to_rgb((h + shift) % 1, l, s))

    pal = {k: rot(base[k], k == "main") for k in SLOTS}
    for k in RGBA:
        rgb = tuple(int(x) for x in base[k].split(","))
        pal[k] = ", ".join(str(c) for c in hex_to_rgb(rot(rgb_to_hex(rgb))))
    pal["mainRgb"] = ", ".join(str(c) for c in hex_to_rgb(pal["main"]))
    pal["deepRgb"] = ", ".join(str(c) for c in hex_to_rgb(pal["deep"]))
    return pal


def too_close_to_signal(main):
    h = hls(main)[0] * 360
    return h < 12 or h > 340 or 125 < h < 160  # red (danger) or the success green


def swap_map(old, new, old_name, new_name):
    m = {}
    for k in SLOTS:
        m[old[k].lower()] = new[k].lower()
    for k in ("mainRgb", "deepRgb", "glass1", "glass2"):
        m[f"rgba({old[k]},"] = f"rgba({new[k]},"
    m[f"rgba({old['shadow']}, .7)"] = f"rgba({new['shadow']}, .7)"
    if old_name != new_name:
        for pat in ("--{}-deep", "--{}", ".hero.{}", ".duo-card.{}", ".burst .{}", "'{}'", '"{}"', "{} accent", "the {} accent"):
            m[pat.format(old_name)] = pat.format(new_name)
        m[old_name.capitalize() + " accent"] = new_name.capitalize() + " accent"
    return m


def apply(text, mapping):
    keys = sorted(mapping, key=len, reverse=True)
    rx = re.compile("|".join(re.escape(k) for k in keys), re.IGNORECASE)

    def sub(mo):
        hit = mo.group(0)
        return mapping.get(hit) or mapping.get(hit.lower()) or next(v for k, v in mapping.items() if k.lower() == hit.lower())
    return rx.sub(sub, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", choices=sorted(PRESETS))
    ap.add_argument("--hex", help="main accent colour, e.g. #FF5FA2")
    ap.add_argument("--name", help="tone name used in storyboard.json, e.g. pink (default: the preset name)")
    ap.add_argument("--target", default=str(SKILL / "template"), help="template folder or a project's Edit folder")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    target = Path(args.target).resolve()
    state_file = target / "storyboard" / "accent.json"
    state = json.loads(state_file.read_text(encoding="utf8")) if state_file.exists() else {"name": "cyan", "palette": PRESETS["cyan"]}
    if args.list:
        print("current:", state["name"], state["palette"]["main"], "in", target)
        for k, v in PRESETS.items():
            print(f"preset  {k:6} {v['main']}")
        return
    if not (args.preset or args.hex):
        raise SystemExit("give --preset or --hex (see --list)")

    if args.preset:
        new, name = PRESETS[args.preset], args.name or args.preset
    else:
        if not re.fullmatch(r"#?[0-9a-fA-F]{6}", args.hex):
            raise SystemExit("--hex must look like #FF5FA2")
        main_hex = "#" + args.hex.lstrip("#").lower()
        if too_close_to_signal(main_hex) and not args.force:
            raise SystemExit("that colour is close to the red (danger) or green (success) signal colours; pick another or pass --force")
        new, name = from_main(main_hex), (args.name or "accent")
    name = re.sub(r"[^a-z0-9]", "", name.lower())
    if not name or name in RESERVED:
        raise SystemExit(f"--name must be a single word and not one of {sorted(RESERVED)}")

    mapping = swap_map(state["palette"], new, state["name"], name)
    files = [target / "storyboard" / f for f in ("style.css", "motion.js", "app.js", "index.html")]
    files += [target / "scripts" / "make_sfx.py", target / "storyboard.json", target / "scripts" / "build_storyboard.py"]
    changed = []
    for f in files:
        if f.exists():
            text = f.read_bytes().decode("utf8")  # bytes keep the file's own line endings
            out = apply(text, mapping)
            if state["name"] != name and f.suffix in (".css", ".js"):
                # Every tone class (.hero.cyan, .chart-card.cyan, .counter.cyan, ...) follows the new name.
                out = re.sub(rf"\.{re.escape(state['name'])}\b", f".{name}", out)
            if out != text:
                f.write_bytes(out.encode("utf8"))
                changed.append(f.name)
    state_file.write_text(json.dumps({"name": name, "palette": new}, indent=2), encoding="utf8")
    print(f"accent {state['name']} -> {name} ({new['main']}) in {target}")
    print("changed:", ", ".join(changed) or "nothing")
    print("next: update the Colour table in Brand Kit/brand-kit.md and look at a QA sheet; generated palettes are a starting point")


if __name__ == "__main__":
    main()
