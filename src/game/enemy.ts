import { GROUND_BOT, GROUND_TOP } from './constants'
import { makeFighter, moveLength, setState, startMove, type AnimSet, type Fighter, type Move, type MoveFrame } from './fighter'
import type { SheetKey } from './sprites'

const f = (name: string, dur: number): MoveFrame => ({ name, dur })

/** Frames shared by every enemy drawn from the standard A + B sheets. */
const RAVER_ANIM: AnimSet = {
  idle: ['idle1', 'idle2', 'idle3', 'idle4'],
  idleRate: 12,
  walk: ['walk1', 'walk2', 'walk3', 'walk4'],
  jumpAir: 'fall',
  jumpCrouch: 'getup',
  hurt: 'hurt',
  fall: 'fall',
  down: 'ko',
  getup: 'getup',
}

/** The boss: arms crossed, clicking his counter. */
const BOSS_ANIM: AnimSet = {
  ...RAVER_ANIM,
  idleRate: 16,
}

/** Enemy attack: slower wind-up than the heroes' = a readable telegraph. */
function raverAttack(id: string, windup: number, reach: number, damage: number, extra: Partial<Move> = {}): Move {
  return {
    id,
    frames: [f('atk1', windup), f('atk2', 10), f('atk3', 7), f('atk4', 7)],
    active: [windup, windup + 5],
    reach,
    damage,
    knockback: 1.6,
    knockdown: false,
    ...extra,
  }
}

export interface EnemyType {
  name: string
  sheet: SheetKey
  anim: AnimSet
  hp: number
  speed: number
  power: number
  moves: Move[]
  score: number
}

export const ENEMY_TYPES = {
  monk: {
    name: 'TECHNO MONK',
    sheet: 'monk',
    anim: RAVER_ANIM,
    hp: 40,
    speed: 0.95,
    power: 1,
    moves: [raverAttack('chop', 14, 34, 7)],
    score: 100,
  },
  harness: {
    name: 'HARNESS BOY',
    sheet: 'harness',
    anim: RAVER_ANIM,
    hp: 70,
    speed: 0.75,
    power: 1,
    moves: [raverAttack('haymaker', 22, 38, 12, { knockdown: true, knockback: 2.8, heavy: true })],
    score: 180,
  },
  queen: {
    name: 'RAVE QUEEN',
    sheet: 'queen',
    anim: RAVER_ANIM,
    hp: 38,
    speed: 1.1,
    power: 1,
    moves: [raverAttack('fanslap', 15, 52, 7)],
    score: 140,
  },
  mullet: {
    name: 'MULLET',
    sheet: 'mullet',
    anim: RAVER_ANIM,
    hp: 36,
    speed: 1.0,
    power: 1,
    // holds the camera out and fires the flash: long reach, little damage
    moves: [raverAttack('flash', 18, 46, 6, { fx: 'flash', knockback: 1 })],
    score: 130,
  },
  punkgirl: {
    name: 'PUNK GIRL',
    sheet: 'punkgirl',
    anim: RAVER_ANIM,
    hp: 34,
    speed: 1.25,
    power: 1,
    // fast high kick with the boot
    moves: [raverAttack('kick', 11, 40, 8, { knockback: 2 })],
    score: 150,
  },
  tourist: {
    name: 'SELFIE TOURIST',
    sheet: 'tourist',
    anim: RAVER_ANIM,
    hp: 46,
    speed: 0.7,
    power: 1,
    // pokes with the extended selfie stick: the longest reach of all
    moves: [raverAttack('poke', 16, 58, 6, { knockback: 1.4 })],
    score: 120,
  },
  bouncer: {
    name: 'DER TUERSTEHER',
    sheet: 'bouncer',
    anim: BOSS_ANIM,
    hp: 280,
    speed: 0.7,
    power: 1,
    moves: [
      // two-handed shove that sends you flying
      raverAttack('shove', 16, 44, 12, { knockdown: true, knockback: 4, heavy: true }),
      // grabs you by the collar and throws you over his shoulder (negative push = behind him)
      {
        id: 'throw',
        frames: [f('grab1', 16), f('grab2', 8), f('grab3', 10), f('grab4', 14)],
        active: [16, 22],
        reach: 34,
        damage: 15,
        knockback: -3.6,
        knockdown: true,
        heavy: true,
      },
      // "NOT TODAY": points, shakes his head, stomps: a shockwave around him
      {
        id: 'e_stomp',
        frames: [f('nt1', 22), f('nt2', 16), f('nt3', 14), f('nt4', 18)],
        active: [52, 57],
        reach: 64,
        damage: 10,
        knockback: 3,
        knockdown: true,
        heavy: true,
        radial: true,
        fx: 'stomp',
      },
    ],
    score: 2000,
  },
} satisfies Record<string, EnemyType>

export type EnemyKind = keyof typeof ENEMY_TYPES

export interface Enemy extends Fighter {
  kind: EnemyKind
  isBoss: boolean
  /** depth to walk down to when stepping out of the queue */
  enterTo: number
  /** which side of the player this attacker should stand on (set by the game) */
  slot: -1 | 0 | 1
}

export function makeEnemy(kind: EnemyKind, x: number, y: number, fromQueue: boolean): Enemy {
  const t = ENEMY_TYPES[kind]
  const e = makeFighter({
    name: t.name,
    variant: t.sheet,
    anim: t.anim,
    x,
    y,
    hp: t.hp,
    speed: t.speed * (0.9 + Math.random() * 0.2),
    power: t.power,
    moves: t.moves,
    cooldown: 40 + Math.random() * 60,
  }) as Enemy
  e.kind = kind
  e.isBoss = kind === 'bouncer'
  e.slot = 0
  e.enterTo = GROUND_TOP + 4 + Math.random() * 14
  if (fromQueue) setState(e, 'enter')
  return e
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** One frame of enemy brain. `target` is the player. */
export function updateEnemy(e: Enemy, target: Fighter) {
  if (e.cooldown > 0) e.cooldown--
  switch (e.state) {
    case 'enter':
      // stepping out of the queue, through a gap in the barriers
      e.vy = 0.7
      if (e.y >= e.enterTo) setState(e, 'idle')
      return
    case 'attack': {
      const m = e.move!
      if (m.lunge && e.t >= m.active[0] && e.t <= m.active[1]) e.x += e.facing * m.lunge
      if (e.t >= moveLength(m)) {
        setState(e, 'idle')
        e.move = null
      }
      return
    }
    case 'idle':
    case 'walk':
      break
    default:
      return
  }

  const targetDown = target.state === 'down' || target.state === 'dead' || target.state === 'fall'
  const side = e.x < target.x ? -1 : 1
  if (--e.thinkT <= 0) {
    e.thinkT = rand(20, 45)
    if (e.attacker && !targetDown) {
      e.goalX = target.x + (e.slot || side) * rand(22, 28)
      e.goalY = target.y + rand(-2, 2)
    } else {
      // wait around at a distance, drifting in depth
      e.goalX = target.x + side * rand(60, 95)
      e.goalY = rand(GROUND_TOP + 2, GROUND_BOT - 2)
    }
  }
  const dx = e.goalX - e.x
  const dy = e.goalY - e.y
  // jog in quickly from far away, then slow down to circle the player
  const sp = e.speed * (Math.abs(dx) > 90 ? 1.8 : 1)
  let moving = false
  if (Math.abs(dx) > 2) {
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), sp)
    moving = true
  }
  if (Math.abs(dy) > 1.5) {
    e.vy = Math.sign(dy) * Math.min(Math.abs(dy), sp * 0.6)
    moving = true
  }
  e.facing = side === -1 ? 1 : -1
  if (moving && e.state !== 'walk') setState(e, 'walk')
  if (!moving && e.state !== 'idle') setState(e, 'idle')

  // attack when lined up
  const distX = Math.abs(target.x - e.x)
  const distY = Math.abs(target.y - e.y)
  if (!e.attacker || targetDown || e.cooldown > 0 || distY > (e.isBoss ? 10 : 5)) return
  // the boss's stomp works from further away: he uses it when you keep your distance
  const stomp = e.moves.find((m) => m.id === 'e_stomp')
  if (stomp && distX > 40 && distX < 70 && Math.random() < 0.03) {
    startMove(e, stomp)
    e.cooldown = rand(100, 150)
    return
  }
  if (distX < 38) {
    const close = e.moves.filter((m) => m.id !== 'e_stomp')
    startMove(e, close[Math.floor(Math.random() * close.length)])
    e.cooldown = e.isBoss ? rand(40, 80) : rand(60, 120)
  }
}
