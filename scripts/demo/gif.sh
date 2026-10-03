#!/bin/sh
# 把 tour.mjs 录下的画面合成动图（需要 ffmpeg）。
# 用法：scripts/demo/gif.sh <存画面的目录> <输出.gif>
set -e
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$1/list.txt" \
  -vf "setpts=PTS/1.2,fps=12,split[a][b];[a]palettegen=max_colors=200:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 "$2"
ls -la "$2" | awk '{printf "%s  %.2f MB\n", $9, $5/1048576}'
