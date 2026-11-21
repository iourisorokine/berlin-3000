#!/usr/bin/env python3
"""
Builds level 3, LATTE ART ATTACK (Prenzlauer Berg), from the raw ChatGPT images:

  far.png     the skyline panorama, seen over the open square at the start of the level
  street.png  the whole street: an open square, then the shop fronts A-D, and the pavement
  cafe.png    the inside of the design cafe (one screen: back wall + parquet)
  prenzl.json level length, segments, the cafe door and the exit door (site container)

  python3 tools/import_prenzl.py      (pip install pillow numpy scipy)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-assets"
OUT = ROOT / "src" / "assets" / "bg" / "prenzl"

VIEW_W, VIEW_H = 384, 216
WALL_BASE = 136   # where the facades meet the pavement
S = 0.40          # facades: shop doors come out a little lower than the heroes, like level 1
OPEN = 256        # an open square before the first building, where the skyline shows
GROUND_S = 0.21   # the pavement strip fills the rows below the facades
SEGMENTS = ["seg_a", "seg_b", "seg_c", "seg_d"]
CAFE_DOOR = 770   # centre of the cafe's double door in seg_c (source px)
EXIT_DOOR = 1450  # centre of the site container's door in seg_d (source px)
OUTLINE = np.array([20, 16, 28])


def load(name: str) -> np.ndarray:
    return np.array(Image.open(RAW / f"{name}.png").convert("RGB")).astype(np.int32)


def keyed(a: np.ndarray) -> np.ndarray:
    """RGBA with all magenta removed and a dark line where it touched the art."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    bg = (m > 110) & (r > 150) & (b > 150)
    fringe = (m > 35) & ~bg & ndimage.binary_dilation(bg, iterations=2)
    a = a.copy()
    a[fringe] = OUTLINE
    return np.dstack([a, np.where(bg, 0, 255)]).astype(np.uint8)


def shrink(rgba: np.ndarray, kx: float, ky: float | None = None) -> Image.Image:
    im = Image.fromarray(rgba, "RGBA").convert("RGBa")
    w, h = max(1, round(im.width * kx)), max(1, round(im.height * (ky or kx)))
    out = np.array(im.resize((w, h), Image.BOX).convert("RGBA"))
    out[..., 3] = np.where(out[..., 3] >= 128, 255, 0)
    return Image.fromarray(out, "RGBA")


def solid_rows(rgba: np.ndarray) -> tuple[int, int]:
    rows = np.nonzero((rgba[..., 3] > 0).mean(axis=1) > 0.5)[0]
    return int(rows.min()), int(rows.max()) + 1


def tiled(tile: Image.Image, width: int, height: int, y: int) -> Image.Image:
    """Repeats a strip across `width`, every other copy mirrored so the joins are seamless."""
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x, flip = 0, False
    while x < width:
        out.alpha_composite(tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if flip else tile, (x, y))
        x += tile.width
        flip = not flip
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)

    # facades, bottoms on WALL_BASE
    segs, x = [], OPEN
    for name in SEGMENTS:
        rgba = keyed(load(f"stage_prenzl_{name}"))
        top, base = solid_rows(rgba)
        im = shrink(rgba[:base], S)
        segs.append((name, x, im))
        x += im.width
    level_len = x

    gr = keyed(load("stage_prenzl_ground"))
    gtop, _ = solid_rows(gr)
    ground = shrink(gr[gtop:], GROUND_S)
    street = tiled(ground, level_len, VIEW_H, WALL_BASE)
    for name, px, im in segs:
        street.alpha_composite(im, (px, WALL_BASE - im.height))

    # the skyline: the panorama's rooftops sit just above the pavement of the open square
    sky = Image.open(RAW / "bg_prenzl_sky.png").convert("RGB")
    k = 0.25
    sky = sky.resize((round(sky.width * k), round(sky.height * k)), Image.BOX)
    far = Image.new("RGB", (sky.width * 2, VIEW_H), (20, 120, 230))
    off = WALL_BASE + 2 - round(822 * k)
    far.paste(sky, (0, off))
    far.paste(sky.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (sky.width, off))

    # the cafe: one screen, back wall + herringbone parquet (squashed a little for depth)
    wall = keyed(load("stage_prenzl_cafe"))
    _, wbase = solid_rows(wall)
    wall_im = shrink(wall[:wbase], VIEW_W / wall.shape[1])
    fl = keyed(load("stage_prenzl_cafe_floor"))
    ftop, _ = solid_rows(fl)
    floor_h = VIEW_H - wall_im.height
    floor_im = shrink(fl[ftop:], VIEW_W / fl.shape[1], floor_h / (fl.shape[0] - ftop))
    cafe = Image.new("RGBA", (VIEW_W, VIEW_H), (0, 0, 0, 255))
    cafe.alpha_composite(floor_im, (0, wall_im.height))
    cafe.alpha_composite(wall_im, (0, 0))

    seg_c = next(px for n, px, _ in segs if n == "seg_c")
    seg_d = next(px for n, px, _ in segs if n == "seg_d")
    meta = {
        "levelLen": level_len,
        "open": OPEN,
        "wallBase": WALL_BASE,
        "segments": [{"name": n, "x": px, "w": im.width} for n, px, im in segs],
        "cafeDoor": round(seg_c + CAFE_DOOR * S),
        "exitDoor": round(seg_d + EXIT_DOOR * S),
        # inside the cafe: its wall base, the walkable band, and the door back to the street (screen x)
        "cafe": {"wallBase": wall_im.height, "band": [wall_im.height + 10, 208], "door": round(120 * VIEW_W / 1536)},
    }
    street.save(OUT / "street.png", optimize=True)
    far.save(OUT / "far.png", optimize=True)
    cafe.convert("RGB").save(OUT / "cafe.png", optimize=True)
    (OUT / "prenzl.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps({k: v for k, v in meta.items() if k != "segments"}), street.size)
