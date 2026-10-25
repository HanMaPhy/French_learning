#!/bin/zsh
# Double-click (or run) to rebuild the private version and serve it: http://localhost:8000
# Mine holds your corpus and recordings. Close this window (or press Ctrl-C) to stop. A phone on the same Wi-Fi can open http://<this Mac's IP>:8000
cd "$(dirname "$0")" || exit 1
python3 build.py --private || exit 1
cd local || exit 1
(sleep 1; open "http://localhost:8000") &
exec python3 -m http.server 8000
