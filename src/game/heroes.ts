import { SIZE } from './constants'
import { scaleReach, type AnimSet, type Move, type MoveFrame } from './fighter'
import type { SheetKey } from './sprites'

export type HeroId = 'jule' | 'kalle' | 'shovel' | 'queen' | 'lolli' | 'schwein' | 'kunst'

/**
 * Order on the fighter-select screen. A hero only shows up once its sprite atlas exists
 * (heroes appear as soon as their sheets are imported).
 * KALLE is kept in the code but off the list.
 */
export const HERO_ORDER: HeroId[] = ['jule', 'shovel', 'queen', 'lolli', 'schwein', 'kunst']

/**
 * Everything that makes a playable hero different. Frame names come from
 * the sprite atlas (tools/sprites.config.json). Where a sheet is still
 * missing, a hero borrows the closest existing frame; the comment says which.
 */
export interface HeroDef {
  id: HeroId
  name: string
  tagline: string
  color: string
  sheet: SheetKey
  hp: number
  walkX: number
  walkY: number
  anim: AnimSet
  combo: Move[]
  air: Move
  /** attack while running (double-tap a direction to run) */
  dash: Move
  runSpeed: number
  /** frames for the special to recharge on its own; every hit you land speeds it up */
  specialCooldown: number
  /** can jump again in mid-air */
  doubleJump?: boolean
  /** damage multiplier against dazed (dancing) enemies */
  dazeBonus?: number
  /** frames of speed boost after the special (LOLLI) */
  sugarRush?: number
  /** heals 1 HP every this many frames after 3 s without being hit */
  regen?: number
  /** one line on the select screen about what makes this hero different */
  trait: string
  special: Move
  specialName: string
  /** extra visual for the special */
  specialFx: 'ram' | 'shockwave' | 'music' | 'gust' | 'tornado' | 'gallery' | 'shuffle'
}

const f = (name: string, dur: number): MoveFrame => ({ name, dur })

/** animation frames every hero made with the standard A-D hero sheets has */
const STANDARD_ANIM: AnimSet = {
  idle: ['idle1', 'idle2', 'idle3', 'idle4'],
  idleRate: 12,
  walk: ['walk1', 'walk2', 'walk3', 'walk4'],
  jumpAir: 'jair',
  jumpCrouch: 'jcrouch',
  land: 'jland',
  hurt: 'hurt',
  fall: 'fall',
  down: 'ko',
  getup: 'getup',
  win: ['win1', 'win2'],
}

export const HEROES: Record<HeroId, HeroDef> = {
  jule: {
    id: 'jule',
    name: 'JULE',
    tagline: 'FAST TECHNO RAVER',
    color: '#c8ff3a',
    sheet: 'jule',
    hp: 100,
    walkX: 1.45,
    walkY: 0.85,
    anim: {
      idle: ['idle1', 'idle2', 'idle3', 'idle4'],
      idleRate: 10,
      walk: ['walk1', 'walk2', 'walk3', 'walk4'],
      jumpAir: 'jair',
      jumpCrouch: 'jcrouch',
      land: 'jland',
      hurt: 'hurt',
      fall: 'fall',
      down: 'ko',
      getup: 'getup',
      win: ['win1', 'win2'],
    },
    combo: [
      { id: 'jab', frames: [f('jab1', 4), f('jab2', 8)], active: [4, 7], reach: 34, damage: 6, knockback: 1, knockdown: false },
      { id: 'cross', frames: [f('cross1', 5), f('cross2', 9)], active: [5, 9], reach: 38, damage: 7, knockback: 1.3, knockdown: false },
      {
        id: 'highkick',
        frames: [f('kick1', 7), f('kick2', 10), f('kick3', 8), f('kick4', 6)],
        active: [7, 16],
        reach: 44,
        damage: 14,
        knockback: 3.4,
        knockdown: true,
        heavy: true,
      },
    ],
    air: { id: 'flykick', frames: [f('jkick', 999)], active: [0, 999], reach: 36, damage: 11, knockback: 2.6, knockdown: true },
    // gather, jump, slam both fists into the ground (shockwave drawn in code), recover
    special: {
      id: 'bassdrop',
      frames: [f('sp1', 14), f('sp2', 10), f('sp3', 16), f('sp4', 10)],
      active: [24, 29],
      reach: 78,
      damage: 16,
      knockback: 4,
      knockdown: true,
      heavy: true,
      multi: true,
      radial: true,
    },
    specialName: 'BASS DROP',
    specialFx: 'shockwave',
    dash: { id: 'dashkick', frames: [f('kick1', 4), f('kick2', 16)], active: [4, 16], reach: 40, damage: 10, knockback: 3, knockdown: true, lunge: 3.2 },
    runSpeed: 2.9,
    specialCooldown: 300,
    doubleJump: true,
    trait: 'FAST - DOUBLE JUMP',
  },
  kalle: {
    id: 'kalle',
    name: 'KALLE',
    tagline: 'KREUZBERG PUNK',
    color: '#7dff5a',
    sheet: 'kalle',
    hp: 130,
    walkX: 1.15,
    walkY: 0.7,
    // no walk-cycle sheet (A) yet: idle frames + a step bob
    anim: {
      idle: ['idle1', 'idle2'],
      idleRate: 24,
      walk: null,
      jumpAir: 'jair',
      jumpCrouch: 'jcrouch',
      land: 'jland',
      hurt: 'hurt',
      fall: 'fall',
      down: 'ko',
      getup: 'getup',
      win: ['win1', 'win2'],
    },
    combo: [
      { id: 'hook', frames: [f('hook1', 6), f('hook2', 10)], active: [6, 10], reach: 36, damage: 8, knockback: 1.4, knockdown: false },
      { id: 'upper', frames: [f('upper1', 6), f('upper2', 12)], active: [6, 11], reach: 28, damage: 10, knockback: 1.6, knockdown: false },
      {
        id: 'hammer',
        frames: [f('hammer1', 12), f('hammer2', 8), f('hammer3', 8), f('hammer4', 6)],
        active: [12, 18],
        reach: 34,
        damage: 17,
        knockback: 3.2,
        knockdown: true,
        heavy: true,
      },
    ],
    air: { id: 'knee', frames: [f('jknee', 999)], active: [0, 999], reach: 26, damage: 12, knockback: 2.4, knockdown: true },
    special: {
      id: 'ram',
      frames: [f('sp1', 12), f('sp2', 8), f('sp3', 22), f('sp4', 10)],
      active: [12, 42],
      reach: 30,
      damage: 18,
      knockback: 4,
      knockdown: true,
      heavy: true,
      multi: true,
      lunge: 4.2,
    },
    specialName: 'MOHAWK RAM',
    specialFx: 'ram',
    dash: { id: 'dashupper', frames: [f('upper1', 4), f('upper2', 16)], active: [4, 14], reach: 32, damage: 12, knockback: 3, knockdown: true, lunge: 2.6 },
    runSpeed: 2.4,
    specialCooldown: 360,
    trait: 'HEAVY HITTER',
  },
  shovel: {
    id: 'shovel',
    name: 'SHOVELIST',
    tagline: 'PSYCHEDELIC HIPPIE',
    color: '#c46bff',
    sheet: 'shovel',
    hp: 110,
    walkX: 1.3,
    walkY: 0.8,
    anim: {
      idle: ['idle1', 'idle2', 'idle3', 'idle4'],
      idleRate: 12,
      walk: ['walk1', 'walk2', 'walk3', 'walk4'],
      jumpAir: 'jair',
      jumpCrouch: 'jcrouch',
      land: 'jland',
      hurt: 'hurt',
      fall: 'fall',
      down: 'ko',
      getup: 'getup',
      win: ['win1', 'win2'],
    },
    // a 4-hit combo: punch, knee, kick, then the golden shovel on its chain
    combo: [
      { id: 'punch', frames: [f('b1', 4), f('b2', 9)], active: [4, 8], reach: 34, damage: 7, knockback: 1.1, knockdown: false },
      { id: 'knee', frames: [f('b1', 3), f('b3', 10)], active: [4, 9], reach: 26, damage: 7, knockback: 1.2, knockdown: false },
      { id: 'kick', frames: [f('b3', 4), f('b4', 11)], active: [4, 10], reach: 44, damage: 9, knockback: 1.8, knockdown: false },
      {
        id: 'shovelswing',
        frames: [f('b5', 10), f('b6', 8), f('b7', 8), f('b8', 6)],
        active: [10, 20],
        reach: 48,
        damage: 15,
        knockback: 3.4,
        knockdown: true,
        heavy: true,
      },
    ],
    air: { id: 'flykick', frames: [f('jkick', 999)], active: [0, 999], reach: 34, damage: 11, knockback: 2.4, knockdown: true },
    // swings the golden shovel up: music and psychedelic light burst out, and everyone
    // around starts dancing, dazed, for two seconds
    special: {
      id: 'shovelrave',
      frames: [f('sp1', 12), f('sp2', 10), f('sp3', 26), f('sp4', 10)],
      active: [22, 27],
      reach: 110,
      depth: 34,
      damage: 10,
      knockback: 0.6,
      knockdown: false,
      multi: true,
      radial: true,
      stun: 120,
    },
    specialName: 'PSYCHEDELIC RAVE',
    specialFx: 'music',
    dash: { id: 'dashkick', frames: [f('b3', 4), f('b4', 16)], active: [4, 15], reach: 44, damage: 10, knockback: 3, knockdown: true, lunge: 2.7 },
    runSpeed: 2.6,
    specialCooldown: 420,
    dazeBonus: 1.6,
    trait: 'GROOVE BONUS',
  },
  // Her enemy sheets have idle, walk, attack and damage frames; until her hero sheets
  // (design, C, D) exist she borrows attack frames for the jump and victory.
  queen: {
    id: 'queen',
    name: 'RAVE QUEEN',
    tagline: 'GOTH WITH A FAN',
    color: '#e6e6ff',
    sheet: 'queen',
    hp: 95,
    walkX: 1.25,
    walkY: 0.8,
    anim: {
      idle: ['idle1', 'idle2', 'idle3', 'idle4'],
      idleRate: 12,
      walk: ['walk1', 'walk2', 'walk3', 'walk4'],
      jumpAir: 'atk3',
      jumpCrouch: 'getup',
      land: 'getup',
      hurt: 'hurt',
      fall: 'fall',
      down: 'ko',
      getup: 'getup',
      win: ['atk4', 'idle1'],
    },
    combo: [
      { id: 'fanjab', frames: [f('atk1', 5), f('atk2', 9)], active: [5, 9], reach: 46, damage: 6, knockback: 1.2, knockdown: false },
      { id: 'fanflick', frames: [f('atk3', 4), f('atk2', 9)], active: [4, 8], reach: 50, damage: 7, knockback: 1.5, knockdown: false },
      { id: 'fanslam', frames: [f('atk1', 10), f('atk2', 14), f('atk4', 6)], active: [10, 18], reach: 56, damage: 12, knockback: 4.2, knockdown: true, heavy: true },
    ],
    air: { id: 'airfan', frames: [f('atk2', 999)], active: [0, 999], reach: 44, damage: 9, knockback: 2.4, knockdown: true },
    dash: { id: 'dashfan', frames: [f('atk1', 4), f('atk2', 14)], active: [4, 14], reach: 50, damage: 9, knockback: 3, knockdown: true, lunge: 2.8 },
    // a hurricane from the fan: everything in front of her, far and wide, is blown away
    special: {
      id: 'fanhurricane',
      frames: [f('atk1', 16), f('atk2', 24), f('atk4', 8)],
      active: [16, 36],
      reach: 130,
      depth: 26,
      damage: 12,
      knockback: 5,
      knockdown: true,
      heavy: true,
      multi: true,
    },
    specialName: 'FAN HURRICANE',
    specialFx: 'gust',
    runSpeed: 2.5,
    specialCooldown: 360,
    trait: 'LONGEST REACH',
  },
  lolli: {
    id: 'lolli',
    name: 'LOLLI',
    tagline: 'BRAIDED RAVE ATHLETE',
    color: '#ff4fa3',
    sheet: 'lolli',
    hp: 100,
    walkX: 1.4,
    walkY: 0.85,
    anim: STANDARD_ANIM,
    combo: [
      { id: 'jab', frames: [f('c1a', 4), f('c1b', 8)], active: [4, 7], reach: 34, damage: 6, knockback: 1, knockdown: false },
      { id: 'frontkick', frames: [f('c2a', 5), f('c2b', 10)], active: [5, 10], reach: 48, damage: 8, knockback: 1.6, knockdown: false },
      { id: 'spinkick', frames: [f('f1', 7), f('f2', 9), f('f3', 8), f('f4', 6)], active: [7, 16], reach: 46, damage: 14, knockback: 3.4, knockdown: true, heavy: true },
    ],
    air: { id: 'flyknee', frames: [f('jkick', 999)], active: [0, 999], reach: 30, damage: 11, knockback: 2.4, knockdown: true },
    dash: { id: 'dashkick', frames: [f('c2a', 4), f('c2b', 14)], active: [4, 14], reach: 48, damage: 10, knockback: 3, knockdown: true, lunge: 3 },
    // throws her fist up, drops low and spins like a helicopter: the braids hit everyone
    // around three times; then a sugar rush
    special: {
      id: 'braidtornado',
      frames: [f('sp1', 10), f('sp2', 8), f('sp3', 30), f('sp4', 10)],
      active: [18, 48],
      reach: 52,
      depth: 24,
      damage: 5,
      knockback: 1.2,
      knockdown: false,
      multi: true,
      radial: true,
      rehit: 10,
      spin: true,
    },
    specialName: 'BRAID TORNADO',
    specialFx: 'tornado',
    runSpeed: 2.9,
    specialCooldown: 330,
    sugarRush: 240,
    trait: 'FAST KICKS - SUGAR RUSH',
  },
  // half man, half wild boar, dressed like any Neukölln hipster
  schwein: {
    id: 'schwein',
    name: 'BAD SCHWEIN',
    tagline: 'WILD BOAR HIPSTER',
    color: '#c98a5a',
    sheet: 'schwein',
    hp: 125,
    walkX: 1.15,
    walkY: 0.7,
    anim: STANDARD_ANIM,
    combo: [
      { id: 'slap', frames: [f('c1a', 5), f('c1b', 9)], active: [5, 9], reach: 36, damage: 8, knockback: 1.3, knockdown: false },
      { id: 'snoutbutt', frames: [f('c2a', 6), f('c2b', 11)], active: [6, 11], reach: 38, damage: 10, knockback: 1.8, knockdown: false },
      { id: 'tuskcharge', frames: [f('f1', 10), f('f2', 8), f('f3', 9), f('f4', 8)], active: [10, 18], reach: 44, damage: 16, knockback: 4, knockdown: true, heavy: true, lunge: 2 },
    ],
    air: { id: 'bellyflop', frames: [f('jkick', 999)], active: [0, 999], reach: 34, damage: 12, knockback: 2.4, knockdown: true },
    dash: { id: 'dashcharge', frames: [f('f1', 4), f('f2', 14)], active: [4, 14], reach: 42, damage: 12, knockback: 3.2, knockdown: true, lunge: 3 },
    // the shoulders go up above his head and he shuffles left and right: every hit makes the
    // people around him dance along, helplessly, for a few seconds
    special: {
      id: 'schweineshuffle',
      frames: [f('sp2', 10), f('sp1', 6), f('sp3', 6), f('sp1', 6), f('sp3', 6), f('sp1', 6), f('sp3', 6), f('sp4', 10)],
      active: [10, 46],
      reach: 72,
      depth: 30,
      damage: 5,
      knockback: 0,
      knockdown: false,
      multi: true,
      radial: true,
      rehit: 12,
      stun: 150,
    },
    specialName: 'SCHWEINE SHUFFLE',
    specialFx: 'shuffle',
    runSpeed: 2.4,
    specialCooldown: 400,
    trait: 'MAKES ENEMIES DANCE',
  },
  kunst: {
    id: 'kunst',
    name: 'YO HIGHNESS',
    tagline: 'QUEER PERFORMANCE ARTIST',
    color: '#f2c14e',
    sheet: 'kunst',
    hp: 105,
    walkX: 1.15,
    walkY: 0.75,
    anim: STANDARD_ANIM,
    combo: [
      { id: 'framepoke', frames: [f('c1a', 6), f('c1b', 9)], active: [6, 9], reach: 44, damage: 7, knockback: 1.2, knockdown: false },
      { id: 'frameswing', frames: [f('c2a', 6), f('c2b', 11)], active: [6, 11], reach: 50, damage: 9, knockback: 1.8, knockdown: false },
      // brings the empty gold frame down over the enemy's head
      { id: 'frameslam', frames: [f('f1', 6), f('f2', 10), f('f3', 10), f('f4', 8)], active: [16, 24], reach: 46, damage: 15, knockback: 3.4, knockdown: true, heavy: true },
    ],
    air: { id: 'framedrop', frames: [f('jkick', 999)], active: [0, 999], reach: 34, damage: 10, knockback: 2.4, knockdown: true },
    dash: { id: 'dashframe', frames: [f('c2a', 4), f('c2b', 14)], active: [4, 14], reach: 50, damage: 10, knockback: 3, knockdown: true, lunge: 2.6 },
    // a spotlight, a pose: everyone around becomes a silver statue with a price tag
    special: {
      id: 'artinstallation',
      frames: [f('sp1', 12), f('sp3', 10), f('sp2', 40), f('sp4', 10)],
      active: [22, 27],
      reach: 150,
      depth: 60,
      damage: 6,
      knockback: 0,
      knockdown: false,
      multi: true,
      radial: true,
      stun: 200,
      statue: true,
    },
    specialName: 'ART INSTALLATION',
    specialFx: 'gallery',
    runSpeed: 2.5,
    specialCooldown: 420,
    trait: 'TURNS ENEMIES TO STATUES',
  },
}

for (const h of Object.values(HEROES)) scaleReach([...h.combo, h.air, h.dash, h.special], SIZE)
