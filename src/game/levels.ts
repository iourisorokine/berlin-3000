import ubahn from '../assets/bg/ubahn/ubahn.json'
import level1 from '../assets/bg/level.json'
import { VIEW_W } from './constants'
import type { PickupKind } from './effects'
import type { EnemyKind } from './enemy'
import type { BreakableKind } from './props'
import prenzl from '../assets/bg/prenzl/prenzl.json'
import { PrenzlStage } from './prenzl'
import { BerghainStage, OPEN, type Stage } from './stage'
import { UbahnStage } from './ubahn'

/** Where enemies come from: screen edges, out of the queue, the club door, a train door. */
export type SpawnFrom = 'left' | 'right' | 'queue' | 'door' | 'train'

export interface Spawn {
  kind: EnemyKind
  from: SpawnFrom
  delay: number
}

/**
 * A fight that stops the camera. Who comes, how many and from where is rolled each time,
 * so no two runs play the same.
 */
export interface WaveDef {
  /** camera x where the wave starts; the camera stays there until it is cleared */
  cam: number
  /** random shift of `cam`, in art px either way */
  jitter?: number
  /** how many enemies: a random number in this range */
  count: [number, number]
  /** drawn at random; a kind listed twice comes twice as often */
  pool: EnemyKind[]
  /** where they may come from, drawn at random for each enemy */
  from: SpawnFrom[]
  /** always part of the wave (the boss), before the random ones */
  fixed?: Spawn[]
  /** the U-Bahn stops at a station for this wave: doors open, enemies board */
  station?: boolean
  /** only happens with this probability (surprise fights) */
  chance?: number
}

export interface LevelDef {
  id: 'berghain' | 'ubahn' | 'prenzl'
  name: string
  /** day and time, shown on the level card */
  when: string
  makeStage: () => Stage
  waves: WaveDef[]
  props: [BreakableKind, number, number][]
  /** what knocked-out enemies may drop */
  loot: PickupKind[]
  win: [string, string]
  lose: [string, string]
  music: 'club' | 'train' | 'street'
  /** the fight inside the side room (the cafe), and the furniture there: [kind, screen x, feet y] */
  sideWave?: WaveDef
  sideProps?: [BreakableKind, number, number][]
  /** chance that a knocked-out enemy drops something */
  dropChance: number
  /** people standing in the way who never fight: hitting them costs points */
  bystanders?: { sheet: string; looks: string[]; count: number }
}

const L1 = level1.levelLen
const L2 = ubahn.levelLen
const [D1, D2] = ubahn.doors

export const LEVELS: LevelDef[] = [
  {
    id: 'berghain',
    name: 'QUEUE TO BERGHAIN',
    when: 'SATURDAY 23:00',
    makeStage: () => new BerghainStage(),
    music: 'club',
    win: ['KOMM REIN,', 'VIEL SPASS!'],
    lose: ['HEUTE', 'LEIDER NICHT.'],
    loot: ['doner', 'currywurst', 'pretzel', 'cash', 'phone'],
    dropChance: 0.3,
    props: [
      ['cone', 200, 186],
      ['bin', 300, 168],
      ['bin', 250 + OPEN, 172],
      ['boxes', 560 + OPEN, 192],
      ['crate', 980 + OPEN, 166],
      ['bin', 1180 + OPEN, 198],
      ['cone', 1420 + OPEN, 176],
      ['boxes', 1640 + OPEN, 200],
      ['bin', 1990 + OPEN, 168],
    ],
    waves: [
      { cam: 0, count: [2, 3], pool: ['monk', 'monk', 'tourist', 'mullet'], from: ['right', 'right', 'left'] },
      { cam: OPEN, jitter: 30, count: [3, 4], pool: ['queen', 'monk', 'tourist', 'punkgirl'], from: ['right', 'left'] },
      { cam: 160 + OPEN, count: [1, 2], pool: ['punkgirl', 'monk'], from: ['left', 'right'], chance: 0.35 },
      { cam: 380 + OPEN, jitter: 40, count: [3, 4], pool: ['punkgirl', 'mullet', 'monk', 'queen'], from: ['queue', 'queue', 'right', 'left'] },
      { cam: 840 + OPEN, jitter: 40, count: [4, 5], pool: ['harness', 'tourist', 'queen', 'punkgirl', 'mullet'], from: ['queue', 'queue', 'right', 'left'] },
      { cam: 1080 + OPEN, count: [2, 3], pool: ['harness', 'mullet', 'tourist'], from: ['queue', 'right'], chance: 0.35 },
      {
        cam: 1300 + OPEN,
        jitter: 30,
        count: [5, 6],
        pool: ['queen', 'harness', 'mullet', 'punkgirl', 'monk', 'tourist'],
        from: ['queue', 'queue', 'right', 'left'],
      },
      {
        cam: L1 - VIEW_W,
        count: [2, 3],
        pool: ['punkgirl', 'mullet', 'monk', 'queen'],
        from: ['right', 'left'],
        fixed: [{ kind: 'bouncer', from: 'door', delay: 30 }],
      },
    ],
  },
  {
    id: 'ubahn',
    name: 'LETZTE BAHN',
    when: 'SUNDAY 04:00',
    makeStage: () => new UbahnStage(),
    music: 'train',
    win: ['ZURÜCKBLEIBEN,', 'BITTE!'],
    lose: ['60 EURO,', 'BITTE.'],
    // more food on the night train: it is a long way home
    loot: ['falafel', 'falafel', 'gummies', 'gummies', 'keys', 'wallet', 'ticket'],
    dropChance: 0.45,
    bystanders: { sheet: 'extras_ubahn', looks: ['6', '7'], count: 3 },
    props: [
      ['papers', 150, 196],
      ['bag', 420, 176],
      ['suitcase', 700, 200],
      ['speaker', 980, 180],
      ['bag', 1230, 202],
      ['suitcase', 1480, 178],
      ['papers', 1750, 196],
    ],
    waves: [
      { cam: 0, count: [2, 3], pool: ['drunk', 'monk', 'punkgirl', 'drunk'], from: ['right', 'right', 'left'] },
      // first station: the ticket inspectors get on
      { cam: D1 - VIEW_W / 2, station: true, count: [3, 4], pool: ['inspector', 'inspector', 'mullet', 'tourist', 'drunk', 'busker'], from: ['train', 'train', 'left', 'right'] },
      { cam: 700, jitter: 40, count: [3, 4], pool: ['couch', 'monk', 'punkgirl', 'drunk', 'harness', 'busker'], from: ['right', 'left'] },
      { cam: 960, count: [1, 2], pool: ['drunk', 'busker'], from: ['right'], chance: 0.4 },
      // the last station: a full ticket check, then the hero gets off
      {
        cam: Math.min(D2 - VIEW_W / 2, L2 - VIEW_W),
        station: true,
        count: [4, 5],
        pool: ['couch', 'busker', 'drunk', 'harness', 'punkgirl', 'mullet'],
        from: ['train', 'left', 'right'],
        fixed: [
          { kind: 'inspector', from: 'train', delay: 0 },
          { kind: 'inspector', from: 'train', delay: 40 },
        ],
      },
    ],
  },
]

const L3 = prenzl.levelLen
const CAFE = prenzl.cafeDoor

LEVELS.push({
  id: 'prenzl',
  name: 'LATTE ART ATTACK',
  when: 'SUNDAY 11:00',
  makeStage: () => new PrenzlStage(),
  music: 'street',
  win: ['MIETE', 'GEDECKELT!'],
  lose: ['LEIDER SCHON', 'VERMIETET.'],
  loot: ['franzbroetchen', 'avotoast', 'carrotcake', 'oatmilk', 'mug', 'sourdough'],
  dropChance: 0.35,
  bystanders: { sheet: 'extras_prenzl', looks: ['1', '2', '4', '5', '6', '7'], count: 4 },
  props: [
    ['veg', 200, 186],
    ['bin', 470, 170],
    ['plant', 760, 198],
    ['veg', 1010, 176],
    ['bin', 1350, 196],
    ['plant', 1690, 174],
    ['cone', 2150, 190],
    ['bin', 2420, 176],
  ],
  // for now the street is fought by level 1's crowd: the Prenzlauer Berg enemies come later
  waves: [
    { cam: 0, count: [2, 3], pool: ['mullet', 'tourist', 'monk'], from: ['right', 'right', 'left'] },
    { cam: 420, jitter: 40, count: [3, 4], pool: ['mullet', 'tourist', 'queen', 'punkgirl'], from: ['right', 'left'] },
    { cam: 820, count: [1, 2], pool: ['tourist', 'mullet'], from: ['left', 'right'], chance: 0.4 },
    { cam: 1100, jitter: 40, count: [3, 5], pool: ['harness', 'mullet', 'queen', 'monk', 'tourist'], from: ['right', 'left'] },
    { cam: 1980, jitter: 30, count: [4, 5], pool: ['harness', 'queen', 'punkgirl', 'mullet', 'tourist', 'monk'], from: ['right', 'left'] },
    { cam: L3 - VIEW_W, count: [4, 6], pool: ['harness', 'harness', 'queen', 'mullet', 'punkgirl', 'monk'], from: ['right', 'left'] },
  ],
  // the cafe: optional, guests storm in through the door and from the kitchen; the furniture hides the treats
  sideWave: { cam: CAFE, count: [3, 4], pool: ['mullet', 'tourist', 'queen', 'monk'], from: ['door', 'door', 'right'] },
  sideProps: [
    ['chair', 90, 178],
    ['table', 150, 196],
    ['plant', 236, 172],
    ['chair', 300, 200],
    ['table', 340, 182],
  ],
})

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** The waves of one run: optional fights rolled in or out, start positions shifted. */
export function rollWaves(defs: WaveDef[]): WaveDef[] {
  const out = defs.filter((w) => w.chance === undefined || Math.random() < w.chance).map((w) => ({ ...w, cam: Math.round(w.cam + (w.jitter ? rand(-w.jitter, w.jitter) : 0)) }))
  // keep them in order and never closer than half a screen
  for (let i = 1; i < out.length; i++) out[i].cam = Math.max(out[i].cam, out[i - 1].cam + (out[i].fixed || out[i].station ? 1 : VIEW_W / 2))
  return out
}

/** Who comes in this wave, from where and when. */
export function rollSpawns(w: WaveDef): Spawn[] {
  const spawns: Spawn[] = [...(w.fixed ?? [])]
  let t = spawns.length ? 120 + rand(0, 80) : rand(10, 40)
  const n = Math.round(rand(w.count[0], w.count[1]))
  let last: EnemyKind | null = null
  for (let i = 0; i < n; i++) {
    let kind = pick(w.pool)
    if (kind === last) kind = pick(w.pool) // fewer identical twins in a row
    last = kind
    spawns.push({ kind, from: pick(w.from), delay: Math.round(t) })
    // ticket inspectors usually work in pairs
    if (kind === 'inspector' && i < n - 1 && Math.random() < 0.6) {
      spawns.push({ kind, from: spawns[spawns.length - 1].from, delay: Math.round(t + 30) })
      i++
    }
    t += rand(50, 150)
  }
  return spawns
}

/** Progress: how many levels are open. For now every level is open; beating a level opens the next. */
const UNLOCK_ALL = true
const KEY = 'berlin3000.unlocked'

export function unlockedCount(): number {
  if (UNLOCK_ALL) return LEVELS.length
  try {
    return Math.max(1, Math.min(LEVELS.length, Number(localStorage.getItem(KEY)) || 1))
  } catch {
    return 1
  }
}

export function unlockNext(levelIdx: number) {
  try {
    const n = Math.max(Number(localStorage.getItem(KEY)) || 1, levelIdx + 2)
    localStorage.setItem(KEY, String(Math.min(LEVELS.length, n)))
  } catch {
    // storage blocked: progress just isn't kept
  }
}
