import type { AnimSet, Move, MoveFrame } from './fighter'
import type { SheetKey } from './sprites'

export type HeroId = 'jule' | 'kalle' | 'shovel'

/** order on the fighter-select screen */
// KALLE is kept in the code but off the select screen until his replacement exists
export const HERO_ORDER: HeroId[] = ['jule', 'shovel']

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
  /** one line on the select screen about what makes this hero different */
  trait: string
  special: Move
  specialName: string
  /** extra visual for the special */
  specialFx: 'ram' | 'shockwave' | 'music'
}

const f = (name: string, dur: number): MoveFrame => ({ name, dur })

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
}
