// every atlas written by tools/import_sprites.py is picked up automatically
const ATLAS_URLS = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const ATLAS_META = import.meta.glob('../assets/sprites/*.json', { eager: true, import: 'default' }) as Record<string, { frames: Record<string, Frame> }>
const nameOf = (path: string) => path.split('/').pop()!.replace(/\.(png|json)$/, '')

/** One frame in an atlas; (ax, ay) is the feet point, relative to the frame's top-left. */
export interface Frame {
  x: number
  y: number
  w: number
  h: number
  ax: number
  ay: number
}

export interface Sheet {
  img: HTMLCanvasElement
  /** all-white copy, for the hit flash */
  white: HTMLCanvasElement
  frames: Record<string, Frame>
}

/** an atlas name: jule, kalle, monk, bouncer, props, fx... */
export type SheetKey = string

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function whiteOf(src: HTMLCanvasElement) {
  const c = canvasOf(src.width, src.height)
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  return c
}

const sheets = new Map<SheetKey, Sheet>()

async function loadCanvas(url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = canvasOf(img.width, img.height)
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

/** Loads every atlas once (plus a white copy of each, for the hit flash). */
export async function loadSprites() {
  const meta = Object.fromEntries(Object.entries(ATLAS_META).map(([p, m]) => [nameOf(p), m.frames]))
  await Promise.all(
    Object.entries(ATLAS_URLS).map(async ([p, url]) => {
      const name = nameOf(p)
      const img = await loadCanvas(url)
      sheets.set(name, { img, white: whiteOf(img), frames: meta[name] })
    }),
  )
}

/** true when the atlas was found (heroes whose art is not made yet stay off the select screen) */
export function hasSheet(v: SheetKey): boolean {
  return sheets.has(v)
}

export function sheet(v: SheetKey): Sheet {
  return sheets.get(v)!
}

export interface DrawOpts {
  flash?: boolean
  /** rotation in radians around the feet (positive = falls backwards) */
  tilt?: number
  /** whole-pixel zoom (effects only) */
  scale?: number
  alpha?: number
}

/** Draws a frame with its feet at (x, y). Facing -1 mirrors it. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: Sheet,
  name: string,
  x: number,
  y: number,
  facing: 1 | -1,
  opts: DrawOpts = {},
) {
  const f = s.frames[name] ?? s.frames.idle1
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.scale(facing * (opts.scale ?? 1), opts.scale ?? 1)
  if (opts.tilt) ctx.rotate(-opts.tilt)
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha
  ctx.drawImage(s.img, f.x, f.y, f.w, f.h, -f.ax, -f.ay, f.w, f.h)
  if (opts.flash) {
    // hit flash: a white glaze over the sprite rather than a solid white cut-out
    ctx.globalAlpha = (opts.alpha ?? 1) * 0.65
    ctx.drawImage(s.white, f.x, f.y, f.w, f.h, -f.ax, -f.ay, f.w, f.h)
  }
  ctx.restore()
}

export function drawPortrait(ctx: CanvasRenderingContext2D, s: Sheet, name: string, x: number, y: number) {
  const f = s.frames[name]
  if (f) ctx.drawImage(s.img, f.x, f.y, f.w, f.h, x, y, f.w, f.h)
}
