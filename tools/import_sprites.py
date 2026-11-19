#!/usr/bin/env python3
"""
Turn raw ChatGPT sprite sheets (magenta background, rough grid) into game-ready
pixel art: one atlas PNG + one JSON per character in src/assets/sprites/.

  pip install pillow numpy scipy
  python3 tools/import_sprites.py            # all characters in sprites.config.json
  python3 tools/import_sprites.py kalle      # just one

What it does, per cell of each sheet:
  1. removes the magenta background and turns the pink fringe into dark outline,
  2. keeps the main figure (drops stray sparks that float apart from it),
  3. scales it so a standing pose is `targetHeight` art pixels tall,
  4. snaps it to a real pixel grid and one shared palette per character,
  5. records the feet anchor (bottom of the feet, middle of the legs);
     a sheet's "anchorX" can override it as a fraction of the frame width.
Per-sheet options: "scale" (fixed art px per image px), "keepAll" (keep every blob in a cell,
for effects made of scattered pieces), "cellAnchor": "center" | "baseline" (anchor taken from
the grid cell instead of the feet, so the frames of an effect stay aligned).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-assets"
OUT = ROOT / "src" / "assets" / "sprites"
OUTLINE = (20, 16, 28)


def load_keyed(path: Path):
    """RGB array + boolean 'figure' mask with the magenta background removed."""
    a = np.array(Image.open(path).convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magenta = np.minimum(r, b) - g  # high on magenta, low on everything else
    loose = (magenta > 110) & (r > 150) & (b > 150)
    # Background = loose magenta connected to the image border, plus near-pure #FF00FF anywhere
    # (pockets between arms and legs). Purple clothes inside the outline survive.
    lab, _ = ndimage.label(loose)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    strict = (r > 215) & (b > 215) & (g < 60) & (np.abs(r - b) < 40)
    bg = np.isin(lab, border[border > 0]) | strict
    fringe = (magenta > 35) & ~bg & ndimage.binary_dilation(bg, iterations=2)
    fig = ~bg
    a[fringe] = OUTLINE
    fig = ndimage.binary_opening(fig, iterations=1)
    return a, fig


def main_figure(mask: np.ndarray) -> np.ndarray:
    """Largest blob plus anything touching it within a few pixels (chains, dust)."""
    lab, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    main = lab == (int(np.argmax(sizes)) + 1)
    near = ndimage.binary_dilation(main, iterations=5)
    keep = np.zeros_like(mask)
    for i in range(1, n + 1):
        part = lab == i
        if (part & near).any():
            keep |= part
    return keep


def cell_figures(path: Path, cols: int, rows: int, keep_all: bool = False):
    """Yield (rgb crop, mask crop, info) for every cell, in reading order.
    info = crop origin and cell rectangle, in image pixels."""
    a, fig = load_keyed(path)
    H, W = fig.shape
    lab, n = ndimage.label(fig)
    objs = ndimage.find_objects(lab)
    cells = [np.zeros_like(fig) for _ in range(cols * rows)]
    cw, ch = W / cols, H / rows
    for i, s in enumerate(objs):
        part = lab[s] == i + 1
        if part.sum() < 30:
            continue
        cy, cx = (s[0].start + s[0].stop) / 2, (s[1].start + s[1].stop) / 2
        k = min(rows - 1, int(cy // ch)) * cols + min(cols - 1, int(cx // cw))
        cells[k][s] |= part
    for idx, m in enumerate(cells):
        if not m.any():
            yield None
            continue
        if not keep_all:
            m = main_figure(m)
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        info = {"y0": y0, "x0": x0, "cx0": (idx % cols) * cw, "cy0": (idx // cols) * ch, "cw": cw, "ch": ch}
        yield a[y0:y1, x0:x1], m[y0:y1, x0:x1], info


def shrink(rgb: np.ndarray, mask: np.ndarray, k: float) -> Image.Image:
    rgba = np.dstack([rgb, mask * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA").convert("RGBa")  # premultiplied: no colour bleed
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    small = np.array(im.resize((w, h), Image.BOX).convert("RGBA"))
    small[..., 3] = np.where(small[..., 3] >= 128, 255, 0)
    return Image.fromarray(small, "RGBA")


def anchor_of(im: Image.Image):
    """Feet point: lowest opaque row, x = median of the bottom fifth of the figure."""
    a = np.array(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    bottom = ys.max()
    band = ys >= bottom - max(2, (bottom - ys.min()) // 5)
    return int(round(float(np.median(xs[band])))), int(bottom) + 1


def quantize_all(images, colors: int):
    """One shared palette for all frames of a character."""
    strip_w = sum(im.width for im in images)
    strip_h = max(im.height for im in images)
    strip = Image.new("RGB", (strip_w, strip_h), (0, 0, 0))
    x = 0
    for im in images:
        strip.paste(im.convert("RGB"), (x, 0), im)
        x += im.width
    pal = strip.quantize(colors, method=Image.Quantize.MEDIANCUT)
    out = []
    for im in images:
        q = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
        out.append(Image.fromarray(np.dstack([np.array(q), np.array(im)[..., 3]]), "RGBA"))
    return out


def build(name: str, cfg: dict):
    target = cfg["targetHeight"]
    names, images = [], []
    overrides = {}
    fixed_anchor = {}
    scale = None
    sheets = sorted(cfg["sheets"], key=lambda s: s["file"] != cfg.get("scaleFrom"))
    for sheet in sheets:
        figs = list(cell_figures(RAW / sheet["file"], sheet["cols"], sheet["rows"], sheet.get("keepAll", False)))
        frames = sheet["frames"]
        overrides.update(sheet.get("anchorX", {}))
        if "scale" in sheet:
            k = sheet["scale"]
        elif "standHeightPx" in sheet:
            k = target / sheet["standHeightPx"]
        elif sheet.get("stand"):
            hs = [figs[frames.index(f)][1].shape[0] for f in sheet["stand"]]
            k = target / float(np.median(hs))
        else:
            k = scale
        if scale is None:
            scale = k
        mode = sheet.get("cellAnchor")  # effects: anchor from the grid cell, so frames stay aligned
        for fname, f in zip(frames, figs):
            if fname and f is not None:
                names.append(fname)
                images.append(shrink(f[0], f[1], k))
                if mode:
                    inf = f[2]
                    ax = inf["cx0"] + inf["cw"] / 2 - inf["x0"]
                    ay = (inf["cy0"] + inf["ch"] / 2 if mode == "center" else inf["cy0"] + inf["ch"] * (1 - 24 / 512)) - inf["y0"]
                    fixed_anchor[fname] = (round(ax * k), round(ay * k))
        print(f"  {sheet['file']}: scale {k:.4f}")

    # portraits: from a design sheet, or (cropTop) from the top of any frame
    plist = cfg.get("portraits")
    plist = plist if isinstance(plist, list) else ([plist] if plist else [])
    for p in plist:
        figs = list(cell_figures(RAW / p["file"], p["cols"], p["rows"]))
        for idx, pname in p["cells"].items():
            f = figs[int(idx)]
            if f is None:
                continue
            rgb, m = f[0], f[1]
            if "cropTop" in p:
                h = max(1, round(m.shape[0] * p["cropTop"]))
                rgb, m = rgb[:h], m[:h]
            names.append(pname)
            images.append(shrink(rgb, m, p["height"] / m.shape[0]))

    images = quantize_all(images, cfg.get("colors", 32))

    # pack in rows, max 512 wide, 1 px gap
    meta, x, y, row_h, pad, max_w = {}, 0, 0, 0, 1, 512
    places = []
    for nm, im in zip(names, images):
        if x + im.width > max_w:
            x, y, row_h = 0, y + row_h + pad, 0
        places.append((x, y))
        row_h = max(row_h, im.height)
        x += im.width + pad
    atlas = Image.new("RGBA", (max_w, y + row_h), (0, 0, 0, 0))
    for nm, im, (px, py) in zip(names, images, places):
        atlas.alpha_composite(im, (px, py))
        ax, ay = anchor_of(im) if not nm.startswith("portrait") else (0, 0)
        if nm in overrides:  # fraction of the frame width, for poses where the feet mislead
            ax = round(im.width * overrides[nm])
        if nm in fixed_anchor:
            ax, ay = fixed_anchor[nm]
        meta[nm] = {"x": px, "y": py, "w": im.width, "h": im.height, "ax": ax, "ay": ay}
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / f"{name}.png", optimize=True)
    (OUT / f"{name}.json").write_text(json.dumps({"image": f"{name}.png", "frames": meta}, indent=1))
    print(f"  -> {name}.png ({atlas.width}x{atlas.height}), {len(meta)} frames")


if __name__ == "__main__":
    config = json.loads((ROOT / "tools" / "sprites.config.json").read_text())
    wanted = sys.argv[1:] or [k for k in config if not k.startswith("_")]
    for key in wanted:
        print(key)
        build(key, config[key])
