#!/usr/bin/env python3
"""
Builds level 1's background layers from the raw ChatGPT images:

  far.png    night sky + skyline with the Fernsehturm (slow parallax), widened
             seamlessly so it covers the whole level
  mid.png    cobbled street + the four building segments, side by side
  glow.png   the club-light pixels of mid.png (lit windows, door), pulsed on the beat
  level.json level length, door position, segment edges

  python3 tools/import_backgrounds.py      (pip install pillow numpy)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-assets"
OUT = ROOT / "src" / "assets" / "bg"

VIEW_W, VIEW_H = 384, 216
WALL_BASE = 128           # art row where the buildings meet the kerb
S = 0.30                  # stage scale (art px per image px): makes doors about character height
FAR_S = 0.18              # skyline scale: the whole TV tower fits on screen
FAR_PARALLAX = 0.12
FAR_HORIZON = 122         # art row where the skyline's ground line sits (hidden behind the kerb)
FAR_OFFSET = -150         # the far layer starts left of the screen, so the tower stands above the low wall of screen 1
OPEN_START = 384          # one open screen of street before the first building: the skyline shows in full
FAR_BRIGHTNESS = 1.25     # lifts the night skyline a little so it reads behind the action
SEGMENTS = ["stage_01_seg_a", "stage_01_seg_b", "stage_01_seg_b", "stage_01_seg_c", "stage_01_seg_d"]
DOOR_IMAGE_X = 1000       # centre of the club door in stage_01_seg_d.png (image px)
OUTLINE = np.array([20, 16, 28])


def keyed(name: str):
    """RGBA array with the magenta background removed. Only magenta connected to the
    image border counts as background: purple club light inside windows stays."""
    a = np.array(Image.open(RAW / f"{name}.png").convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    key = (m > 110) & (r > 150) & (b > 150)
    lab, n = ndimage.label(key)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    fringe = (m > 35) & ~bg & ndimage.binary_dilation(bg, iterations=2)
    a[fringe] = OUTLINE
    alpha = np.where(bg, 0, 255)
    return np.dstack([a, alpha]).astype(np.uint8)


def shrink(rgba: np.ndarray, k: float) -> Image.Image:
    im = Image.fromarray(rgba, "RGBA").convert("RGBa")
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    out = np.array(im.resize((w, h), Image.BOX).convert("RGBA"))
    out[..., 3] = np.where(out[..., 3] >= 128, 255, 0)
    return Image.fromarray(out, "RGBA")


def base_row(rgba: np.ndarray) -> int:
    """Lowest row that is mostly filled: the bottom edge of the building."""
    fill = (rgba[..., 3] > 0).mean(axis=1)
    return int(np.nonzero(fill > 0.5)[0].max()) + 1


def right_edge(rgba: np.ndarray) -> int:
    cols = np.nonzero((rgba[..., 3] > 0).mean(axis=0) > 0.05)[0]
    return int(cols.max()) + 1


def build_mid():
    parts, x = [], OPEN_START
    for i, name in enumerate(SEGMENTS):
        rgba = keyed(name)
        base = base_row(rgba)
        if i == len(SEGMENTS) - 1:
            rgba = rgba[:, : right_edge(rgba)]  # the last building ends: the level ends there
        im = shrink(rgba[:base], S)
        parts.append((name, x, im))
        x += im.width
    level_len = x

    # street: kerb top on WALL_BASE, tiled with every other copy mirrored (seamless edges)
    g = keyed("stage_01_ground")
    kerb = int(np.nonzero((g[..., 3] > 0).mean(axis=1) > 0.5)[0].min())
    ground = shrink(g[kerb:], S)
    mid = Image.new("RGBA", (level_len, VIEW_H), (0, 0, 0, 0))
    gx, flip = 0, False
    while gx < level_len:
        tile = ground.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if flip else ground
        mid.alpha_composite(tile, (gx, WALL_BASE))
        gx += ground.width
        flip = not flip
    for name, px, im in parts:
        mid.alpha_composite(im, (px, WALL_BASE - im.height))

    alpha = np.array(mid)[..., 3]
    # club light: saturated magenta / purple / red pixels on the buildings
    a = np.array(mid).astype(np.int32)
    r, gg, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(np.maximum(r, gg), b)
    mn = np.minimum(np.minimum(r, gg), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    pinkish = ((r > gg + 40) & (b > gg + 10)) | ((r > 170) & (gg < 90))
    glow_mask = pinkish & (sat > 0.45) & (mx > 120) & (alpha > 0)
    glow_mask[WALL_BASE:] = False
    glow = np.zeros_like(a)
    glow[glow_mask] = a[glow_mask]
    glow[..., 3] = np.where(glow_mask, 255, 0)

    d_name, d_x, _ = parts[-1]
    meta = {
        "levelLen": level_len,
        "open": OPEN_START,
        "wallBase": WALL_BASE,
        "doorX": round(d_x + DOOR_IMAGE_X * S),
        "segments": [{"name": n, "x": px, "w": im.width} for n, px, im in parts],
    }
    return mid, Image.fromarray(glow.astype(np.uint8), "RGBA"), meta


def build_far(level_len: int):
    """Centre the real skyline (with the tower) and extend it both ways by mirroring
    tower-free strips, with the sky above them repainted as flat bands (no doubled moon)."""
    img = np.array(Image.open(RAW / "bg_skyline.png").convert("RGB"))
    H, W, _ = img.shape
    far_w_art = VIEW_W - FAR_OFFSET + int((level_len - VIEW_W) * FAR_PARALLAX) + 8
    far_w = int(far_w_art / FAR_S) + 2
    sky_rows = 560  # above this the image is only sky
    band = np.median(img[:sky_rows, 300:1000], axis=1).astype(np.uint8)  # one colour per row

    left = img[:, :1000].copy()
    right = img[:, 1160:].copy()  # right of the tower
    for strip in (left, right):
        strip[:sky_rows] = band[:, None, :]

    canvas = np.zeros((H, far_w, 3), np.uint8)
    place = int(100 / FAR_S)  # the image's left edge sits at far x = 100 art px
    canvas[:, place : place + W] = img
    # extend leftwards: mirror, normal, mirror... so every join is seamless
    x, flip = place, True
    while x > 0:
        strip = left[:, ::-1] if flip else left
        w = strip.shape[1]
        x0 = max(0, x - w)
        canvas[:, x0:x] = strip[:, w - (x - x0) :]
        x, flip = x0, not flip
    x, flip = place + W, True
    while x < far_w:
        strip = right[:, ::-1] if flip else right
        w = min(strip.shape[1], far_w - x)
        canvas[:, x : x + w] = strip[:, :w]
        x, flip = x + w, not flip

    im = Image.fromarray(canvas).resize((round(far_w * FAR_S), round(H * FAR_S)), Image.BOX)
    im = ImageEnhance.Brightness(im).enhance(FAR_BRIGHTNESS)
    im = ImageEnhance.Color(im).enhance(1.15)
    im = im.quantize(64, method=Image.Quantize.MEDIANCUT).convert("RGB")
    out = Image.new("RGB", (im.width, VIEW_H), tuple(int(c) for c in img[-1, 0]))
    out.paste(im, (0, FAR_HORIZON - round(870 * FAR_S)))
    tower_x = round((place + 1110) * FAR_S)
    tower_tip_y = FAR_HORIZON - round((870 - 150) * FAR_S)
    return out, {"farParallax": FAR_PARALLAX, "farOffset": FAR_OFFSET, "towerX": tower_x, "towerTipY": tower_tip_y}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    mid, glow, meta = build_mid()
    far, far_meta = build_far(meta["levelLen"])
    meta.update(far_meta)
    mid.save(OUT / "mid.png", optimize=True)
    glow.save(OUT / "glow.png", optimize=True)
    far.save(OUT / "far.png", optimize=True)
    (OUT / "level.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))
    print("mid", mid.size, "far", far.size)
