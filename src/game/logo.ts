import { audio } from './audio'
import { VIEW_W } from './constants'
import { drawText, GLYPH_W, textWidth } from './font'

// The BERLIN 3000 title, drawn in code so it stays crisp and can move:
// chrome "BERLIN" whose I is the Fernsehturm, and slanted neon "3000" pulsing with the club's kick.

const S = 6 // letter scale: each font pixel becomes 6x6 art pixels
const TOP = 14 // top of the BERLIN letters
const WORD = 'BERL N' // the space is where the TV tower stands in for the I
const W = textWidth(WORD, S)
const X0 = Math.round((VIEW_W - W) / 2)
const H = 7 * S
const TOWER_X = X0 + 4 * GLYPH_W * S + Math.round((5 * S) / 2)

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

let cache: { mask: HTMLCanvasElement; chrome: HTMLCanvasElement; neon: HTMLCanvasElement; shine: HTMLCanvasElement } | null = null

/** the TV tower: a needle, the sphere with its ring of windows, and the tapering shaft */
function tower(g: CanvasRenderingContext2D, fill: boolean) {
  const cx = TOWER_X
  const ballY = TOP + 13
  if (fill) g.fillStyle = '#fff'
  // shaft, wider at the bottom
  for (let y = ballY + 6; y < TOP + H; y++) {
    const w = 3 + Math.floor(((y - ballY) / (TOP + H - ballY)) * 4)
    g.fillRect(cx - (w >> 1), y, w, 1)
  }
  // needle up above the letters
  g.fillRect(cx - 1, TOP - 12, 2, 20)
  g.fillRect(cx - 2, TOP - 1, 4, 3)
  // the sphere
  for (let dy = -7; dy <= 7; dy++) {
    const w = Math.round(Math.sqrt(49 - dy * dy) * 2)
    g.fillRect(cx - (w >> 1), ballY + dy, w, 1)
  }
}

function build() {
  // mask of the whole word plus tower
  const mask = canvas(VIEW_W, 64)
  const m = mask.getContext('2d')!
  drawText(m, WORD, X0, TOP, { scale: S, color: '#fff' })
  tower(m, true)

  // chrome fill: white sky, lavender, a hard horizon line, then violet into pink
  const chrome = canvas(VIEW_W, 64)
  const c = chrome.getContext('2d')!
  c.drawImage(mask, 0, 0)
  c.globalCompositeOperation = 'source-in'
  const gr = c.createLinearGradient(0, TOP, 0, TOP + H)
  gr.addColorStop(0, '#ffffff')
  gr.addColorStop(0.45, '#c9d2ff')
  gr.addColorStop(0.55, '#8e7cff')
  gr.addColorStop(0.56, '#3b1d8f')
  gr.addColorStop(0.8, '#a43cff')
  gr.addColorStop(1, '#ff6ad5')
  c.fillStyle = gr
  c.fillRect(0, 0, VIEW_W, 64)
  // the sphere gets a pink band of windows, the needle a darker core
  c.globalCompositeOperation = 'source-atop'
  c.fillStyle = '#ff3a8a'
  c.fillRect(TOWER_X - 7, TOP + 13, 14, 2)
  c.fillStyle = '#1a0d3a'
  for (let x = TOWER_X - 6; x < TOWER_X + 6; x += 3) c.fillRect(x, TOP + 13, 1, 2)

  // neon 3000: hot pink with a pale core line, cut by retro scan lines in its lower half
  const neon = canvas(VIEW_W, 64)
  const n = neon.getContext('2d')!
  const nx = Math.round((VIEW_W - textWidth('3000', S)) / 2) + 10
  // round O's: the font's zero has a slash through it, too busy for a logo
  drawText(n, '3OOO', nx, 8, { scale: S, color: '#ff2a6d' })
  n.globalCompositeOperation = 'source-atop'
  n.fillStyle = '#ffc2d6'
  n.fillRect(0, 8 + S, VIEW_W, 2)
  n.globalCompositeOperation = 'destination-out'
  for (let y = 8 + Math.round(H * 0.62); y < 8 + H - 2; y += 5) n.fillRect(0, y, VIEW_W, 1)

  cache = { mask, chrome, neon, shine: canvas(VIEW_W, 64) }
}

/** Draws the title at the top of the screen; `tick` drives the shine, `pulse` the neon glow. */
export function drawLogo(ctx: CanvasRenderingContext2D, tick: number) {
  if (!cache) build()
  const { mask, chrome, neon, shine } = cache!

  // BERLIN: deep 3D extrusion, dark outline, chrome face
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  const ext = tint(mask, '#24104a')
  for (let i = 5; i >= 1; i--) ctx.drawImage(ext, i, i)
  const out = tint(mask, '#0a0614')
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(out, dx, dy)
  ctx.drawImage(chrome, 0, 0)

  // a shine sweeping across the chrome every 4 seconds
  const phase = tick % 240
  if (phase < 50) {
    const s = shine.getContext('2d')!
    s.globalCompositeOperation = 'source-over'
    s.clearRect(0, 0, VIEW_W, 64)
    s.drawImage(mask, 0, 0)
    s.globalCompositeOperation = 'source-in'
    s.fillStyle = 'rgba(255,255,255,0.85)'
    const x = X0 - 40 + (phase / 50) * (W + 80)
    s.beginPath()
    s.moveTo(x, 0)
    s.lineTo(x + 10, 0)
    s.lineTo(x - 14, 64)
    s.lineTo(x - 24, 64)
    s.fill()
    ctx.drawImage(shine, 0, 0)
  }
  // the red aircraft light on the tip of the needle
  if (Math.floor(tick / 30) % 2 === 0) {
    ctx.fillStyle = '#ff2a3a'
    ctx.fillRect(TOWER_X - 1, TOP - 14, 2, 2)
  }

  // 3000: slanted, with a glow that pulses on the club's kick drum
  const glow = Math.round((0.25 + audio.pulse() * 0.35) * 20) / 20
  ctx.translate(0, TOP + H + 2)
  ctx.transform(1, 0, -0.22, 1, 0, 0)
  ctx.translate(12, 0)
  const halo = tint(neon, `rgba(255,42,109,${glow.toFixed(2)})`)
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]]) ctx.drawImage(halo, dx, dy)
  const edge = tint(neon, '#2a0616')
  ctx.drawImage(edge, 2, 2)
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(edge, dx, dy)
  ctx.drawImage(neon, 0, 0)
  ctx.restore()
}

// solid-colour copies of a mask, cached per colour (the glow's colour changes every frame,
// so its copies are rounded to a few steps)
const tints = new Map<string, HTMLCanvasElement>()
function tint(src: HTMLCanvasElement, color: string) {
  const key = `${src === cache?.neon ? 'n' : 'm'}${color}`
  let c = tints.get(key)
  if (!c) {
    c = canvas(src.width, src.height)
    const g = c.getContext('2d')!
    g.drawImage(src, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, c.width, c.height)
    tints.set(key, c)
  }
  return c
}
