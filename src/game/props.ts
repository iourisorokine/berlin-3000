import type { PickupKind } from './effects'
import { drawFrame, sheet } from './sprites'

/** Street objects in the walkable band that break when hit, and drop things. */
export type BreakableKind = 'bin' | 'boxes' | 'crate' | 'cone'

export interface Breakable {
  id: number
  kind: BreakableKind
  x: number
  y: number
  hp: number
  broken: boolean
  /** frames since it broke (crates and cones vanish) */
  t: number
  /** sideways slide for knocked cones */
  vx: number
}

/** where they stand in level 1 (x, feet y) */
const LAYOUT: [BreakableKind, number, number][] = [
  ['bin', 250, 172],
  ['boxes', 560, 192],
  ['crate', 980, 166],
  ['bin', 1180, 198],
  ['cone', 1420, 176],
  ['boxes', 1640, 200],
  ['bin', 1990, 168],
  ['crate', 2200, 194],
]

/** what falls out when it breaks */
export const LOOT: Record<BreakableKind, PickupKind[]> = {
  bin: ['doner', 'currywurst', 'pretzel', 'doner'],
  boxes: ['cash', 'phone', 'wristband', 'glowstick'],
  crate: ['mate', 'mate', 'glowstick'],
  cone: [],
}

let nextId = 1000

export function makeBreakables(): Breakable[] {
  return LAYOUT.map(([kind, x, y]) => ({ id: nextId++, kind, x, y, hp: kind === 'bin' ? 2 : 1, broken: false, t: 0, vx: 0 }))
}

/** true while it can still be hit */
export const standing = (b: Breakable) => !b.broken

/** crates shatter and cones fly off: both disappear */
export const gone = (b: Breakable) => b.broken && (b.kind === 'crate' || b.kind === 'cone') && b.t > 24

export function updateBreakable(b: Breakable) {
  if (!b.broken) return
  b.t++
  b.x += b.vx
  b.vx *= 0.9
}

export function drawBreakable(ctx: CanvasRenderingContext2D, b: Breakable, camX: number) {
  if (gone(b)) return
  const s = sheet('props')
  const sx = b.x - camX
  if (b.broken && b.kind === 'crate') return // the bottle-smash effect replaces it
  if (b.broken && b.kind === 'cone') {
    drawFrame(ctx, s, 'cone', sx, b.y - Math.max(0, 10 - b.t) * 1.5, 1, { tilt: b.t * 0.3 * Math.sign(b.vx || 1), alpha: 1 - b.t / 24 })
    return
  }
  const name = b.broken ? `${b.kind}_broken` : b.kind
  ctx.fillStyle = 'rgba(8,6,16,0.4)'
  ctx.beginPath()
  ctx.ellipse(Math.round(sx), Math.round(b.y), 11, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()
  drawFrame(ctx, s, name, sx, b.y, 1)
}
