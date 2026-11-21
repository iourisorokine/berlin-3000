import cafeUrl from '../assets/bg/prenzl/cafe.png'
import farUrl from '../assets/bg/prenzl/far.png'
import meta from '../assets/bg/prenzl/prenzl.json'
import streetUrl from '../assets/bg/prenzl/street.png'
import { GROUND_BOT, GROUND_TOP, VIEW_H, VIEW_W } from './constants'
import { drawFrame, sheet } from './sprites'
import type { SpawnPoint, Stage } from './stage'

/**
 * Level 3, LATTE ART ATTACK: a sunny Sunday in Prenzlauer Berg (built by tools/import_prenzl.py).
 * An open square with the skyline, then the shop fronts. Halfway along is a design cafe:
 * a side room the hero can walk into through its door, with a fight and a reward inside.
 */

async function loadImage(url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

/** street furniture on the open square: [frame, x] (a lamp post from level 1's props) */
const DECOR: [string, number][] = [['lamp', 150]]

export class PrenzlStage implements Stage {
  len = meta.levelLen
  split = 0
  band: [number, number] = [GROUND_TOP, GROUND_BOT]
  exit = { x: meta.exitDoor, label: 'BAUSTELLE!' }
  /** the cafe: its door in the street, and inside one screen with its own band and door out */
  side = { door: meta.cafeDoor, label: 'CAFE', band: meta.cafe.band as [number, number], doorScreenX: meta.cafe.door }
  /** the hero is inside the cafe */
  inSide = false
  private far!: HTMLImageElement
  private street!: HTMLImageElement
  private cafe!: HTMLImageElement

  async load() {
    ;[this.far, this.street, this.cafe] = await Promise.all([farUrl, streetUrl, cafeUrl].map(loadImage))
  }

  reset() {
    this.inSide = false
  }

  update() {
    return 0
  }

  ready() {
    return true
  }

  spawnPoint(from: string, camX: number): SpawnPoint | null {
    // inside the cafe, people come in through the door from the street
    if (from === 'door' && this.inSide) return { x: camX + this.side.doorScreenX, y: this.side.band[0] - 2, enter: true }
    return null
  }

  closeness() {
    return 0
  }

  drawBack(ctx: CanvasRenderingContext2D, camX: number, tick: number) {
    if (this.inSide) {
      ctx.drawImage(this.cafe, 0, 0)
      // steam rising from the espresso machine
      for (let i = 0; i < 3; i++) {
        const t = (tick + i * 20) % 60
        ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - t / 60)})`
        ctx.fillRect(112 + Math.round(Math.sin((tick + i * 13) / 8) * 2), 110 - t / 2, 2, 2)
      }
      return
    }
    const cx = Math.round(camX)
    // the skyline drifts slowly behind the open square
    const fx = Math.round(camX * 0.12) % this.far.width
    ctx.drawImage(this.far, fx, 0, Math.min(VIEW_W, this.far.width - fx), VIEW_H, 0, 0, Math.min(VIEW_W, this.far.width - fx), VIEW_H)
    if (this.far.width - fx < VIEW_W) ctx.drawImage(this.far, 0, 0, VIEW_W, VIEW_H, this.far.width - fx, 0, VIEW_W, VIEW_H)
    ctx.drawImage(this.street, cx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)
    const props = sheet('props')
    for (const [name, x] of DECOR) if (x - cx > -60 && x - cx < VIEW_W + 60) drawFrame(ctx, props, name, x - cx, meta.wallBase + 4, 1)
  }

  drawFront() {}

  drawPreview(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.drawImage(this.street, meta.cafeDoor - VIEW_W / 2, 0, VIEW_W, VIEW_H, x, y, w, h)
  }
}
