import { drawText } from './font'

// The illustrated map from ChatGPT (raw-assets/bg_map.png, imported by tools/import_map.py).
// Until it exists, the schematic map below is drawn in code.
const MAP_URL = Object.values(import.meta.glob('../assets/bg/map.png', { eager: true, query: '?url', import: 'default' }))[0] as
  | string
  | undefined
let mapImg: HTMLImageElement | null = null
if (MAP_URL) {
  const img = new Image()
  img.onload = () => (mapImg = img)
  img.src = MAP_URL
}

/**
 * The level-select map: a very schematic Berlin (not to scale) with the Spree, the Ringbahn,
 * a few parks, the Fernsehturm, and a pin where each level happens.
 */

/** where each level happens on the map, and its pin colour */
export const SPOTS: Record<string, { x: number; y: number; color: string; area: string }> = {
  berghain: { x: 176, y: 128, color: '#ff3a5a', area: 'FRIEDRICHSHAIN' },
  ubahn: { x: 158, y: 97, color: '#ffd23a', area: 'UNDER MITTE' },
  prenzl: { x: 168, y: 72, color: '#7dff5a', area: 'PRENZLAUER BERG' },
}

const OUTLINE: [number, number][] = [
  [22, 92], [34, 70], [60, 58], [80, 40], [112, 30], [140, 24], [168, 30], [196, 26], [222, 40], [240, 62], [256, 84],
  [262, 110], [266, 140], [256, 168], [236, 188], [206, 200], [176, 196], [150, 204], [122, 194], [96, 180], [70, 184],
  [46, 170], [32, 148], [18, 124],
]
const SPREE: [number, number][] = [
  [18, 100], [60, 104], [96, 100], [124, 106], [146, 114], [170, 124], [196, 140], [226, 158], [262, 170],
]
/** a U-Bahn line through Mitte up to Prenzlauer Berg */
const UBAHN_LINE: [number, number][] = [[112, 124], [148, 108], [158, 97], [168, 72], [176, 48]]

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], close: boolean) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  if (close) ctx.closePath()
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

export function drawBerlinMap(ctx: CanvasRenderingContext2D, tick: number) {
  if (mapImg) {
    ctx.drawImage(mapImg, 0, 0)
    return
  }
  ctx.fillStyle = '#0d0a1c'
  ctx.fillRect(0, 0, 384, 216)
  // a faint grid, like a city map
  ctx.fillStyle = 'rgba(90,80,150,0.12)'
  for (let x = 0; x < 384; x += 12) ctx.fillRect(x, 0, 1, 216)
  for (let y = 0; y < 216; y += 12) ctx.fillRect(0, y, 384, 1)
  // the city
  ctx.imageSmoothingEnabled = false
  poly(ctx, OUTLINE, true)
  ctx.fillStyle = '#26214a'
  ctx.fill()
  ctx.strokeStyle = '#5a4f9a'
  ctx.lineWidth = 1
  ctx.stroke()
  // lakes and parks
  blob(ctx, 34, 140, 6, 13, '#2c5aa8')
  blob(ctx, 236, 176, 12, 6, '#2c5aa8')
  blob(ctx, 116, 108, 15, 6, '#2f6b3a')
  ctx.fillStyle = '#3b6b2f'
  ctx.fillRect(126, 152, 28, 14) // Tempelhofer Feld
  blob(ctx, 200, 152, 9, 5, '#2f6b3a')
  // the Spree
  poly(ctx, SPREE, false)
  ctx.strokeStyle = '#3d7be0'
  ctx.lineWidth = 3
  ctx.stroke()
  // the Ringbahn
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = 'rgba(200,200,230,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(148, 114, 54, 42, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  // the U-Bahn line
  poly(ctx, UBAHN_LINE, false)
  ctx.strokeStyle = '#ffd23a'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.lineWidth = 1
  // the Fernsehturm at Alexanderplatz, its light blinking
  ctx.fillStyle = '#c8ccdc'
  ctx.fillRect(149, 92, 2, 18)
  blob(ctx, 150, 98, 3, 3, '#c8ccdc')
  ctx.fillStyle = Math.floor(tick / 30) % 2 ? '#ff2a3a' : '#5a1a22'
  ctx.fillRect(149, 89, 2, 2)
  // a few district names
  for (const [t, x, y] of [
    ['MITTE', 112, 116],
    ['KREUZBERG', 140, 138],
    ['NEUKÖLLN', 182, 172],
    ['SPANDAU', 48, 82],
  ] as [string, number, number][])
    drawText(ctx, t, x, y, { align: 'center', color: '#6a6494' })
}

/** a pin; the chosen one bounces and pulses */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, color: string, on: boolean, locked: boolean, tick: number, done = false) {
  const bob = on ? Math.round(Math.abs(Math.sin(tick / 8)) * -3) : 0
  if (on) {
    const r = 8 + ((tick / 3) % 10)
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ((tick / 3) % 10) / 10)})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  const c = locked ? '#5a5670' : color
  ctx.fillStyle = '#0d0a1c'
  ctx.beginPath()
  ctx.arc(x, y - 7 + bob, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.arc(x, y - 7 + bob, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 4, y - 4 + bob)
  ctx.lineTo(x + 4, y - 4 + bob)
  ctx.lineTo(x, y + 1 + bob)
  ctx.fill()
  drawText(ctx, locked ? '?' : String(n), x, y - 10 + bob, { align: 'center', color: '#14101c' })
  // beaten: a little green tick beside the pin
  if (done) {
    const tx = x + 6
    const ty = y - 14 + bob
    ctx.fillStyle = '#0d0a1c'
    ctx.fillRect(tx - 1, ty - 1, 9, 8)
    ctx.fillStyle = '#7dff5a'
    for (const [dx, dy] of [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]]) ctx.fillRect(tx + dx, ty + dy - 1, 1, 2)
  }
}
