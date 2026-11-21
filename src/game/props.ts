import type { PickupKind } from './effects'
import { drawFrame, sheet, type SheetKey } from './sprites'

/** Objects in the walkable band that break when hit, and drop things. */
export type BreakableKind = 'bin' | 'boxes' | 'crate' | 'cone' | 'suitcase' | 'bag' | 'speaker' | 'papers'

/** each kind: its sprite sheet, how many hits it takes, what falls out */
const DEFS: Record<BreakableKind, { sheet: SheetKey; hp: number; loot: PickupKind[] }> = {
  bin: { sheet: 'props', hp: 2, loot: ['doner', 'currywurst', 'pretzel', 'doner'] },
  boxes: { sheet: 'props', hp: 1, loot: ['cash', 'phone', 'wristband', 'glowstick'] },
  crate: { sheet: 'props', hp: 1, loot: ['mate', 'mate', 'glowstick'] },
  cone: { sheet: 'props', hp: 1, loot: [] },
  // the night train: things people carry around at 4 a.m.
  suitcase: { sheet: 'props_ubahn', hp: 2, loot: ['falafel', 'shoe', 'shades', 'wallet', 'falafel'] },
  bag: { sheet: 'props_ubahn', hp: 1, loot: ['gnome', 'umbrella', 'falafel', 'pizzabox'] },
  speaker: { sheet: 'props_ubahn', hp: 2, loot: ['coffee', 'gummies', 'falafel'] },
  papers: { sheet: 'props_ubahn', hp: 1, loot: ['ticket', 'gummies', 'keys', 'ticket'] },
}

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

/** what falls out when it breaks */
export const LOOT = Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, d.loot])) as Record<BreakableKind, PickupKind[]>

let nextId = 1000

/** a level's props: [kind, x, feet y] */
export function makeBreakables(layout: [BreakableKind, number, number][]): Breakable[] {
  return layout.map(([kind, x, y]) => ({ id: nextId++, kind, x, y, hp: DEFS[kind].hp, broken: false, t: 0, vx: 0 }))
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
  const s = sheet(DEFS[b.kind].sheet)
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
