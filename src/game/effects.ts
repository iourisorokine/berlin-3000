import { drawFrame, sheet } from './sprites'
import { drawText } from './font'

/** A sprite animation from the fx atlas (sparks, dust, flash, shockwave...). */
interface Anim {
  frames: string[]
  /** game frames per image */
  rate: number
  t: number
  x: number
  y: number
  z: number
  facing: 1 | -1
}

/** A tiny coloured pixel: sweat drops on a hit, confetti on a KO. */
interface Bit {
  x: number
  y: number
  z: number
  vx: number
  vz: number
  color: string
  size: number
  t: number
  life: number
  /** confetti flutters down slowly */
  flutter: boolean
}

/** Something knocked out of a pocket: tumbles, bounces once, blinks away. Visual only. */
interface Debris {
  /** atlas it comes from */
  sheet: 'items' | 'fx'
  name: string
  x: number
  y: number
  z: number
  vx: number
  vz: number
  rot: number
  spin: number
  t: number
}

/** pocket contents that fly out on a heavy hit: [atlas, frame] */
const POCKETS: [Debris['sheet'], string][] = [
  ['fx', 'sunglasses'],
  ['fx', 'buckethat'],
  ['fx', 'sneaker'],
  ['fx', 'cap'],
  ['fx', 'coin'],
  ['fx', 'coin'],
  ['fx', 'keys'],
  ['fx', 'lighter'],
  ['fx', 'earbuds'],
  ['fx', 'feather'],
  ['items', 'glowstick'],
  ['items', 'phone'],
  ['items', 'cash'],
]

/** a puff of vape smoke drifting up */
interface Cloud {
  x: number
  y: number
  z: number
  vx: number
  t: number
  life: number
}

/** a streak of wind from the fan */
interface Streak {
  x: number
  y: number
  len: number
  dir: 1 | -1
  t: number
}

/** a Berlin pigeon startled by a KO, flapping away */
interface Pigeon {
  x: number
  y: number
  z: number
  vx: number
  t: number
}
const CONFETTI = ['#ff3aa8', '#3af0ff', '#c8ff3a', '#ffe14a', '#b06bff', '#ffffff']
const SWEAT = ['#d8f0ff', '#9fd8ff', '#ffffff']

interface Popup {
  x: number
  y: number
  text: string
  color: string
  t: number
}

export type PickupKind =
  | 'doner' | 'currywurst' | 'pretzel' | 'mate' | 'cash' | 'phone' | 'wristband' | 'glowstick'
  // the U-Bahn's lost and found
  | 'ticket' | 'falafel' | 'gummies' | 'coffee' | 'umbrella' | 'pizzabox' | 'skate' | 'gnome' | 'shoe' | 'keys' | 'wallet' | 'shades'

/** U-Bahn pickups live on their own sheet */
const UBAHN_ITEMS = new Set<PickupKind>(['ticket', 'falafel', 'gummies', 'coffee', 'umbrella', 'pizzabox', 'skate', 'gnome', 'shoe', 'keys', 'wallet', 'shades'])
export const itemSheet = (k: PickupKind) => (UBAHN_ITEMS.has(k) ? 'items_ubahn' : 'items')

export interface Pickup {
  kind: PickupKind
  x: number
  y: number
  z: number
  vz: number
  t: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const seq = (base: string, n = 4) => Array.from({ length: n }, (_, i) => `${base}${i + 1}`)

export class Effects {
  anims: Anim[] = []
  bits: Bit[] = []
  debris: Debris[] = []
  pigeons: Pigeon[] = []
  clouds: Cloud[] = []
  streaks: Streak[] = []

  /** a vape cloud in front of someone's face */
  vape(x: number, y: number, z: number, dir: 1 | -1) {
    for (let i = 0; i < 6; i++) this.clouds.push({ x: x + dir * i * 5, y: y + rand(-3, 3), z: z + rand(-4, 4), vx: dir * rand(0.2, 0.6), t: -i * 2, life: 70 })
  }

  /** wind streaks blowing away from a fan */
  gust(x: number, y: number, dir: 1 | -1) {
    for (let i = 0; i < 9; i++) this.streaks.push({ x: x + rand(-4, 10) * dir, y: y - rand(8, 60), len: rand(10, 26), dir, t: -Math.floor(rand(0, 6)) })
  }

  /** a small camera flash without the full-screen blink (selfies) */
  snap(x: number, y: number, z: number) {
    this.play('flash', x, y, z, 2)
  }
  popups: Popup[] = []
  pickups: Pickup[] = []
  /** frames left of the full-screen white blink after a camera flash */
  flashT = 0

  private play(base: string, x: number, y: number, z: number, rate = 3, facing: 1 | -1 = 1) {
    this.anims.push({ frames: seq(base), rate, t: 0, x, y, z, facing })
  }

  spark(x: number, y: number, z: number, heavy: boolean) {
    this.play(heavy ? 'heavy' : 'hit', x, y, z, heavy ? 3 : 2)
  }

  /** cartoon hit reaction: sweat flies, and a heavy hit knocks something out of a pocket */
  hitGag(x: number, y: number, z: number, dir: 1 | -1, heavy: boolean) {
    for (let i = 0; i < (heavy ? 6 : 3); i++) {
      this.bits.push({ x, y, z, vx: dir * rand(0.3, 1.8), vz: rand(1, 2.6), color: SWEAT[i % SWEAT.length], size: 1, t: 0, life: 40, flutter: false })
    }
    if (heavy && Math.random() < 0.75) {
      const [sheet, name] = POCKETS[Math.floor(Math.random() * POCKETS.length)]
      this.debris.push({ sheet, name, x, y: y + rand(-3, 3), z, vx: dir * rand(1, 2.4), vz: rand(2.5, 3.6), rot: 0, spin: dir * rand(0.2, 0.4), t: 0 })
    }
  }

  /** gum chewers blow a bubble that pops when they get hit */
  gum(x: number, y: number, z: number, facing: 1 | -1) {
    this.anims.push({ frames: ['gum1', 'gum2', 'gum3', 'gum4'], rate: 5, t: 0, x, y, z, facing })
  }

  /** sometimes a KO startles a pigeon */
  pigeon(x: number, y: number) {
    this.pigeons.push({ x, y, z: 4, vx: Math.random() < 0.5 ? -1.4 : 1.4, t: 0 })
  }

  /** PSYCHEDELIC RAVE: music notes and psychedelic light bursting from the shovel */
  music(x: number, y: number, z: number) {
    this.anims.push({ frames: Array.from({ length: 8 }, (_, i) => `music${i + 1}`), rate: 6, t: 0, x, y, z, facing: 1 })
  }

  /** KO: a burst of rave confetti */
  confetti(x: number, y: number, z: number) {
    for (let i = 0; i < 26; i++) {
      this.bits.push({
        x: x + rand(-4, 4),
        y: y + rand(-3, 3),
        z,
        vx: rand(-1.6, 1.6),
        vz: rand(1.5, 4),
        color: CONFETTI[i % CONFETTI.length],
        size: Math.random() < 0.3 ? 2 : 1,
        t: 0,
        life: 110,
        flutter: true,
      })
    }
  }

  /** boss stomp: a dust cloud each side and a small shockwave */
  stomp(x: number, y: number) {
    this.play('dust', x - 18, y, 2, 4)
    this.play('dust', x + 18, y, 2, 4)
    this.play('wave', x, y, 0, 4)
  }

  dust(x: number, y: number, big = false) {
    this.play('dust', x, y, big ? 4 : 2, big ? 4 : 3)
  }

  flash(x: number, y: number, z: number) {
    this.play('flash', x, y, z, 3)
    this.flashT = 6
  }

  bottle(x: number, y: number, z: number) {
    this.play('bottle', x, y, z, 4)
  }

  shockwave(x: number, y: number) {
    this.play('wave', x, y, 0, 5)
  }

  ramDust(x: number, y: number, facing: 1 | -1) {
    this.anims.push({ frames: ['ramdust', 'ramfade'], rate: 10, t: 0, x, y, z: 0, facing })
  }

  ramHit(x: number, y: number, facing: 1 | -1) {
    this.anims.push({ frames: ['ramhit', 'ramhit', 'ramfade'], rate: 4, t: 0, x, y, z: 0, facing })
  }

  popup(x: number, y: number, text: string, color = '#ffe14a') {
    this.popups.push({ x, y, text, color, t: 0 })
  }

  drop(kind: PickupKind, x: number, y: number) {
    this.pickups.push({ kind, x, y, z: 6, vz: 2, t: 0 })
  }

  update() {
    for (const a of this.anims) a.t++
    this.anims = this.anims.filter((a) => a.t < a.frames.length * a.rate)
    for (const b of this.bits) {
      b.t++
      if (b.z > 0 || b.vz > 0) {
        b.x += b.vx
        b.z += b.vz
        b.vz -= b.flutter ? 0.09 : 0.2
        if (b.flutter) {
          b.vz = Math.max(b.vz, -0.6)
          b.vx *= 0.97
          b.x += Math.sin((b.t + b.y) * 0.3) * 0.3
        }
        if (b.z <= 0) b.z = 0
      }
    }
    this.bits = this.bits.filter((b) => b.t < b.life)
    for (const d of this.debris) {
      d.t++
      if (d.z > 0 || d.vz > 0) {
        d.x += d.vx
        d.z += d.vz
        d.vz -= 0.2
        d.rot += d.spin
        if (d.z <= 0) {
          // one small bounce, then it lies still
          d.z = 0
          d.vz = Math.abs(d.vz) > 1.2 ? Math.abs(d.vz) * 0.35 : 0
          d.vx *= 0.5
          d.spin *= 0.5
        }
      }
    }
    this.debris = this.debris.filter((d) => d.t < 70)
    for (const p of this.pigeons) {
      p.t++
      p.x += p.vx
      p.z += 1.1 + Math.sin(p.t * 0.6) * 0.6
    }
    this.pigeons = this.pigeons.filter((p) => p.z < 260)
    for (const c of this.clouds) {
      c.t++
      c.x += c.vx
      c.z += 0.25
    }
    this.clouds = this.clouds.filter((c) => c.t < c.life)
    for (const s of this.streaks) {
      s.t++
      s.x += s.dir * 4
    }
    this.streaks = this.streaks.filter((s) => s.t < 18)
    if (this.flashT > 0) this.flashT--
    for (const p of this.popups) {
      p.t++
      p.y -= 0.4
    }
    this.popups = this.popups.filter((p) => p.t < 50)
    for (const d of this.pickups) {
      d.t++
      if (d.z > 0 || d.vz > 0) {
        d.z += d.vz
        d.vz -= 0.25
        if (d.z < 0) d.z = d.vz = 0
      }
    }
    this.pickups = this.pickups.filter((d) => d.t < 900)
  }

  /** pickups and things lying on the ground: drawn before the fighters */
  drawGround(ctx: CanvasRenderingContext2D, camX: number, tick: number) {
    for (const d of this.debris) {
      if (d.z > 0 || (d.t > 50 && Math.floor(d.t / 3) % 2)) continue
      drawFrame(ctx, sheet(d.sheet), d.name, d.x - camX, d.y, 1, { tilt: d.rot })
    }
    for (const d of this.pickups) {
      if (d.t > 780 && Math.floor(d.t / 4) % 2) continue
      const bob = d.z === 0 ? Math.round(Math.sin(tick / 12) * 1) : 0
      ctx.fillStyle = 'rgba(8,6,16,0.45)'
      ctx.fillRect(Math.round(d.x - camX) - 5, Math.round(d.y), 11, 1)
      drawFrame(ctx, sheet(itemSheet(d.kind)), d.kind, d.x - camX, d.y - d.z - 1 + bob, 1)
    }
  }

  /** sparks, sweat, confetti, dust, flashes: drawn over the fighters */
  drawAir(ctx: CanvasRenderingContext2D, camX: number) {
    const fx = sheet('fx')
    for (const a of this.anims) {
      const name = a.frames[Math.min(a.frames.length - 1, Math.floor(a.t / a.rate))]
      drawFrame(ctx, fx, name, a.x - camX, a.y - a.z, a.facing)
    }
    for (const d of this.debris) if (d.z > 0) drawFrame(ctx, sheet(d.sheet), d.name, d.x - camX, d.y - d.z, 1, { tilt: d.rot })
    for (const p of this.pigeons) drawFrame(ctx, fx, 'pigeon', p.x - camX, p.y - p.z, p.vx > 0 ? 1 : -1)
    for (const c of this.clouds) {
      if (c.t < 0) continue
      const k = c.t / c.life
      drawFrame(ctx, fx, 'puff', c.x - camX, c.y - c.z, 1, { scale: k < 0.3 ? 2 : 3, alpha: 0.75 * (1 - k) })
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    for (const s of this.streaks) {
      if (s.t < 0) continue
      ctx.globalAlpha = 1 - s.t / 18
      ctx.fillRect(Math.round(s.x - camX - (s.dir > 0 ? 0 : s.len)), Math.round(s.y), Math.round(s.len), 1)
    }
    ctx.globalAlpha = 1
    for (const b of this.bits) {
      if (b.t > b.life - 20 && Math.floor(b.t / 2) % 2) continue
      ctx.fillStyle = b.color
      ctx.fillRect(Math.round(b.x - camX), Math.round(b.y - b.z), b.size, b.size)
    }
    for (const p of this.popups) {
      drawText(ctx, p.text, Math.round(p.x - camX), Math.round(p.y), { align: 'center', color: p.color, outline: '#14101c' })
    }
  }
}

/** dizzy stars circling over someone's head (looping) */
export function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  drawFrame(ctx, sheet('fx'), `stars${1 + (Math.floor(tick / 6) % 4)}`, x, y, 1)
}
