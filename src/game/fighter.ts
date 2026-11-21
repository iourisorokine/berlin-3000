import { DOWN_TIME, FRICTION, GETUP_INVULN, GRAVITY, HIT_DEPTH, HIT_HEIGHT } from './constants'
import { drawFrame, sheet, type SheetKey } from './sprites'

export type State =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'jump'
  | 'land'
  | 'special'
  | 'hurt'
  | 'fall'
  | 'down'
  | 'getup'
  | 'dead'
  | 'enter'
  | 'victory'

export interface MoveFrame {
  name: string
  dur: number
}

/** An attack: which frames to show, when it hurts, how far it reaches, what it does. */
/** Bigger characters reach further: scales the reach of every move in a table, once, at load. */
export function scaleReach(moves: Move[], k: number) {
  for (const m of moves) m.reach = Math.round(m.reach * k)
}

export interface Move {
  id: string
  frames: MoveFrame[]
  /** frames (counted from the move's start) during which it can hit */
  active: [number, number]
  /** how far in front of the body centre it reaches */
  reach: number
  damage: number
  /** sideways push given to the victim */
  knockback: number
  knockdown: boolean
  heavy?: boolean
  /** can hit several targets (each once) */
  multi?: boolean
  /** hits all around (shockwave) instead of only in front */
  radial?: boolean
  /** radial moves: how far in depth they reach (default 22) */
  depth?: number
  /** frames the victim stays dazed (dancing) instead of a short flinch */
  stun?: number
  /** multi-hit: the same targets can be hit again every this many frames while active */
  rehit?: number
  /** the hero spins on the spot (tornado specials) */
  spin?: boolean
  /** throws something instead of hitting up close (VINYL VIKTOR's records) */
  projectile?: { sprite: string; speed: number; damage: number; knockdown: boolean }
  /** the stun turns targets into silver statues (YO HIGHNESS's art installation) */
  statue?: boolean
  /** forward speed during the active frames */
  lunge?: number
  /** the attacker's trick at the first active frame (effect + sound) */
  fx?: 'flash' | 'stomp' | 'vape' | 'gust' | 'gum' | 'selfie' | 'click' | 'thump' | 'ticket' | 'stagger' | 'chord'
  /** shouted when the wind-up starts */
  say?: string
  /** does not flinch when hit during the wind-up */
  armor?: boolean
  /** a taunt: plays, but never hurts */
  harmless?: boolean
}

// Enemy moves live in enemy.ts; heroes' moves in heroes.ts.

/** Which frames a character uses for the moves that are not attacks. */
export interface AnimSet {
  idle: string[]
  /** frames per idle image */
  idleRate: number
  /** null = no walk-cycle sheet yet: idle frames + a step bob */
  walk: string[] | null
  jumpAir: string
  jumpCrouch: string
  land?: string
  /** damage frames; when missing the idle frame is tilted instead */
  hurt?: string
  fall?: string
  down?: string
  getup?: string
  win?: string[]
}

export const DEFAULT_ANIM: AnimSet = { idle: ['idle1'], idleRate: 24, walk: null, jumpAir: 'idle1', jumpCrouch: 'idle1' }

let nextId = 1

export interface Fighter {
  id: number
  isPlayer: boolean
  name: string
  variant: SheetKey
  anim: AnimSet
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  facing: 1 | -1
  hp: number
  maxHp: number
  state: State
  /** frames spent in the current state */
  t: number
  move: Move | null
  hitList: Set<number>
  /** the current move hit someone (lets the combo continue) */
  connected: boolean
  comboStep: number
  comboTimer: number
  invuln: number
  /** frozen frames (hit-stop) */
  hitstop: number
  flash: number
  /** frames left dazed (from a stun move) */
  stunT: number
  /** frozen as a statue while stunned */
  statue: boolean
  /** running (players): faster walk cycle */
  running?: boolean
  /** walking speed multiplier */
  speed: number
  /** damage multiplier */
  power: number
  // --- AI ---
  cooldown: number
  attacker: boolean
  thinkT: number
  goalX: number
  goalY: number
  /** moves the boss may use */
  moves: Move[]
  remove: boolean
}

export function makeFighter(p: Partial<Fighter> & { name: string; variant: SheetKey; x: number; y: number; hp: number }): Fighter {
  return {
    id: nextId++,
    anim: DEFAULT_ANIM,
    isPlayer: false,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: -1,
    maxHp: p.hp,
    state: 'idle',
    t: 0,
    move: null,
    hitList: new Set(),
    connected: false,
    comboStep: 0,
    comboTimer: 0,
    invuln: 0,
    hitstop: 0,
    flash: 0,
    stunT: 0,
    statue: false,
    speed: 1,
    power: 1,
    cooldown: 60,
    attacker: false,
    thinkT: 0,
    goalX: p.x,
    goalY: p.y,
    moves: [],
    remove: false,
    ...p,
  }
}

export function setState(f: Fighter, s: State) {
  f.state = s
  f.t = 0
}

export function startMove(f: Fighter, m: Move, state: State = 'attack') {
  setState(f, state)
  f.move = m
  f.hitList.clear()
  f.connected = false
}

export function moveLength(m: Move) {
  return m.frames.reduce((a, fr) => a + fr.dur, 0)
}

export function moveFrame(f: Fighter) {
  const m = f.move!
  let t = f.t
  for (const fr of m.frames) {
    if (t < fr.dur) return fr.name
    t -= fr.dur
  }
  return m.frames[m.frames.length - 1].name
}

export function isActive(f: Fighter) {
  return !!f.move && f.t >= f.move.active[0] && f.t <= f.move.active[1]
}

export const busy = (f: Fighter) => f.state !== 'idle' && f.state !== 'walk'
export const canBeHit = (f: Fighter) =>
  f.invuln <= 0 && !['fall', 'down', 'getup', 'dead', 'enter'].includes(f.state) && !f.remove

/** Belt-brawler hit test: in front within reach, roughly the same depth and height. */
export function inReach(a: Fighter, t: Fighter, m: Move) {
  if (m.radial) return Math.abs(t.x - a.x) < m.reach && Math.abs(t.y - a.y) < (m.depth ?? 22) && t.z < 20
  const dx = (t.x - a.x) * a.facing
  return dx > -8 && dx < m.reach + 10 && Math.abs(t.y - a.y) < (m.depth ?? HIT_DEPTH) && Math.abs(t.z - a.z) < HIT_HEIGHT
}

/** Applies a hit. Returns true when the victim goes down. */
export function takeHit(t: Fighter, a: Fighter, m: Move): boolean {
  const dmg = Math.round(m.damage * a.power)
  t.hp = Math.max(0, t.hp - dmg)
  t.flash = 6
  t.facing = a.x < t.x ? -1 : 1
  t.move = null
  const down = m.knockdown || t.hp <= 0
  if (down) {
    t.stunT = 0
    t.statue = false
    t.hitList.clear()
    setState(t, 'fall')
    t.vz = 3.4
    t.z = Math.max(t.z, 1)
    t.vx = -t.facing * m.knockback
  } else {
    setState(t, 'hurt')
    t.vx = -t.facing * m.knockback
  }
  return down
}

/** Gravity, sliding, and the hurt → fall → down → get-up chain. Returns an event name. */
export function physics(f: Fighter): 'landed' | 'thud' | null {
  let ev: 'landed' | 'thud' | null = null
  f.t++
  if (f.invuln > 0) f.invuln--
  if (f.flash > 0) f.flash--
  f.x += f.vx
  f.y += f.vy
  if (f.z > 0 || f.vz > 0) {
    f.z += f.vz
    f.vz -= GRAVITY
    if (f.z <= 0) {
      f.z = 0
      f.vz = 0
      if (f.state === 'fall') {
        setState(f, 'down')
        ev = 'thud'
      } else ev = 'landed'
    }
  } else {
    f.vx *= FRICTION
    if (Math.abs(f.vx) < 0.05) f.vx = 0
  }
  f.vy = 0
  switch (f.state) {
    case 'hurt':
      if (f.stunT > 0) f.stunT--
      else if (f.t > 16) setState(f, 'idle')
      break
    case 'down':
      f.vx *= 0.7
      if (f.t > (f.isPlayer ? 34 : DOWN_TIME)) {
        if (f.hp <= 0) setState(f, 'dead')
        else setState(f, 'getup')
      }
      break
    case 'getup':
      if (f.t > 14) {
        setState(f, 'idle')
        f.invuln = f.isPlayer ? GETUP_INVULN : 20
      }
      break
    case 'dead':
      if (f.t > 70 && !f.isPlayer) f.remove = true
      break
  }
  return ev
}

/** Which atlas frame to show, plus tilt and a small vertical bob. */
function pose(f: Fighter): { name: string; tilt: number; bob: number } {
  switch (f.state) {
    case 'idle':
    case 'enter': {
      const a = f.anim
      return { name: a.idle[Math.floor((f.t + f.id * 7) / a.idleRate) % a.idle.length], tilt: 0, bob: 0 }
    }
    case 'walk': {
      const w = f.anim.walk
      if (w) return { name: w[Math.floor(f.t / (f.running ? 4 : 7)) % w.length], tilt: 0, bob: 0 }
      // no walk-cycle sheet yet: idle frames + a step bob
      const step = Math.floor(f.t / 8) % 2
      return { name: f.anim.idle[step % f.anim.idle.length], tilt: 0, bob: step ? -1 : 0 }
    }
    case 'jump':
      if (f.z > 2 && f.move) return { name: moveFrame(f), tilt: 0, bob: 0 }
      return { name: f.z > 2 ? f.anim.jumpAir : f.anim.jumpCrouch, tilt: 0, bob: 0 }
    case 'land':
      return { name: f.anim.land ?? f.anim.jumpCrouch, tilt: 0, bob: 0 }
    case 'getup':
      return { name: f.anim.getup ?? f.anim.jumpCrouch, tilt: 0, bob: 0 }
    case 'victory': {
      const w = f.anim.win ?? f.anim.idle
      return { name: w[Math.floor(f.t / 22) % w.length], tilt: 0, bob: 0 }
    }
    case 'attack':
    case 'special':
      return { name: f.move ? moveFrame(f) : 'idle1', tilt: 0, bob: 0 }
    case 'hurt':
      if (f.anim.hurt) return { name: f.anim.hurt, tilt: 0, bob: 0 }
      return { name: f.anim.idle[0], tilt: f.t < 8 ? 0.28 : 0.14, bob: 0 }
    case 'fall':
      if (f.anim.fall) return { name: f.anim.fall, tilt: 0, bob: 0 }
      return { name: f.anim.idle[0], tilt: Math.min(1.35, 0.4 + f.t * 0.06), bob: 0 }
    case 'down':
    case 'dead':
      if (f.anim.down) return { name: f.anim.down, tilt: 0, bob: 0 }
      return { name: f.anim.idle[0], tilt: Math.PI / 2, bob: 0 }
  }
}

export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, camX: number) {
  const sx = f.x - camX
  // shadow on the ground
  const sw = Math.max(8, 22 - f.z * 0.25)
  ctx.fillStyle = 'rgba(8,6,16,0.45)'
  ctx.beginPath()
  ctx.ellipse(Math.round(sx), Math.round(f.y), sw / 2, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  if (f.state === 'dead' && !f.isPlayer && f.t > 30 && Math.floor(f.t / 4) % 2 === 0) return
  if (f.invuln > 3 && f.isPlayer && Math.floor(f.invuln / 3) % 2 === 0) return
  const p = pose(f)
  // dazed: dances on the spot, turning left and right to the beat
  const stone = f.stunT > 0 && f.statue
  let facing = !stone && f.stunT > 0 && Math.floor(f.stunT / 12) % 2 ? (-f.facing as 1 | -1) : f.facing
  // tornado specials: spin on the spot
  if (f.state === 'special' && f.move?.spin && isActive(f) && Math.floor(f.t / 4) % 2) facing = -facing as 1 | -1
  const lying = (f.state === 'down' || f.state === 'dead') && !f.anim.down
  drawFrame(ctx, sheet(f.variant), p.name, sx, f.y - f.z + p.bob + (lying ? -4 : 0), facing, {
    flash: f.flash > 3,
    glaze: stone ? 0.55 : undefined,
    tilt: p.tilt,
  })
}
