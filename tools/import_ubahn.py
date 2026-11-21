#!/usr/bin/env python3
"""
Builds the U-Bahn level's background from the raw ChatGPT images:

  train.png       the carriage walls side by side (windows are holes) + the floor
  doors_open.png  the door segment with its doors slid open (drawn over at stations)
  tunnel.png      the tunnel wall seen through the windows (tiles, scrolls)
  station.png     a station platform seen through the windows and open doors
  ubahn.json      level length, segments, door and seat positions

  python3 tools/import_ubahn.py      (pip install pillow numpy scipy)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-assets"
OUT = ROOT / "src" / "assets" / "bg" / "ubahn"

VIEW_H = 216
WALL_BASE = 128   # art row where the carriage wall meets the floor
S = 0.19          # carriage scale: the whole wall, ceiling lights included, fits above the floor
FLOOR_S = 0.36    # the floor strip is stretched a little more to fill the walkable band
# the train, left to right: two and a bit carriages, three door sections (= three stations)
SEGMENTS = ["car_a", "car_b", "car_end", "car_a", "car_b", "car_a", "car_end", "car_b", "car_a"]
OUTLINE = np.array([20, 16, 28])


def load(name: str) -> np.ndarray:
    return np.array(Image.open(RAW / f"stage_ubahn_{name}.png").convert("RGB")).astype(np.int32)


def keyed(a: np.ndarray, all_magenta: bool) -> np.ndarray:
    """RGBA with the magenta removed. all_magenta: also the enclosed holes (windows, open doors)."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    key = (m > 110) & (r > 150) & (b > 150)
    if all_magenta:
        bg = key
    else:
        lab, _ = ndimage.label(key)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bg = np.isin(lab, list(border))
    fringe = (m > 35) & ~bg & ndimage.binary_dilation(bg, iterations=2)
    a = a.copy()
    a[fringe] = OUTLINE
    return np.dstack([a, np.where(bg, 0, 255)]).astype(np.uint8)


def shrink(rgba: np.ndarray, k: float, ky: float | None = None) -> Image.Image:
    im = Image.fromarray(rgba, "RGBA").convert("RGBa")
    w, h = max(1, round(im.width * k)), max(1, round(im.height * (ky or k)))
    out = np.array(im.resize((w, h), Image.BOX).convert("RGBA"))
    out[..., 3] = np.where(out[..., 3] >= 128, 255, 0)
    return Image.fromarray(out, "RGBA")


def wall_rows(rgba: np.ndarray) -> tuple[int, int]:
    """First and last row that are mostly filled: the ceiling line and the bottom of the wall."""
    rows = np.nonzero((rgba[..., 3] > 0).mean(axis=1) > 0.5)[0]
    return int(rows.min()), int(rows.max()) + 1


def segment(name: str) -> tuple[Image.Image, int]:
    """The wall shrunk so its bottom lands on WALL_BASE; returns the image and its source bottom row."""
    rgba = keyed(load(name), True)
    top, base = wall_rows(rgba)
    return shrink(rgba[:base], S), base


def window_layer(name: str, base: int, magenta_ok: bool) -> Image.Image:
    """A full picture (tunnel or station) mapped with the same scale and offset as the walls,
    so whatever sits behind a window in the source images shows through it in the game."""
    a = np.array(Image.open(RAW / f"bg_ubahn_{name}.png").convert("RGB"))
    im = Image.fromarray(a).resize((round(a.shape[1] * S), round(a.shape[0] * S)), Image.BOX)
    im = im.quantize(48, method=Image.Quantize.MEDIANCUT).convert("RGB")
    out = Image.new("RGB", (im.width, VIEW_H), (8, 6, 12))
    out.paste(im, (0, WALL_BASE - round(base * S)))
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    segs, x, base = [], 0, 0
    cache: dict[str, tuple[Image.Image, int]] = {}
    for name in SEGMENTS:
        if name not in cache:
            cache[name] = segment(name)
        im, base = cache[name]
        segs.append((name, x, im))
        x += im.width
    level_len = x

    train = Image.new("RGBA", (level_len, VIEW_H), (0, 0, 0, 0))
    # floor: its top edge on WALL_BASE, tiles mirrored every other copy (seamless)
    fl = keyed(load("floor"), False)
    ftop, _ = wall_rows(fl)
    floor = shrink(fl[ftop:], FLOOR_S)
    fx, flip = 0, False
    while fx < level_len:
        tile = floor.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if flip else floor
        train.alpha_composite(tile, (fx, WALL_BASE))
        fx += floor.width
        flip = not flip
    doors, _ = segment("car_b_open")
    closed = cache["car_b"][0]
    # the door segments get a hole where the doorway is: the game draws them closed or open on top
    hole = (np.array(doors)[..., 3] == 0) & (np.array(closed)[..., 3] > 0)
    with_hole = np.array(closed)
    with_hole[hole] = 0
    with_hole = Image.fromarray(with_hole, "RGBA")
    for name, px, im in segs:
        train.alpha_composite(with_hole if name == "car_b" else im, (px, WALL_BASE - im.height))

    seg_w = cache["car_b"][0].width
    meta = {
        "levelLen": level_len,
        "wallBase": WALL_BASE,
        "segW": seg_w,
        "segments": [{"name": n, "x": px, "w": im.width} for n, px, im in segs],
        # centre of the double doors in car_b (image x 865 of 1536)
        "doors": [round(px + 865 * S) for n, px, _ in segs if n == "car_b"],
        # where passengers can sit: the benches of car_a (image x 80-1460) and next to the doors in car_b
        "seats": [[round(px + 120 * S), round(px + 1420 * S)] for n, px, _ in segs if n == "car_a"]
        + [[round(px + 90 * S), round(px + 320 * S)] for n, px, _ in segs if n == "car_b"],
    }
    train.save(OUT / "train.png", optimize=True)
    doors.save(OUT / "doors_open.png", optimize=True)
    closed.save(OUT / "doors_closed.png", optimize=True)
    window_layer("tunnel", base, False).save(OUT / "tunnel.png", optimize=True)
    window_layer("station", base, False).save(OUT / "station.png", optimize=True)
    (OUT / "ubahn.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps({k: v for k, v in meta.items() if k != "segments"}))
    print("train", train.size, "doors", doors.size)
