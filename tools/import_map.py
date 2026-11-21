#!/usr/bin/env python3
"""
Turns ChatGPT's map of Berlin (raw-assets/bg_map.png, 1536x1024) into the level-select
background: the middle 1536x864 band (the screen's 16:9) shrunk to 384x216.

  python3 tools/import_map.py      (pip install pillow)

The game uses src/assets/bg/map.png as soon as it exists. The pins are placed in
src/game/map.ts (SPOTS, in screen pixels: source x / 4, (source y - 80) / 4).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / "raw-assets" / "bg_map.png").convert("RGB")
if src.size != (1536, 1024):
    src = src.resize((1536, 1024), Image.LANCZOS)
band = src.crop((0, 80, 1536, 944))
out = band.resize((384, 216), Image.BOX).quantize(128, method=Image.Quantize.MEDIANCUT).convert("RGB")
out.save(ROOT / "src" / "assets" / "bg" / "map.png", optimize=True)
print("saved src/assets/bg/map.png", out.size)
