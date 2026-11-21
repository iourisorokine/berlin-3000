import farUrl from '../assets/bg/far.png'
import glowUrl from '../assets/bg/glow.png'
import level from '../assets/bg/level.json'
import midUrl from '../assets/bg/mid.png'
import { audio } from './audio'
import { BARRIER_Y, GROUND_BOT, GROUND_TOP, VIEW_H, VIEW_W } from './constants'
import { sheet, type Sheet } from './sprites'

/** Where an enemy appears: a position, and whether it walks in (out of the queue, through a door). */
export interface SpawnPoint {
  x: number
  y: number
  enter: boolean
}

/** What every level's backdrop does for the game. */
export interface Stage {
  /** level length in art pixels */
  len: number
  /** where fighters can walk (feet y from, to) */
  band: [number, number]
  /** the door the hero walks through to finish the level */
  exit: { x: number; label: string }
  /** fighters standing above this line are drawn behind drawFront (behind the barriers) */
  split: number
  load(): Promise<void>
  /** one frame of stage life; returns a sideways jolt for everyone standing (braking trains) */
  update(): number
  drawBack(ctx: CanvasRenderingContext2D, camX: number, tick: number): void
  drawFront(ctx: CanvasRenderingContext2D, camX: number): void
  /** where an enemy from this source appears, or null if this stage has no such place */
  spawnPoint(from: string, camX: number): SpawnPoint | null
  /** false while spawns must wait (a train still braking into the station) */
  ready(): boolean
  /** a wave that needs a station starts / ends (the U-Bahn stops and leaves) */
  arrive?(): void
  depart?(): void
  /** back to the start of the level (a new run) */
  reset?(): void
  /** 0..1, how close the player is to the source of the music (the club door) */
  closeness(playerX: number): number
  /** a small picture of the level for the level-select screen */
  drawPreview(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void
}

/**
 * Level 1, QUEUE TO BERGHAIN. The background layers come from the ChatGPT images
 * (built by tools/import_backgrounds.py); the queue is made of the extras
 * sprites; barriers, lamp posts and kerb decorations come from the props sheets.
 */
const LEVEL_LEN: number = level.levelLen

export const DOOR_X = level.doorX
/** x positions of the gaps in the barriers, where enemies step out of the queue */
/** the open stretch of street at the start, before the first building (shows the skyline) */
export const OPEN = level.open
export const QUEUE_GAPS = [640, 1100, 1480, 1620].map((x) => x + OPEN)
/** where the queue starts (just past the Späti) */
const QUEUE_START = 410 + OPEN
/** lamp posts stand on the joins between building segments and hide the seams */
const LAMPS = level.segments.map((s) => s.x)

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  return [c, g] as const
}

async function loadImage(url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

type G = CanvasRenderingContext2D

/** stepped (banded) light pool: pixel-art friendly instead of a smooth gradient */
function pool(g: G, color: string, cx: number, cy: number, rx: number, ry: number, steps = 4, maxA = 0.22) {
  g.save()
  g.fillStyle = color
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps
    g.globalAlpha = maxA / steps
    g.beginPath()
    g.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

/** A darker, slightly blue copy of a sheet: people waiting in the shadows. */
function shaded(s: Sheet, k: number): Sheet {
  const [c, g] = canvas(s.img.width, s.img.height)
  g.drawImage(s.img, 0, 0)
  const d = g.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] *= k
    d.data[i + 1] *= k
    d.data[i + 2] = Math.min(255, d.data[i + 2] * k + 10)
  }
  g.putImageData(d, 0, 0)
  return { ...s, img: c }
}

interface QueuePerson {
  x: number
  y: number
  /** the two idle frames (rows of the extras sheet) */
  frames: [string, string]
  flip: boolean
  phase: number
  rate: number
  back: boolean
}

function buildQueue(): QueuePerson[] {
  const rnd = mulberry32(99)
  const out: QueuePerson[] = []
  const pick = (): [string, string] => {
    const sheet2 = rnd() < 0.5
    const i = 1 + Math.floor(rnd() * 8)
    return sheet2 ? [`c${i}`, `d${i}`] : [`a${i}`, `b${i}`]
  }
  for (let x = QUEUE_START; x < DOOR_X - 46; x += 17 + Math.floor(rnd() * 14)) {
    if (QUEUE_GAPS.some((g) => Math.abs(g - x) < 10)) continue
    out.push({ x, y: BARRIER_Y - 5, frames: pick(), flip: rnd() < 0.22, phase: rnd() * 200, rate: 26 + Math.floor(rnd() * 30), back: false })
    if (rnd() < 0.4) out.push({ x: x + 6, y: BARRIER_Y - 11, frames: pick(), flip: rnd() < 0.3, phase: rnd() * 200, rate: 26 + Math.floor(rnd() * 30), back: true })
  }
  return out.sort((a, b) => a.y - b.y)
}

/** decorations on the kerb before the queue starts: [frame, x] */
const DECOR: [string, number][] = [
  ['pillar', 40],
  ['tree', 46 + OPEN],
  ['fencepost', 214 + OPEN],
]

/** Barriers, lamp posts and kerb decorations, drawn in front of the queue. */
function drawBarriers(props: Sheet): HTMLCanvasElement {
  const [c, g] = canvas(LEVEL_LEN, VIEW_H)
  const put = (name: string, x: number, y: number) => {
    const f = props.frames[name]
    if (f) g.drawImage(props.img, f.x, f.y, f.w, f.h, Math.round(x - f.ax), Math.round(y - f.ay), f.w, f.h)
  }
  for (const [name, x] of DECOR) put(name, x, BARRIER_Y)
  const bw = props.frames.barrier?.w ?? 54
  for (let x = QUEUE_START - 8; x < DOOR_X - 46; x += bw - 2) {
    const cx = x + bw / 2
    if (QUEUE_GAPS.some((gx) => Math.abs(cx - gx) < bw / 2 + 10)) continue
    if (LAMPS.some((lx) => Math.abs(cx - lx) < bw / 2 + 2)) continue
    put('barrier', cx, BARRIER_Y)
  }
  // a knocked-over barrier at every gap: that is where people break out of the line
  for (const gx of QUEUE_GAPS) put('barrier_down', gx + 4, BARRIER_Y + 3)
  for (const lx of LAMPS) put('lamp', lx, BARRIER_Y)
  return c
}

function drawLight(): HTMLCanvasElement {
  const [c, g] = canvas(LEVEL_LEN, VIEW_H)
  for (const lx of LAMPS) {
    pool(g, '#ffb050', lx, 14, 26, 16, 4, 0.6)
    pool(g, '#ff9a3a', lx, 176, 74, 26, 5, 0.4)
  }
  return c
}

export class BerghainStage implements Stage {
  len = LEVEL_LEN
  split = BARRIER_Y
  band: [number, number] = [GROUND_TOP, GROUND_BOT]
  // the club door, once the bouncer is beaten
  exit = { x: DOOR_X, label: 'REIN!' }
  far!: HTMLImageElement
  mid!: HTMLImageElement
  glow!: HTMLImageElement
  barriers!: HTMLCanvasElement
  light = drawLight()
  queue = buildQueue()
  private crowdFront!: Sheet
  private crowdBack!: Sheet

  /** call after loadSprites() */
  async load() {
    ;[this.far, this.mid, this.glow] = await Promise.all([loadImage(farUrl), loadImage(midUrl), loadImage(glowUrl)])
    this.barriers = drawBarriers(sheet('props'))
    const extras = sheet('extras')
    this.crowdFront = shaded(extras, 0.82)
    this.crowdBack = shaded(extras, 0.6)
  }

  /** sky, skyline, buildings, street and the queue behind the barriers */
  drawBack(ctx: CanvasRenderingContext2D, camX: number, tick: number) {
    const farX = Math.round(camX * level.farParallax - level.farOffset)
    ctx.drawImage(this.far, farX, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)
    // blinking red light on top of the TV tower
    if (Math.floor(tick / 40) % 2 === 0) {
      ctx.fillStyle = '#ff3040'
      ctx.fillRect(level.towerX - farX - 1, Math.max(0, level.towerTipY + 1), 3, 2)
    }
    const cx = Math.round(camX)
    ctx.drawImage(this.mid, cx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    // club light pulsing with the kick drum
    ctx.globalAlpha = 0.15 + 0.55 * audio.pulse()
    ctx.drawImage(this.glow, cx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)
    ctx.globalAlpha = 1
    ctx.drawImage(this.light, cx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)
    ctx.restore()
    for (const q of this.queue) {
      const sx = q.x - cx
      if (sx < -30 || sx > VIEW_W + 30) continue
      const s = q.back ? this.crowdBack : this.crowdFront
      const name = q.frames[Math.floor((tick + q.phase) / q.rate) % 2]
      const f = s.frames[name]
      if (!f) continue
      ctx.save()
      ctx.translate(sx, q.y)
      if (q.flip) ctx.scale(-1, 1)
      ctx.drawImage(s.img, f.x, f.y, f.w, f.h, -f.ax, -f.ay, f.w, f.h)
      ctx.restore()
    }
  }

  drawFront(ctx: CanvasRenderingContext2D, camX: number) {
    ctx.drawImage(this.barriers, Math.round(camX), 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)
  }

  update() {
    return 0
  }

  ready() {
    return true
  }

  /** out of the queue through a gap in the barriers that is on screen, or out of the club door */
  spawnPoint(from: string, camX: number): SpawnPoint | null {
    if (from === 'door') return { x: DOOR_X, y: BARRIER_Y - 6, enter: true }
    if (from === 'queue') {
      const gaps = QUEUE_GAPS.filter((g) => g > camX + 24 && g < camX + VIEW_W - 24)
      if (!gaps.length) return null
      return { x: gaps[Math.floor(Math.random() * gaps.length)], y: BARRIER_Y - 8, enter: true }
    }
    return null
  }

  closeness(playerX: number) {
    return Math.max(0, Math.min(1, (playerX - 300) / (DOOR_X - 300)))
  }

  drawPreview(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    // the club facade with the skyline behind, squeezed into the card
    const sx = 1700
    ctx.drawImage(this.far, 120, 0, VIEW_W, VIEW_H, x, y, w, h)
    ctx.drawImage(this.mid, sx, 0, VIEW_W, VIEW_H, x, y, w, h)
  }
}
