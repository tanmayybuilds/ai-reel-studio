#!/usr/bin/env bash
# Installs everything the AI reel studio needs on macOS (Homebrew) or Debian/Ubuntu Linux (apt).
# Safe to re-run: finished steps are skipped. Run from the studio folder (the repo root):
#   bash setup/install.sh [--skip-system] [--with-remotion] [--base-model]
# NOTE: written to mirror setup/install.ps1, which is the tested path. Report problems in the repo's issues.
set -euo pipefail

SKIP_SYSTEM=0; WITH_REMOTION=0; BASE_MODEL=0
for a in "$@"; do
  case "$a" in
    --skip-system) SKIP_SYSTEM=1 ;;
    --with-remotion) WITH_REMOTION=1 ;;
    --base-model) BASE_MODEL=1 ;;
    *) echo "unknown option $a"; exit 2 ;;
  esac
done

STUDIO="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$STUDIO/Tools"
OS="$(uname -s)"; ARCH="$(uname -m)"
cd "$STUDIO"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok() { printf '    \033[32mok\033[0m  %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
json() { python3 -c "import json,sys; d=json.load(open('$STUDIO/setup/versions.json')); print(eval(sys.argv[1]))" "$1"; }

sha256() { if have sha256sum; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
get_verified() {  # url dest sha
  if [ -f "$2" ] && [ "$(sha256 "$2")" = "$3" ]; then ok "$(basename "$2") (already here, hash ok)"; return; fi
  echo "    downloading $1"
  curl -fL --retry 3 -o "$2.part" "$1"
  local got; got="$(sha256 "$2.part")"
  if [ "$got" != "$3" ]; then rm -f "$2.part"; echo "SHA-256 mismatch for $1 (got $got)"; exit 1; fi
  mv "$2.part" "$2"; ok "$(basename "$2") (hash ok)"
}

find_python() {
  for v in 3.11 3.12 3.10; do
    if have "python$v"; then command -v "python$v"; return; fi
  done
  if have python3 && python3 -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)'; then command -v python3; return; fi
}

find_chrome() {
  for p in "${CHROME_PATH:-}" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    [ -n "$p" ] && [ -x "$p" ] && { echo "$p"; return; }
  done
  for c in google-chrome google-chrome-stable chromium chromium-browser; do have "$c" && { command -v "$c"; return; }; done
}

# -------------------------------------------------------------------------------------------------------------
step "1/7  System tools: FFmpeg, Node.js, Python 3.11, build tools"
if [ "$SKIP_SYSTEM" = 0 ]; then
  if [ "$OS" = "Darwin" ]; then
    have brew || { echo "Homebrew is required: https://brew.sh"; exit 1; }
    have ffmpeg || brew install ffmpeg
    have node || brew install node
    [ -n "$(find_python)" ] || brew install python@3.11
    have whisper-cli || brew install whisper-cpp
    [ -n "$(find_chrome)" ] || brew install --cask google-chrome || true
  else
    have apt-get || { echo "Only apt-based Linux is automated. Install ffmpeg, nodejs (>=20.19), python3.11-venv, cmake, g++, git yourself, then re-run with --skip-system."; exit 1; }
    sudo apt-get update
    sudo apt-get install -y ffmpeg git cmake g++ curl ca-certificates python3-venv
    [ -n "$(find_python)" ] || sudo apt-get install -y python3.11 python3.11-venv || true
    if ! have node || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a==20&&b>=19)?0:1)'; then
      echo "    Node.js 20.19+ needed. Install it from https://nodejs.org or with nvm, then re-run."; exit 1
    fi
  fi
fi
for c in ffmpeg ffprobe node npm; do have "$c" || { echo "$c not found"; exit 1; }; ok "$c -> $(command -v $c)"; done
PY="$(find_python || true)"
[ -n "$PY" ] || { echo "Python 3.10-3.12 not found (MediaPipe 0.10.14 needs it). Install python3.11."; exit 1; }
ok "python -> $PY"
mkdir -p "$TOOLS/bin" "$TOOLS/models" "$TOOLS/downloads"

# -------------------------------------------------------------------------------------------------------------
step "2/7  whisper.cpp"
WHISPER=""
if have whisper-cli; then WHISPER="$(command -v whisper-cli)"; ok "whisper-cli -> $WHISPER"
elif [ -x "$TOOLS/whisper.cpp/build/bin/whisper-cli" ]; then WHISPER="$TOOLS/whisper.cpp/build/bin/whisper-cli"; ok "whisper-cli already built"
else
  VER="$(json "d['whisper']['version']")"
  git clone --depth 1 --branch "$VER" "$(json "d['whisper']['sourceRepo']")" "$TOOLS/whisper.cpp-src"
  cmake -S "$TOOLS/whisper.cpp-src" -B "$TOOLS/whisper.cpp/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF
  cmake --build "$TOOLS/whisper.cpp/build" -j --config Release --target whisper-cli
  WHISPER="$TOOLS/whisper.cpp/build/bin/whisper-cli"
  rm -rf "$TOOLS/whisper.cpp-src"
  ok "built whisper-cli $VER"
fi

# -------------------------------------------------------------------------------------------------------------
step "3/7  Whisper models"
N="$(json "len(d['models'])")"
for i in $(seq 0 $((N - 1))); do
  FILE="$(json "d['models'][$i]['file']")"
  if [ "$FILE" = "ggml-base.bin" ] && [ "$BASE_MODEL" = 0 ]; then echo "    skip ggml-base.bin (optional; --base-model)"; continue; fi
  get_verified "$(json "d['models'][$i]['url']")" "$TOOLS/models/$FILE" "$(json "d['models'][$i]['sha256']")"
done

# -------------------------------------------------------------------------------------------------------------
step "4/7  yt-dlp"
if [ "$OS" = "Darwin" ]; then YT=yt-dlp_macos; elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then YT=yt-dlp_linux_aarch64; else YT=yt-dlp_linux; fi
get_verified "$(json "d['ytdlp']['base']")$YT" "$TOOLS/bin/yt-dlp" "$(json "d['ytdlp']['sha256']['$YT']")"
chmod +x "$TOOLS/bin/yt-dlp"
echo "--js-runtimes node" > "$TOOLS/bin/yt-dlp.conf"

# -------------------------------------------------------------------------------------------------------------
step "5/7  Node packages (puppeteer-core, HyperFrames)"
if [ -d "$TOOLS/node_modules/puppeteer-core" ]; then ok "Tools/node_modules already installed"; else (cd "$TOOLS" && npm ci --no-audit --no-fund); ok "npm ci"; fi
if [ "$WITH_REMOTION" = 1 ]; then
  if [ -d "$TOOLS/Remotion/node_modules/remotion" ]; then ok "Remotion already installed"; else (cd "$TOOLS/Remotion" && npm ci --no-audit --no-fund); ok "Remotion"; fi
fi

# -------------------------------------------------------------------------------------------------------------
step "6/7  Python vision venv"
VENV_PY="$TOOLS/vision-venv/bin/python"
[ -x "$VENV_PY" ] || "$PY" -m venv "$TOOLS/vision-venv"
"$VENV_PY" -m pip install --disable-pip-version-check -q --upgrade pip
"$VENV_PY" -m pip install --disable-pip-version-check -q -r "$STUDIO/setup/requirements.txt"
ok "$("$VENV_PY" -c "import numpy, cv2, mediapipe, scipy, PIL; print('numpy', numpy.__version__, '| opencv', cv2.__version__, '| mediapipe', mediapipe.__version__)")"

# -------------------------------------------------------------------------------------------------------------
step "7/7  Record tool paths and check the setup"
CHROME="$(find_chrome || true)"
if [ -z "$CHROME" ]; then
  echo "    Chrome not found; installing Chrome for Testing into Tools/chrome"
  CHROME="$(cd "$TOOLS" && npx --yes @puppeteer/browsers install chrome@stable --path "$TOOLS/chrome" | tail -1 | cut -d' ' -f2-)"
fi
"$VENV_PY" - "$TOOLS/paths.json" <<EOF
import json, sys
json.dump({"os": "$( [ "$OS" = Darwin ] && echo macos || echo linux )", "whisper": "$WHISPER", "python": "$VENV_PY",
           "chrome": "$CHROME" or None, "ytdlp": "$TOOLS/bin/yt-dlp", "ffmpeg": "$(command -v ffmpeg)", "node": "$(command -v node)"},
          open(sys.argv[1], "w"), indent=2)
EOF
ok "Tools/paths.json"
"$VENV_PY" "$STUDIO/.claude/skills/talking-head-reel/scripts/check_setup.py" || true
printf '\nIn each new terminal, run:  source Tools/activate.sh\n'
