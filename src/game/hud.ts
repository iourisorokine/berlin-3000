import { VIEW_H, VIEW_W } from './constants'
import type { Enemy } from './enemy'
import { drawText } from './font'
import type { Player } from './player'
import { drawPortrait, sheet } from './sprites'

const OUT = '#14101c'

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, color: string, ghost = 0) {
  ctx.fillStyle = OUT
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
  ctx.fillStyle = '#3a1420'
  ctx.fillRect(x, y, w, h)
  if (ghost > k) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, Math.round(w * ghost), h)
  }
  ctx.fillStyle = color
  ctx.fillRect(x, y, Math.round(w * Math.max(0, k)), h)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(x, y, Math.round(w * Math.max(0, k)), 1)
}

export function drawHud(ctx: CanvasRenderingContext2D, p: Player, foe: Enemy | null, boss: Enemy | null, tick: number, ghostHp: number) {
  // player panel
  ctx.fillStyle = OUT
  ctx.fillRect(3, 3, 35, 43)
  ctx.fillStyle = '#2a2440'
  ctx.fillRect(4, 4, 33, 41)
  const face =
    p.state === 'hurt' || p.state === 'fall' || p.state === 'down' || p.state === 'dead'
      ? 'portrait_hurt'
      : p.state === 'attack' || p.state === 'special'
        ? 'portrait_angry'
        : 'portrait_neutral'
  drawPortrait(ctx, sheet(p.hero.sheet), face, 4, 5)
  drawText(ctx, p.hero.name, 42, 5, { color: p.hero.color, outline: OUT })
  drawText(ctx, String(p.score).padStart(6, '0'), 146, 5, { color: '#ffffff', outline: OUT, align: 'right' })
  const k = p.hp / p.maxHp
  bar(ctx, 42, 15, 104, 6, k, k > 0.3 ? '#ffd23a' : '#ff4a3a', ghostHp)
  const ready = p.specialCd <= 0
  bar(ctx, 42, 25, 60, 3, 1 - p.specialCd / p.hero.specialCooldown, ready ? '#5af0ff' : '#3a7aa0')
  if (ready && Math.floor(tick / 15) % 2 === 0) drawText(ctx, 'SPECIAL V', 106, 23, { color: '#5af0ff', outline: OUT })

  // last enemy hit
  if (foe && !foe.isBoss) {
    drawText(ctx, foe.name, VIEW_W - 6, 5, { color: '#ffffff', outline: OUT, align: 'right' })
    bar(ctx, VIEW_W - 86, 15, 80, 5, foe.hp / foe.maxHp, '#ff7a3a')
  }
  // boss bar along the bottom
  if (boss && boss.state !== 'dead') {
    const w = 220
    const x = (VIEW_W - w) >> 1
    drawText(ctx, boss.name, VIEW_W >> 1, VIEW_H - 22, { color: '#ff5a6a', outline: OUT, align: 'center' })
    bar(ctx, x, VIEW_H - 12, w, 6, boss.hp / boss.maxHp, '#e0283c')
    const face = boss.state === 'hurt' || boss.state === 'fall' || boss.state === 'down' ? 'portrait_hurt' : boss.state === 'attack' ? 'portrait_angry' : 'portrait_neutral'
    const s = sheet(boss.variant)
    if (s.frames[face]) {
      ctx.fillStyle = OUT
      ctx.fillRect(x - 38, VIEW_H - 45, 35, 43)
      ctx.fillStyle = '#3a1a28'
      ctx.fillRect(x - 37, VIEW_H - 44, 33, 41)
      drawPortrait(ctx, s, face, x - 37, VIEW_H - 43)
    }
  }
}

/** "7 HITS" on the right while a combo is going */
export function drawCombo(ctx: CanvasRenderingContext2D, hits: number, t: number) {
  if (hits < 2) return
  const color = hits >= 10 ? '#ff3aa8' : hits >= 5 ? '#ffe14a' : '#ffffff'
  const pop = t > 92 ? 1 : 0
  drawText(ctx, String(hits), VIEW_W - 8, 48 - pop, { scale: 3, align: 'right', color, outline: OUT, shadow: OUT })
  drawText(ctx, 'HITS', VIEW_W - 8, 72, { align: 'right', color, outline: OUT })
  if (hits >= 10) drawText(ctx, 'WAHNSINN!', VIEW_W - 8, 82, { align: 'right', color: '#ff3aa8', outline: OUT })
  else if (hits >= 5) drawText(ctx, 'GEIL!', VIEW_W - 8, 82, { align: 'right', color: '#ffe14a', outline: OUT })
}

export function drawGo(ctx: CanvasRenderingContext2D, tick: number) {
  if (Math.floor(tick / 20) % 2) return
  drawText(ctx, 'GO >', VIEW_W - 40, 92, { scale: 2, color: '#ffe14a', outline: OUT, align: 'center' })
}

export function drawBanner(ctx: CanvasRenderingContext2D, lines: { text: string; scale: number; color: string }[], y: number) {
  let cy = y
  for (const l of lines) {
    drawText(ctx, l.text, VIEW_W >> 1, cy, { scale: l.scale, color: l.color, outline: OUT, shadow: OUT, align: 'center' })
    cy += 7 * l.scale + 6
  }
}

export function dim(ctx: CanvasRenderingContext2D, a: number) {
  ctx.fillStyle = `rgba(6,4,14,${a})`
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
}
