import { audio } from './audio'
import { COMBO_WINDOW, INPUT_BUFFER, JUMP_SPEED } from './constants'
import { makeFighter, moveLength, setState, startMove, type Fighter } from './fighter'
import { HEROES, type HeroDef, type HeroId } from './heroes'
import type { Input } from './input'

export interface Player extends Fighter {
  hero: HeroDef
  specialCd: number
  /** frames left on a buffered attack press */
  buffered: number
  airAttackUsed: boolean
  score: number
  /** frames left coughing in vape smoke (walks slower) */
  slowT: number
  /** double-tap detection: last direction tapped and frames since */
  tapDir: number
  tapT: number
  /** jumps used since leaving the ground (double jump) */
  jumps: number
  /** this jump started from a run (flies further) */
  runJump?: boolean
  /** set for one frame when the double jump fires (the game puffs dust) */
  doubleJumped?: boolean
  /** frames left of LOLLI's sugar rush (moves faster) */
  boostT: number
  /** frames since last hurt (OMA HILDE heals when left alone) */
  calmT: number
}

/** two taps of the same direction within this many frames start a run */
const DOUBLE_TAP = 14

export function makePlayer(id: HeroId, x: number, y: number): Player {
  const hero = HEROES[id]
  return {
    ...makeFighter({ name: hero.name, variant: hero.sheet, anim: hero.anim, x, y, hp: hero.hp, isPlayer: true, facing: 1 }),
    hero,
    specialCd: 0,
    buffered: 0,
    airAttackUsed: false,
    score: 0,
    slowT: 0,
    boostT: 0,
    calmT: 0,
    tapDir: 0,
    tapT: 99,
    jumps: 0,
  }
}

/** Reads input and drives the hero's state machine (physics runs afterwards). */
export function updatePlayer(p: Player, input: Input) {
  const h = input.held
  if (p.specialCd > 0) p.specialCd--
  if (p.slowT > 0) p.slowT--
  if (p.boostT > 0) p.boostT--
  const slow = (p.slowT > 0 ? 0.55 : 1) * (p.boostT > 0 ? 1.35 : 1)
  if (p.comboTimer > 0) p.comboTimer--
  else p.comboStep = 0
  if (input.pressed.attack) p.buffered = INPUT_BUFFER
  else if (p.buffered > 0) p.buffered--

  const dirX = (h.right ? 1 : 0) - (h.left ? 1 : 0)
  const dirY = (h.down ? 1 : 0) - (h.up ? 1 : 0)

  // double-tap left or right to run; letting go of the direction stops it
  p.tapT++
  const tap = input.pressed.right ? 1 : input.pressed.left ? -1 : 0
  if (tap) {
    if (tap === p.tapDir && p.tapT < DOUBLE_TAP && (p.state === 'idle' || p.state === 'walk')) p.running = true
    p.tapDir = tap
    p.tapT = 0
  }
  if (p.running && (dirX !== p.facing || (p.state !== 'walk' && p.state !== 'idle'))) p.running = false

  switch (p.state) {
    case 'idle':
    case 'walk': {
      if (input.pressed.special && p.specialCd <= 0) {
        if (dirX) p.facing = dirX > 0 ? 1 : -1
        startMove(p, p.hero.special, 'special')
        p.specialCd = p.hero.specialCooldown
        audio.special()
        return
      }
      if (input.pressed.jump) {
        p.runJump = !!p.running
        p.running = false
        setState(p, 'jump')
        p.airAttackUsed = false
        p.jumps = 0
        return
      }
      if (p.buffered > 0 && p.running) {
        // running attack: a lunging move that knocks down
        p.buffered = 0
        p.running = false
        startMove(p, p.hero.dash)
        audio.swing()
        return
      }
      if (p.buffered > 0) {
        p.buffered = 0
        const step = p.comboTimer > 0 ? p.comboStep % p.hero.combo.length : 0
        const combo = p.hero.combo
        startMove(p, combo[step])
        p.comboStep = (step + 1) % combo.length
        p.comboTimer = 0
        audio.swing()
        return
      }
      if (dirX || dirY) {
        if (dirX) p.facing = dirX > 0 ? 1 : -1
        p.x += dirX * (p.running ? p.hero.runSpeed : p.hero.walkX) * slow
        p.vy = dirY * p.hero.walkY * slow
        if (p.state !== 'walk') setState(p, 'walk')
      } else if (p.state !== 'idle') setState(p, 'idle')
      break
    }
    case 'jump': {
      // 4 frames of crouch, then take off with the held direction
      if (p.t === 4 && p.z === 0) {
        p.vz = JUMP_SPEED
        p.z = 0.1
        // a running jump goes much further
        p.vx = dirX * (p.runJump ? 3.4 : 1.9)
        if (dirX) p.facing = dirX > 0 ? 1 : -1
      }
      if (p.z > 0) {
        p.vy = dirY * 0.4
        if (input.pressed.jump && p.hero.doubleJump && p.jumps === 0 && p.t > 8) {
          p.jumps = 1
          p.vz = JUMP_SPEED * 0.85
          if (dirX) {
            p.facing = dirX > 0 ? 1 : -1
            p.vx = dirX * 2.2
          }
          p.airAttackUsed = false
          p.move = null
          p.doubleJumped = true
        }
        if (p.buffered > 0 && !p.airAttackUsed) {
          p.buffered = 0
          p.airAttackUsed = true
          p.move = p.hero.air
          p.hitList.clear()
          p.connected = false
          audio.swing()
        }
      }
      break
    }
    case 'land':
      if (p.t > 6) setState(p, 'idle')
      break
    case 'attack': {
      const m = p.move!
      if (m.lunge && p.t >= m.active[0] && p.t <= m.active[1]) p.x += p.facing * m.lunge * (1 - (p.t - m.active[0]) / (m.active[1] - m.active[0] + 8))
      if (p.t >= moveLength(m)) {
        // the combo continues only if this hit connected
        p.comboTimer = p.connected ? COMBO_WINDOW : 0
        if (!p.connected) p.comboStep = 0
        setState(p, 'idle')
        p.move = null
      }
      break
    }
    case 'special': {
      const m = p.move!
      if (p.t >= m.active[0] && p.t <= m.active[1]) {
        p.x += p.facing * (m.lunge ?? 0) * (1 - (p.t - m.active[0]) / (m.active[1] - m.active[0] + 12))
        p.invuln = Math.max(p.invuln, 2)
      }
      if (p.t >= moveLength(m)) {
        setState(p, 'idle')
        p.move = null
      }
      break
    }
  }
  if (p.state === 'jump' && p.t > 6 && p.z === 0) {
    setState(p, 'land')
    p.move = null
  }
}
