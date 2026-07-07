#!/bin/bash
# Extract the hero orbit video into a JPEG frame sequence for scroll scrubbing.
# Usage: ./extract_frames.sh <input.mp4>
set -euo pipefail
IN="$1"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/assets/frames/hero"
rm -f "$OUT"/frame_*.jpg
# ~15 fps from an 8s clip ≈ 120 frames — smooth scrub, reasonable payload
ffmpeg -y -i "$IN" -vf "fps=15,scale=1280:-2" -q:v 4 "$OUT/frame_%04d.jpg"
COUNT=$(ls "$OUT"/frame_*.jpg | wc -l | tr -d ' ')
echo "window.HERO_FRAME_COUNT = $COUNT;" > "$DIR/js/frames.js"
echo "Extracted $COUNT frames."
