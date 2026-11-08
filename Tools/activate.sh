# Source from the studio folder:  source Tools/activate.sh
# Adds the studio tools to THIS shell's PATH only.
_T="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export PATH="$_T/bin:$_T/whisper.cpp/build/bin:$_T/node_modules/.bin:$_T/Remotion/node_modules/.bin:$_T/vision-venv/bin:$PATH"
export WHISPER_MODEL="$_T/models/ggml-small-q5_1.bin"
export HYPERFRAMES_WHISPER_PATH="$(command -v whisper-cli || echo "$_T/whisper.cpp/build/bin/whisper-cli")"
echo "Studio tools ready in this shell: whisper-cli, yt-dlp, python (vision venv), hyperframes, remotion."
