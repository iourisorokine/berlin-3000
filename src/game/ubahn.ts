import closedUrl from '../assets/bg/ubahn/doors_closed.png'
import doorsUrl from '../assets/bg/ubahn/doors_open.png'
import stationUrl from '../assets/bg/ubahn/station.png'
import trainUrl from '../assets/bg/ubahn/train.png'
import tunnelUrl from '../assets/bg/ubahn/tunnel.png'
import meta from '../assets/bg/ubahn/ubahn.json'
import { audio } from './audio'
import { VIEW_H, VIEW_W } from './constants'
import { drawFrame, sheet } from './sprites'
import type { SpawnPoint, Stage } from './stage'

/**
 * Level 2, LETZTE BAHN: a night train, carriage by carriage. The carriage walls have their
 * windows cut out; behind them the tunnel rushes past, or a station slides in when the train
 * stops. At stations the doors open and new enemies board (built by tools/import_ubahn.py).
 */

/** cruising speed of the scenery behind the windows (art px per frame) */
const CRUISE = 7
/** frames to brake into a station and to get going again */
const BRAKE_FRAMES = 110
const LEAVE_FRAMES = 100
const TILE = meta.segW
/** a station is three tiles long (the middle one mirrored), so it always fills the screen */
const STATION_TILES = 3

type TrainState = 'moving' | 'braking' | 'stopped' | 'closing' | 'leaving'

async function loadImage(url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

interface Passenger {
  x: number
  frames: [string, string]
  flip: boolean
  phase: number
  rate: number
}

/** passengers sitting on the benches (and a couple standing by the doors) */
function seatPassengers(): Passenger[] {
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const seated = [1, 2, 3, 4, 5, 8]
  const out: Passenger[] = []
  for (const [a, b] of meta.seats) {
    const standing = b - a < 80
    if (standing) {
      if (rnd() < 0.7) {
        const i = rnd() < 0.5 ? 6 : 7
        out.push({ x: (a + b) / 2, frames: [`p${i}`, `q${i}`], flip: rnd() < 0.5, phase: rnd() * 100, rate: 30 + Math.floor(rnd() * 30) })
      }
      continue
    }
    for (let x = a + 14; x < b - 14; x += 34 + Math.floor(rnd() * 44)) {
      if (rnd() < 0.35) continue // an empty seat
      const i = seated[Math.floor(rnd() * seated.length)]
      out.push({ x, frames: [`p${i}`, `q${i}`], flip: rnd() < 0.25, phase: rnd() * 100, rate: 30 + Math.floor(rnd() * 40) })
    }
  }
  return out
}

export class UbahnStage implements Stage {
  len = meta.levelLen
  split = 0
  band = meta.band as [number, number]
  // the last station: the hero gets off through the open doors
  exit = { x: meta.doors[meta.doors.length - 1], label: 'AUSSTEIGEN!' }
  private train!: HTMLImageElement
  private doors!: HTMLImageElement
  private closed!: HTMLImageElement
  private tunnel!: HTMLImageElement
  private station!: HTMLImageElement
  private passengers = seatPassengers()
  /** how far the train has travelled (art px): scrolls the scenery behind the windows */
  private track = 0
  private speed = CRUISE
  private state: TrainState = 'moving'
  private stateT = 0
  /** first tile (in track coordinates) of the station being served, or null between stations */
  private stationTile: number | null = null
  private camX = 0
  private flicker = 0

  async load() {
    ;[this.train, this.doors, this.closed, this.tunnel, this.station] = await Promise.all([trainUrl, doorsUrl, closedUrl, tunnelUrl, stationUrl].map(loadImage))
  }

  reset() {
    this.state = 'moving'
    this.stateT = 0
    this.speed = CRUISE
    this.stationTile = null
  }

  get doorsOpen() {
    return this.state === 'stopped' && this.stateT > 30
  }

  /** brake so that a station ends up centred behind the screen */
  arrive() {
    if (this.state !== 'moving') return
    this.state = 'braking'
    this.stateT = 0
    const stopAt = this.track + (CRUISE * BRAKE_FRAMES) / 2
    const centre = stopAt + this.camX + VIEW_W / 2
    this.stationTile = Math.round((centre - (STATION_TILES * TILE) / 2) / TILE)
    audio.brake()
  }

  depart() {
    if (this.state !== 'stopped') return
    this.state = 'closing'
    this.stateT = 0
    audio.chime()
  }

  ready() {
    return this.state === 'moving' || this.doorsOpen
  }

  update() {
    this.stateT++
    let jolt = 0
    switch (this.state) {
      case 'braking':
        this.speed = CRUISE * Math.max(0, 1 - this.stateT / BRAKE_FRAMES)
        // braking throws everyone forward: one big lurch, then a steady push
        jolt = this.stateT === 1 ? 2.4 : 0.04
        if (this.stateT >= BRAKE_FRAMES) {
          this.state = 'stopped'
          this.stateT = 0
          this.speed = 0
          jolt = -0.8 // the train settles back
        }
        break
      case 'stopped':
        if (this.stateT === 30) audio.doors()
        break
      case 'closing':
        if (this.stateT === 20) audio.doors()
        if (this.stateT > 50) {
          this.state = 'leaving'
          this.stateT = 0
          jolt = -2 // pulling away throws everyone back
        }
        break
      case 'leaving':
        this.speed = CRUISE * Math.min(1, this.stateT / LEAVE_FRAMES)
        if (this.stateT >= LEAVE_FRAMES) {
          this.state = 'moving'
          this.speed = CRUISE
        }
        break
      case 'moving':
        // the station disappears once it is well behind the train
        if (this.stationTile !== null && (this.stationTile + STATION_TILES) * TILE < this.track + this.camX - TILE) this.stationTile = null
        if (Math.random() < 0.002) this.flicker = 8
        break
    }
    this.track += this.speed
    audio.trainSpeed = this.speed / CRUISE
    if (this.flicker > 0) this.flicker--
    return jolt
  }

  spawnPoint(from: string, camX: number): SpawnPoint | null {
    if (from !== 'train' || !this.doorsOpen) return null
    // out of the nearest open door on screen
    const doors = meta.doors.filter((d) => d > camX + 20 && d < camX + VIEW_W - 20)
    if (!doors.length) return null
    const d = doors[Math.floor(Math.random() * doors.length)]
    return { x: d + (Math.random() - 0.5) * 24, y: meta.wallBase + 6, enter: true }
  }

  closeness() {
    return 0
  }

  /** the scenery behind the windows: tunnel tiles, with a station in the middle while stopping */
  private drawOutside(ctx: CanvasRenderingContext2D, camX: number) {
    const u0 = this.track + camX
    const first = Math.floor(u0 / TILE)
    for (let k = first; k * TILE < u0 + VIEW_W; k++) {
      const sx = Math.round(k * TILE - u0)
      const inStation = this.stationTile !== null && k >= this.stationTile && k < this.stationTile + STATION_TILES
      if (inStation) {
        const mid = k - this.stationTile! === 1
        if (mid) {
          ctx.save()
          ctx.translate(sx + TILE, 0)
          ctx.scale(-1, 1)
          ctx.drawImage(this.station, 0, 0)
          ctx.restore()
        } else ctx.drawImage(this.station, sx, 0)
      } else ctx.drawImage(this.tunnel, sx, 0)
    }
    // a speed blur: tunnel lamps smear into streaks at full speed
    if (this.speed > 3) {
      ctx.fillStyle = `rgba(0,0,0,${(this.speed / CRUISE) * 0.18})`
      ctx.fillRect(0, 0, VIEW_W, meta.wallBase)
    }
  }

  drawBack(ctx: CanvasRenderingContext2D, camX: number, tick: number) {
    this.camX = camX
    const cx = Math.round(camX)
    this.drawOutside(ctx, cx)
    // the train shakes a little on the rails while moving
    const rattle = this.speed > 1 && tick % 9 < 2 ? 1 : 0
    ctx.drawImage(this.train, cx, 0, VIEW_W, VIEW_H, 0, rattle, VIEW_W, VIEW_H)
    // the door sections, open at stations (until the closing chime has rung)
    const open = this.doorsOpen || (this.state === 'closing' && this.stateT < 20)
    const img = open ? this.doors : this.closed
    for (const s of meta.segments)
      if (s.name === 'car_b' && s.x + s.w > cx && s.x < cx + VIEW_W) ctx.drawImage(img, s.x - cx, meta.wallBase - img.height + rattle)
    // passengers on the benches
    const ex = sheet('extras_ubahn')
    for (const p of this.passengers) {
      const sx = p.x - cx
      if (sx < -40 || sx > VIEW_W + 40) continue
      drawFrame(ctx, ex, p.frames[Math.floor((tick + p.phase) / p.rate) % 2], sx, meta.wallBase + rattle, p.flip ? -1 : 1)
    }
    // the fluorescent tubes flicker now and then
    if (this.flicker > 0 && this.flicker % 3 !== 0) {
      ctx.fillStyle = 'rgba(0,0,10,0.35)'
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    }
  }

  drawFront() {}

  drawPreview(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    // a station behind the windows, the door section in front
    const k = w / VIEW_W
    for (let i = 0; i * TILE < VIEW_W; i++) ctx.drawImage(this.station, x + i * TILE * k, y, TILE * k, h)
    ctx.drawImage(this.train, 260, 0, VIEW_W, VIEW_H, x, y, w, h)
  }
}
