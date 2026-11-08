"""Where the studio's tools live on this machine (Windows, macOS or Linux).

The installer (setup/install.ps1 or setup/install.sh) writes Tools/paths.json. Every script reads it through
these helpers and falls back to the usual install locations when a key is missing, so nothing hardcodes
`.exe` names or `C:/` paths.
"""
import json, os, platform, shutil
from pathlib import Path

WINDOWS = platform.system() == "Windows"
MAC = platform.system() == "Darwin"


def studio_root(start=None):
    """The studio folder: the nearest parent that has both Tools/ and Raw/."""
    here = Path(start or Path.cwd()).resolve()
    for p in [here, *here.parents]:
        if (p / "Tools").is_dir() and (p / "Raw").is_dir():
            return p
    return None


def _paths_json(studio):
    f = Path(studio) / "Tools" / "paths.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8-sig"))
        except ValueError:
            return {}
    return {}


def _first(candidates):
    for c in candidates:
        if c and Path(c).exists():
            return Path(c)
    return None


def whisper_cli(studio):
    p = _paths_json(studio).get("whisper")
    tools = Path(studio) / "Tools"
    return _first([
        p,
        tools / "whisper.cpp" / "Release" / "whisper-cli.exe",       # Windows release zip
        tools / "whisper.cpp" / "build" / "bin" / "whisper-cli",     # Linux/macOS source build
        shutil.which("whisper-cli"),                                  # Homebrew (macOS) or on PATH
    ]) or (tools / "whisper.cpp" / "Release" / ("whisper-cli.exe" if WINDOWS else "whisper-cli"))


def model(studio, name="ggml-small-q5_1.bin"):
    return Path(studio) / "Tools" / "models" / name


def venv_python(studio):
    v = Path(studio) / "Tools" / "vision-venv"
    return v / "Scripts" / "python.exe" if WINDOWS else v / "bin" / "python"


def chrome(studio=None):
    p = _paths_json(studio).get("chrome") if studio else None
    local = os.environ.get("LOCALAPPDATA", "")
    found = _first([
        p,
        os.environ.get("CHROME_PATH"),
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        f"{local}/Google/Chrome/Application/chrome.exe" if local else None,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome"), shutil.which("google-chrome-stable"),
        shutil.which("chromium"), shutil.which("chromium-browser"),
    ])
    return found  # Chrome for Testing installed by the setup script is recorded in Tools/paths.json


def font_dirs():
    home = Path.home()
    return [Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts",
            Path(os.environ.get("LOCALAPPDATA", home)) / "Microsoft" / "Windows" / "Fonts",
            Path("/System/Library/Fonts/Supplemental"), Path("/System/Library/Fonts"), Path("/Library/Fonts"), home / "Library" / "Fonts",
            Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), home / ".fonts", home / ".local" / "share" / "fonts"]
