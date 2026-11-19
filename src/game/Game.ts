import { audio } from './audio'
import {
  BARRIER_Y,
  DROP_CHANCE,
  GROUND_BOT,
  GROUND_TOP,
  HITSTOP,
  HITSTOP_HEAVY,
  LEVEL_LEN,
  MAX_ATTACKERS,
  VIEW_H,
  VIEW_W,
} from './constants'
import { drawStars, Effects, type PickupKind } from './effects'
import { ENEMY_TYPES, makeEnemy, updateEnemy, type Enemy, type EnemyKind } from './enemy'
import { canBeHit, drawFighter, inReach, isActive, physics, setState, takeHit, type Fighter, type Move } from './fighter'
import { drawText } from './font'
import { dim, drawBanner, drawCombo, drawGo, drawHud } from './hud'
import { Input } from './input'
import { FixedLoop } from './loop'
import { HERO_ORDER, HEROES, type HeroId } from './heroes'
import { makePlayer, updatePlayer, type Player } from './player'
import { drawBreakable, gone, LOOT, makeBreakables, standing, updateBreakable, type Breakable } from './props'
import { drawFrame, drawPortrait, hasSheet, loadSprites, sheet } from './sprites'

/** what a pickup does: heal (hp), refill the special, or score points */
const PICKUPS: Record<PickupKind, { label: string; hp?: number; special?: boolean; score?: number }> = {
  doner: { label: 'DONER', hp: 35 },
  currywurst: { label: 'CURRYWURST', hp: 25 },
  pretzel: { label: 'BREZEL', hp: 15 },
  mate: { label: 'MATE: SPECIAL READY', special: true },
  cash: { label: '500', score: 500 },
  phone: { label: '300', score: 300 },
  wristband: { label: 'VIP STAMP 1000', score: 1000 },
  glowstick: { label: '200', score: 200 },
}
const ENEMY_LOOT: PickupKind[] = ['doner', 'currywurst', 'pretzel', 'cash', 'phone']
import { DOOR_X, OPEN, QUEUE_GAPS, Stage } from './stage'

export type Scene = 'loading' | 'title' | 'select' | 'play' | 'paused' | 'gameover' | 'win'

interface Spawn {
  kind: EnemyKind
  from: 'left' | 'right' | 'queue' | 'door'
  /** for 'queue': x of the barrier gap */
  gap?: number
  delay: number
}

interface Wave {
  /** camera x where the wave starts; the camera stays there until it is cleared */
  cam: number
  spawns: Spawn[]
}

const WAVES: Wave[] = [
  {
    cam: 0,
    spawns: [
      { kind: 'monk', from: 'right', delay: 30 },
      { kind: 'tourist', from: 'right', delay: 150 },
    ],
  },
  {
    cam: OPEN,
    spawns: [
      { kind: 'queen', from: 'right', delay: 20 },
      { kind: 'monk', from: 'left', delay: 120 },
      { kind: 'tourist', from: 'right', delay: 200 },
    ],
  },
  {
    cam: 380 + OPEN,
    spawns: [
      { kind: 'punkgirl', from: 'queue', gap: QUEUE_GAPS[0], delay: 0 },
      { kind: 'mullet', from: 'right', delay: 60 },
      { kind: 'monk', from: 'left', delay: 200 },
    ],
  },
  {
    cam: 840 + OPEN,
    spawns: [
      { kind: 'harness', from: 'queue', gap: QUEUE_GAPS[1], delay: 0 },
      { kind: 'tourist', from: 'right', delay: 40 },
      { kind: 'queen', from: 'queue', gap: QUEUE_GAPS[1], delay: 120 },
      { kind: 'punkgirl', from: 'left', delay: 240 },
    ],
  },
  {
    cam: 1300 + OPEN,
    spawns: [
      { kind: 'queen', from: 'queue', gap: QUEUE_GAPS[2], delay: 0 },
      { kind: 'harness', from: 'right', delay: 30 },
      { kind: 'mullet', from: 'queue', gap: QUEUE_GAPS[3], delay: 120 },
      { kind: 'punkgirl', from: 'right', delay: 200 },
      { kind: 'monk', from: 'queue', gap: QUEUE_GAPS[3], delay: 300 },
      { kind: 'tourist', from: 'left', delay: 380 },
    ],
  },
  {
    cam: LEVEL_LEN - VIEW_W,
    spawns: [
      { kind: 'bouncer', from: 'door', delay: 30 },
      { kind: 'punkgirl', from: 'right', delay: 260 },
      { kind: 'mullet', from: 'left', delay: 420 },
    ],
  },
]

/** a thrown record: spins, flies straight and slices through everyone in its path */
interface Projectile {
  x: number
  y: number
  z: number
  vx: number
  sprite: string
  damage: number
  knockdown: boolean
  rot: number
  t: number
  hit: Set<number>
}

export interface GameCallbacks {
  onScene: (s: Scene) => void
}

export class Game {
  readonly input = new Input()
  private ctx: CanvasRenderingContext2D
  private loop: FixedLoop
  private stage: Stage | null = null
  private fx = new Effects()
  scene: Scene = 'loading'
  player!: Player
  enemies: Enemy[] = []
  props: Breakable[] = []
  private camX = 0
  private tick = 0
  private sceneT = 0
  private waveIdx = 0
  private waveActive = false
  private waveT = 0
  private pending: Spawn[] = []
  private freeze = 0
  private shake = 0
  private lastFoe: Enemy | null = null
  private lastFoeT = 0
  private ghostHp = 1
  private cleared = false
  private heroId: HeroId = 'jule'
  /** frames left of the psychedelic colour wash (PSYCHEDELIC RAVE) */
  private psyT = 0
  /** YO HIGHNESS's spotlight */
  private galleryT = 0
  /** hits landed in a row (resets after a pause) and frames left before it resets */
  private comboHits = 0
  private comboT = 0
  private projectiles: Projectile[] = []

  /** heroes whose sprites exist, in select-screen order */
  private heroes(): HeroId[] {
    return HERO_ORDER.filter((id) => hasSheet(HEROES[id].sheet))
  }

  private cb: GameCallbacks

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.cb = cb
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
    this.loop = new FixedLoop(
      () => this.update(),
      () => this.render(),
    )
    this.input.onFirstInput = () => audio.start()
    // handy in the browser console while tuning: __bb.player, __bb.enemies
    ;(window as unknown as { __bb: Game }).__bb = this
  }

  async start() {
    this.loop.start()
    await loadSprites()
    const stage = new Stage()
    await stage.load()
    this.stage = stage
    this.reset()
    this.setScene('title')
  }

  dispose() {
    this.loop.stop()
    this.input.dispose()
    audio.stop()
  }

  private setScene(s: Scene) {
    this.scene = s
    this.sceneT = 0
    this.cb.onScene(s)
  }

  private reset() {
    this.player = makePlayer(this.heroId, 70, 180)
    this.enemies = []
    this.props = makeBreakables()
    this.camX = 0
    this.waveIdx = 0
    this.waveActive = false
    this.pending = []
    this.fx = new Effects()
    this.lastFoe = null
    this.ghostHp = 1
    this.cleared = false
    this.comboHits = 0
    this.comboT = 0
    this.projectiles = []
    this.galleryT = 0
  }

  // ------------------------------------------------------------ update
  private update() {
    this.input.poll()
    this.tick++
    this.sceneT++
    const pr = this.input.pressed
    switch (this.scene) {
      case 'title':
        if (pr.start || pr.attack) {
          audio.start()
          this.setScene('select')
        }
        return
      case 'select':
        if (pr.left || pr.right) {
          const list = this.heroes()
          const i = list.indexOf(this.heroId) + (pr.right ? 1 : -1)
          this.heroId = list[(i + list.length) % list.length]
          audio.swing()
        }
        if (this.sceneT > 10 && (pr.start || pr.attack)) {
          audio.pickup()
          this.reset()
          this.setScene('play')
        }
        if (pr.pause) this.setScene('title')
        return
      case 'paused':
        if (pr.pause || pr.start) this.setScene('play')
        return
      case 'gameover':
      case 'win':
        if (this.sceneT > 60 && (pr.start || pr.attack)) this.setScene('select')
        this.player.t++
        for (const e of this.enemies) physics(e)
        this.fx.update()
        return
      case 'play':
        if (pr.pause) {
          this.setScene('paused')
          return
        }
        this.updatePlay()
    }
  }

  private updatePlay() {
    if (this.shake > 0) this.shake--
    if (this.psyT > 0) this.psyT--
    if (this.galleryT > 0) this.galleryT--
    if (this.freeze > 0) {
      this.freeze--
      return
    }
    const p = this.player
    this.updateWaves()

    // attack tokens: only the closest few enemies may attack at once
    const fighters = this.enemies
      .filter((e) => e.state !== 'dead' && e.state !== 'enter')
      .sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) * 2 - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y) * 2))
    fighters.forEach((e, i) => (e.attacker = e.isBoss || i < MAX_ATTACKERS))
    // the first attacker keeps its side, the second goes round the other side
    const atk = fighters.filter((e) => e.attacker)
    for (const e of this.enemies) e.slot = 0
    if (atk[0]) atk[0].slot = atk[0].x < p.x ? -1 : 1
    if (atk[1]) atk[1].slot = atk[0].slot === -1 ? 1 : -1

    if (this.comboT > 0 && --this.comboT === 0) this.comboHits = 0
    if (p.state !== 'dead') updatePlayer(p, this.input)
    if (p.running && p.t % 9 === 0) this.fx.dust(p.x - p.facing * 8, p.y)
    // throwing moves launch their projectile on the first active frame
    if (p.move?.projectile && (p.state === 'attack' || p.state === 'special') && p.t === p.move.active[0]) {
      const pr = p.move.projectile
      this.projectiles.push({ x: p.x + p.facing * 16, y: p.y, z: 40, vx: p.facing * pr.speed, sprite: pr.sprite, damage: pr.damage, knockdown: pr.knockdown, rot: 0, t: 0, hit: new Set() })
      p.connected = true // the throw counts as a hit for the combo
      audio.swing()
    }
    // heroes with regen get their breath back when left alone for 3 seconds
    p.calmT++
    if (p.hero.regen && p.calmT > 180 && p.hp > 0 && p.hp < p.maxHp && this.tick % p.hero.regen === 0) p.hp++
    if (p.doubleJumped) {
      p.doubleJumped = false
      this.fx.dust(p.x, p.y - p.z + 4)
      audio.swing()
    }
    if (p.state === 'special' && p.move && p.t === p.move.active[0]) {
      if (p.hero.specialFx === 'shockwave') {
        this.fx.shockwave(p.x, p.y)
        this.shake = 8
        audio.thud()
      } else if (p.hero.specialFx === 'music') {
        this.fx.music(p.x + p.facing * 14, p.y, 52)
        this.psyT = 80
        audio.music()
      } else if (p.hero.specialFx === 'gust') {
        for (let i = 0; i < 3; i++) this.fx.gust(p.x + p.facing * (20 + i * 30), p.y + (i - 1) * 6, p.facing)
        this.shake = 6
        audio.whoosh()
      } else if (p.hero.specialFx === 'tornado') {
        this.fx.dust(p.x - 22, p.y, true)
        this.fx.dust(p.x + 22, p.y, true)
        this.fx.gust(p.x - 10, p.y, -1)
        this.fx.gust(p.x + 10, p.y, 1)
        audio.whoosh()
      } else if (p.hero.specialFx === 'shuffle') {
        this.fx.music(p.x, p.y, 36)
        this.fx.popup(p.x, p.y - 96, 'OINK OINK!', '#ffb3c8')
        audio.music()
      } else if (p.hero.specialFx === 'gallery') {
        this.galleryT = 110
        this.fx.popup(p.x, p.y - 108, 'VOILA!', '#f2c14e')
        audio.flash()
      } else this.fx.ramDust(p.x - p.facing * 14, p.y, p.facing)
      if (p.hero.sugarRush) {
        p.boostT = p.hero.sugarRush
        this.fx.popup(p.x, p.y - 96, 'SUGAR RUSH!', '#ff4fa3')
      }
      this.fx.popup(p.x, p.y - 84, p.hero.specialName, '#5af0ff')
    }
    for (const e of this.enemies) {
      updateEnemy(e, p)
      if (e.state === 'attack' && e.move) this.enemyTrick(e, e.move)
    }

    for (const f of [p as Fighter, ...this.enemies]) {
      const ev = physics(f)
      if (ev === 'thud') {
        this.fx.dust(f.x, f.y, true)
        audio.thud()
        this.shake = Math.max(this.shake, 3)
      } else if (ev === 'landed' && f.isPlayer) {
        this.fx.dust(f.x, f.y)
        if (p.state === 'jump') setState(p, 'land')
        p.move = null
      }
      // keep everyone in the walkable band (except while stepping out of the queue)
      if (f.state !== 'enter') f.y = Math.max(GROUND_TOP, Math.min(GROUND_BOT, f.y))
      f.x = Math.max(8, Math.min(LEVEL_LEN - 8, f.x))
    }
    p.x = Math.max(this.camX + 10, Math.min(this.camX + VIEW_W - 10, p.x))
    // enemies standing on each other's toes drift apart
    const solid = this.enemies.filter((e) => e.state === 'idle' || e.state === 'walk')
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]
        const b = solid[j]
        if (Math.abs(a.x - b.x) < 18 && Math.abs(a.y - b.y) < 7) {
          const s = a.y <= b.y ? -1 : 1
          a.y = Math.max(GROUND_TOP, Math.min(GROUND_BOT, a.y + s * 0.6))
          b.y = Math.max(GROUND_TOP, Math.min(GROUND_BOT, b.y - s * 0.6))
          a.x += a.x <= b.x ? -0.3 : 0.3
          b.x += a.x <= b.x ? 0.3 : -0.3
        }
      }

    this.resolveHits()
    this.updateProjectiles()
    this.dominoes()
    this.updatePickups()
    for (const b of this.props) updateBreakable(b)
    this.props = this.props.filter((b) => !gone(b))
    this.enemies = this.enemies.filter((e) => !e.remove)
    this.fx.update()
    this.updateCamera()
    audio.closeness = Math.max(0, Math.min(1, (p.x - 300) / (DOOR_X - 300)))
    this.ghostHp += (p.hp / p.maxHp - this.ghostHp) * 0.04
    if (this.lastFoeT > 0) this.lastFoeT--

    if (p.state === 'dead' && p.t > 90) this.setScene('gameover')
    if (this.cleared && this.sceneT > 0 && !this.enemies.length) {
      if (this.waveIdx >= WAVES.length) {
        setState(p, 'victory')
        this.setScene('win')
      }
    }
  }

  private updateWaves() {
    if (!this.waveActive) {
      const w = WAVES[this.waveIdx]
      if (w && this.camX >= w.cam - 0.5) {
        this.camX = w.cam
        this.waveActive = true
        this.waveT = 0
        this.pending = [...w.spawns]
      }
      return
    }
    this.waveT++
    for (const s of this.pending.filter((s) => s.delay <= this.waveT)) this.spawn(s)
    this.pending = this.pending.filter((s) => s.delay > this.waveT)
    if (!this.pending.length && this.enemies.every((e) => e.state === 'dead')) {
      this.waveActive = false
      this.waveIdx++
      if (this.waveIdx >= WAVES.length) this.cleared = true
    }
  }

  private spawn(s: Spawn) {
    // no mirror matches: when a hero shares a sheet with an enemy, that enemy is swapped
    if (ENEMY_TYPES[s.kind].sheet === this.player.hero.sheet) {
      const alt: EnemyKind[] = ['punkgirl', 'monk', 'mullet']
      s = { ...s, kind: alt[this.enemies.length % alt.length] }
    }
    const y = GROUND_TOP + 6 + Math.random() * (GROUND_BOT - GROUND_TOP - 12)
    let e: Enemy
    if (s.from === 'queue') e = makeEnemy(s.kind, s.gap!, BARRIER_Y - 8, true)
    else if (s.from === 'door') e = makeEnemy(s.kind, DOOR_X, BARRIER_Y - 6, true)
    else e = makeEnemy(s.kind, s.from === 'right' ? this.camX + VIEW_W + 14 : this.camX - 14, y, false)
    e.facing = e.x > this.player.x ? -1 : 1
    this.enemies.push(e)
  }

  private resolveHits() {
    const p = this.player
    // the player's attacks
    const pAttacking = p.move && !p.move.projectile && ((p.state === 'jump' && p.z > 0) || ((p.state === 'attack' || p.state === 'special') && isActive(p)))
    // multi-hit moves (tornado specials) can hit the same enemies again every few frames
    if (pAttacking && p.move!.rehit && (p.t - p.move!.active[0]) % p.move!.rehit === 0) p.hitList.clear()
    if (pAttacking) {
      for (const e of this.enemies) {
        if (!canBeHit(e) || p.hitList.has(e.id) || !inReach(p, e, p.move!)) continue
        p.hitList.add(e.id)
        p.connected = true
        this.hit(p, e)
      }
    }
    // street props
    if (pAttacking) {
      for (const b of this.props) {
        if (!standing(b) || p.hitList.has(b.id)) continue
        const dx = (b.x - p.x) * p.facing
        if (dx < -6 || dx > p.move!.reach + 12 || Math.abs(b.y - p.y) > 10 || p.z > 30) continue
        p.hitList.add(b.id)
        this.breakProp(b)
      }
    }
    // enemy attacks
    for (const e of this.enemies) {
      if (!e.move || e.move.harmless || e.state !== 'attack' || !isActive(e)) continue
      if (!canBeHit(p) || e.hitList.has(p.id) || !inReach(e, p, e.move)) continue
      e.hitList.add(p.id)
      this.hit(e, p)
    }
  }

  private hit(a: Fighter, t: Fighter) {
    const m = a.move!
    // armoured wind-up (HARNESS BOY flexing): takes the damage but does not flinch
    if (t.state === 'attack' && t.move?.armor && t.t < t.move.active[0] && t.hp > m.damage) {
      t.hp -= Math.round(m.damage * a.power)
      t.flash = 6
      audio.hit(false)
      this.fx.spark(t.x - t.facing * 6, t.y, t.z + 44, false)
      this.freeze = HITSTOP
      this.fx.popup(t.x, t.y - 92, 'FLEX!', '#ffffff')
      return
    }
    // SHOVELIST's groove bonus: dazed (dancing) enemies take extra damage
    let move = m
    if (a.isPlayer && t.stunT > 0 && (a as Player).hero.dazeBonus) {
      move = { ...m, damage: Math.round(m.damage * (a as Player).hero.dazeBonus!) }
      this.fx.popup(t.x, t.y - 92, 'GROOVE!', '#c46bff')
    }
    const down = takeHit(t, a, move)
    if (t.isPlayer) (t as Player).calmT = 0
    const heavy = !!m.heavy || down
    audio.hit(heavy)
    if (a.isPlayer && a.state === 'special' && (a as Player).hero.specialFx === 'ram') this.fx.ramHit(t.x - a.facing * 4, t.y, a.facing)
    this.fx.spark(t.x - t.facing * 6, t.y, t.z + 44, heavy)
    this.fx.hitGag(t.x, t.y, t.z + 46, a.facing, heavy)
    if (m.stun && !down) {
      t.stunT = Math.round(m.stun * ((t as Enemy).isBoss ? 0.35 : 1))
      t.statue = !!m.statue
      if (m.statue) this.fx.popup(t.x, t.y - 84 - (t.id % 3) * 9, `${2 + Math.floor(Math.random() * 98)}.000 €`, '#f2c14e')
    }
    if (!t.isPlayer && ['monk', 'punkgirl'].includes((t as Enemy).kind)) this.fx.gum(t.x + t.facing * 8, t.y, t.z + 58, t.facing)
    if (t.hp <= 0) {
      this.fx.confetti(t.x, t.y, t.z + 40)
      if (Math.random() < 0.3) this.fx.pigeon(t.x, t.y)
    }
    this.freeze = heavy ? HITSTOP_HEAVY : HITSTOP
    this.shake = Math.max(this.shake, heavy ? 6 : 2)
    if (a.isPlayer) {
      const e = t as Enemy
      this.lastFoe = e
      this.lastFoeT = 180
      this.countHit()
      // every hit you land charges the special
      this.player.specialCd = Math.max(0, this.player.specialCd - move.damage * 5)
      this.player.score += Math.round(move.damage * 10 * this.multiplier())
      if (e.hp <= 0) {
        const pts = ENEMY_TYPES[e.kind].score
        this.player.score += pts
        this.fx.popup(e.x, e.y - 80, `+${pts}`)
        if (!e.isBoss && Math.random() < DROP_CHANCE) this.fx.drop(ENEMY_LOOT[Math.floor(Math.random() * ENEMY_LOOT.length)], e.x, e.y)
        if (e.isBoss) {
          this.freeze = 30
          this.shake = 20
        }
      }
    }
  }

  private updateProjectiles() {
    for (const pr of this.projectiles) {
      pr.t++
      pr.x += pr.vx
      pr.rot += 0.5
      for (const e of this.enemies) {
        if (!canBeHit(e) || pr.hit.has(e.id) || Math.abs(e.x - pr.x) > 12 || Math.abs(e.y - pr.y) > 10) continue
        pr.hit.add(e.id)
        const dir = (pr.vx > 0 ? 1 : -1) as 1 | -1
        const thrower = { ...this.player, x: pr.x - dir * 8, facing: dir, power: 1 }
        const down = takeHit(e, thrower, { id: 'record', frames: [], active: [0, 0], reach: 0, damage: pr.damage, knockback: 2.6, knockdown: pr.knockdown })
        this.fx.spark(e.x, e.y, 40, down)
        this.fx.hitGag(e.x, e.y, 46, dir, down)
        audio.hit(down)
        this.freeze = HITSTOP
        this.lastFoe = e
        this.lastFoeT = 180
        this.countHit()
        this.player.score += Math.round(pr.damage * 10 * this.multiplier())
        this.player.specialCd = Math.max(0, this.player.specialCd - pr.damage * 5)
        if (e.hp <= 0) {
          this.fx.confetti(e.x, e.y, 40)
          this.player.score += ENEMY_TYPES[e.kind].score
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.t < 120 && pr.x > this.camX - 40 && pr.x < this.camX + VIEW_W + 40)
  }

  private countHit() {
    this.comboHits++
    this.comboT = 100
  }

  /** score multiplier from the combo: +15 % per hit in a row, up to x2.35 */
  private multiplier() {
    return 1 + Math.min(this.comboHits - 1, 9) * 0.15
  }

  /** an enemy sent flying knocks over whoever it crashes into */
  private dominoes() {
    for (const e of this.enemies) {
      if (e.state !== 'fall' || Math.abs(e.vx) < 1.6 || e.z > 30) continue
      for (const o of this.enemies) {
        if (o === e || !canBeHit(o) || e.hitList.has(o.id)) continue
        if (Math.abs(o.x - e.x) > 16 || Math.abs(o.y - e.y) > 10) continue
        e.hitList.add(o.id)
        const pusher = { ...e, power: 1, facing: (e.vx > 0 ? 1 : -1) as 1 | -1 }
        takeHit(o, pusher, { id: 'domino', frames: [], active: [0, 0], reach: 0, damage: 6, knockback: 2.6, knockdown: true })
        this.fx.spark(o.x, o.y, 40, true)
        this.fx.hitGag(o.x, o.y, 46, pusher.facing, true)
        this.fx.popup(o.x, o.y - 92, 'DOMINO!', '#ffe14a')
        audio.hit(true)
        this.shake = Math.max(this.shake, 5)
        this.countHit()
        this.player.score += Math.round(100 * this.multiplier())
        if (o.hp <= 0) this.fx.confetti(o.x, o.y, 40)
      }
    }
  }

  /** each enemy's signature: a shout on the wind-up, an effect and a sound on the strike */
  private enemyTrick(e: Enemy, m: Move) {
    const p = this.player
    if (e.t === 1 && m.say) this.fx.popup(e.x, e.y - 92, m.say, '#ffffff')
    if (!m.fx || e.t !== m.active[0]) return
    const front = e.x + e.facing * 22
    switch (m.fx) {
      case 'flash':
        this.fx.flash(front, e.y, 52)
        audio.click()
        audio.flash()
        break
      case 'stomp':
        this.fx.stomp(e.x, e.y)
        this.shake = 10
        audio.thud()
        break
      case 'vape':
        this.fx.vape(e.x + e.facing * 14, e.y, 60, e.facing)
        audio.hiss()
        if (Math.abs(p.x - front) < 36 && Math.abs(p.y - e.y) < 14 && p.state !== 'down') {
          p.slowT = 80
          this.fx.popup(p.x, p.y - 84, '*COUGH*', '#b8f0b0')
        }
        break
      case 'gust':
        this.fx.gust(front, e.y, e.facing)
        audio.whoosh()
        break
      case 'gum':
        this.fx.gum(e.x + e.facing * 8, e.y, 60, e.facing)
        audio.pop()
        break
      case 'click':
        audio.click()
        break
      case 'thump':
        this.shake = Math.max(this.shake, 7)
        this.fx.dust(front, e.y)
        audio.thud()
        break
      case 'selfie':
        this.fx.snap(e.x + e.facing * 20, e.y, 78)
        audio.click()
        p.score = Math.max(0, p.score - 50)
        this.fx.popup(p.x, p.y - 30, '-50', '#ff7a7a')
        break
    }
  }

  private breakProp(b: Breakable) {
    const p = this.player
    b.hp--
    audio.hit(b.hp <= 0)
    this.fx.spark(b.x, b.y, 20, b.hp <= 0)
    this.freeze = HITSTOP
    if (b.hp > 0) return
    b.broken = true
    this.shake = Math.max(this.shake, 3)
    p.score += 50
    if (b.kind === 'crate') {
      this.fx.bottle(b.x - 6, b.y, 14)
      this.fx.bottle(b.x + 6, b.y, 18)
    }
    if (b.kind === 'cone') {
      b.vx = p.facing * 3
      this.fx.dust(b.x, b.y)
    }
    const loot = LOOT[b.kind]
    if (loot.length) this.fx.drop(loot[Math.floor(Math.random() * loot.length)], b.x + p.facing * 8, b.y + 2)
  }

  private updatePickups() {
    const p = this.player
    if (p.state !== 'idle' && p.state !== 'walk') return
    for (const d of this.fx.pickups) {
      if (d.z > 0 || Math.abs(d.x - p.x) > 12 || Math.abs(d.y - p.y) > 8) continue
      d.t = 99999
      const it = PICKUPS[d.kind]
      if (it.hp) p.hp = Math.min(p.maxHp, p.hp + it.hp)
      if (it.special) p.specialCd = 0
      if (it.score) p.score += it.score
      this.fx.popup(p.x, p.y - 80, it.hp ? `+${it.hp} ${it.label}` : `+${it.label}`, it.score ? '#ffe14a' : '#7dff5a')
      audio.pickup()
    }
  }

  private updateCamera() {
    if (this.waveActive) return
    const target = this.player.x - 150
    const next = WAVES[this.waveIdx]
    const limit = next ? next.cam : LEVEL_LEN - VIEW_W
    // never scrolls back, like the arcade classics
    this.camX = Math.max(this.camX, Math.min(limit, LEVEL_LEN - VIEW_W, this.camX + Math.max(0, (target - this.camX) * 0.12)))
  }

  // ------------------------------------------------------------ render
  private render() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#05040c'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    if (!this.stage) {
      drawText(ctx, 'LOADING...', VIEW_W >> 1, VIEW_H >> 1, { align: 'center' })
      return
    }
    if (this.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake * 0.6))
    const cam = Math.round(this.camX)
    this.stage.drawBack(ctx, cam, this.tick)
    this.fx.drawGround(ctx, cam, this.tick)
    const all: Fighter[] = this.scene === 'title' || this.scene === 'select' ? [] : [this.player, ...this.enemies]
    const behind = all.filter((f) => f.y < BARRIER_Y).sort((a, b) => a.y - b.y)
    for (const f of behind) drawFighter(ctx, f, cam)
    this.stage.drawBarriers(ctx, cam)
    // fighters and street props share one depth order
    const playing = this.scene !== 'title' && this.scene !== 'select'
    const front: { y: number; draw: () => void }[] = all.filter((f) => f.y >= BARRIER_Y).map((f) => ({ y: f.y, draw: () => this.drawOne(ctx, f, cam) }))
    if (playing) for (const b of this.props) front.push({ y: b.y, draw: () => drawBreakable(ctx, b, cam) })
    if (playing)
      for (const pr of this.projectiles)
        front.push({
          y: pr.y,
          draw: () => {
            ctx.fillStyle = 'rgba(8,6,16,0.4)'
            ctx.fillRect(Math.round(pr.x - cam) - 4, Math.round(pr.y), 9, 1)
            drawFrame(ctx, sheet('items'), pr.sprite, pr.x - cam, pr.y - pr.z, 1, { tilt: pr.rot })
          },
        })
    front.sort((a, b) => a.y - b.y)
    for (const d of front) d.draw()
    this.fx.drawAir(ctx, cam)
    if (this.psyT > 0) this.drawPsychedelic(ctx)
    if (this.galleryT > 0) this.drawGallery(ctx)
    if (this.fx.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.fx.flashT * 0.06})`
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const t = this.sceneT
    switch (this.scene) {
      case 'title':
        dim(ctx, 0.55)
        drawBanner(ctx, [{ text: 'BERLIN', scale: 4, color: '#f2f2f8' }, { text: '3000', scale: 4, color: '#ff3a5a' }], 30)
        drawText(ctx, 'LEVEL 1: QUEUE TO BERG', VIEW_W >> 1, 112, { align: 'center', color: '#9aa2c4', outline: '#14101c' })
        if (Math.floor(t / 25) % 2 === 0) drawText(ctx, 'CLICK HERE, THEN PRESS ENTER', VIEW_W >> 1, 134, { align: 'center', color: '#ffe14a', outline: '#14101c' })
        drawText(ctx, 'ARROWS/WASD MOVE   X HIT   C JUMP   V SPECIAL', VIEW_W >> 1, 168, { align: 'center', color: '#c8ccdc', outline: '#14101c' })
        drawText(ctx, 'COMBO: KEEP HITTING X - RUN: TAP TWICE - JUMP + X', VIEW_W >> 1, 180, { align: 'center', color: '#c8ccdc', outline: '#14101c' })
        drawText(ctx, 'M MUTE   ESC PAUSE', VIEW_W >> 1, 192, { align: 'center', color: '#c8ccdc', outline: '#14101c' })
        return
      case 'select':
        this.drawSelect(ctx, t)
        return
      case 'play':
      case 'paused':
      case 'gameover':
      case 'win': {
        const boss = this.enemies.find((e) => e.isBoss) ?? null
        drawHud(ctx, this.player, this.lastFoeT > 0 ? this.lastFoe : null, boss, this.tick, this.ghostHp)
        if (this.scene === 'play') drawCombo(ctx, this.comboHits, this.comboT)
        if (this.scene === 'play' && !this.waveActive && this.waveIdx > 0 && this.waveIdx < WAVES.length) drawGo(ctx, this.tick)
        if (this.scene === 'play' && t < 150 && this.waveIdx === 0)
          drawBanner(ctx, [{ text: 'LEVEL 1', scale: 2, color: '#ffe14a' }, { text: 'QUEUE TO BERG', scale: 3, color: '#ffffff' }], 70)
        if (this.scene === 'paused') {
          dim(ctx, 0.5)
          drawBanner(ctx, [{ text: 'PAUSE', scale: 3, color: '#ffffff' }], 92)
        }
        if (this.scene === 'gameover') {
          dim(ctx, Math.min(0.6, t / 60))
          drawBanner(ctx, [{ text: 'HEUTE', scale: 3, color: '#ff3a5a' }, { text: 'LEIDER NICHT.', scale: 3, color: '#ff3a5a' }, { text: 'PRESS ENTER TO RETRY', scale: 1, color: '#ffffff' }], 62)
        }
        if (this.scene === 'win') {
          dim(ctx, Math.min(0.55, t / 60))
          drawBanner(
            ctx,
            [
              { text: 'KOMM REIN,', scale: 3, color: '#7dff5a' },
              { text: 'VIEL SPASS!', scale: 3, color: '#7dff5a' },
              { text: `SCORE ${this.player.score}`, scale: 2, color: '#ffe14a' },
              { text: 'PRESS ENTER TO PLAY AGAIN', scale: 1, color: '#ffffff' },
            ],
            62,
          )
        }
      }
    }
  }

  /** PSYCHEDELIC RAVE: shifting rainbow bands washed over the scene */
  /** the gallery spotlight: the street goes dark, a warm cone of light falls on the artist */
  private drawGallery(ctx: CanvasRenderingContext2D) {
    const k = Math.min(1, this.galleryT / 15, (110 - this.galleryT) / 6)
    const x = Math.round(this.player.x - this.camX)
    const y = Math.round(this.player.y)
    ctx.save()
    ctx.fillStyle = `rgba(6,4,14,${0.45 * k})`
    ctx.beginPath()
    ctx.rect(0, 0, VIEW_W, VIEW_H)
    ctx.moveTo(x - 10, 0)
    ctx.lineTo(x - 46, y + 6)
    ctx.lineTo(x + 46, y + 6)
    ctx.lineTo(x + 10, 0)
    ctx.closePath()
    ctx.fill('evenodd')
    ctx.fillStyle = `rgba(255,236,190,${0.16 * k})`
    ctx.beginPath()
    ctx.moveTo(x - 10, 0)
    ctx.lineTo(x - 46, y + 6)
    ctx.lineTo(x + 46, y + 6)
    ctx.lineTo(x + 10, 0)
    ctx.fill()
    ctx.restore()
  }

  private drawPsychedelic(ctx: CanvasRenderingContext2D) {
    const k = Math.min(1, this.psyT / 20)
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const bands = 8
    for (let i = 0; i < bands; i++) {
      const hue = (this.tick * 9 + i * (360 / bands)) % 360
      ctx.fillStyle = `hsla(${hue}, 100%, 55%, ${0.45 * k})`
      const x = ((i * VIEW_W) / bands + this.tick * 3) % VIEW_W
      ctx.fillRect(Math.round(x), 0, Math.ceil(VIEW_W / bands) + 1, VIEW_H)
      ctx.fillRect(Math.round(x - VIEW_W), 0, Math.ceil(VIEW_W / bands) + 1, VIEW_H)
    }
    ctx.restore()
  }

  private drawSelect(ctx: CanvasRenderingContext2D, t: number) {
    dim(ctx, 0.6)
    drawText(ctx, 'CHOOSE YOUR FIGHTER', VIEW_W >> 1, 10, { scale: 2, align: 'center', color: '#ffe14a', outline: '#14101c', shadow: '#14101c' })
    const list = this.heroes()
    if (!list.includes(this.heroId)) this.heroId = list[0]
    // a row of portraits
    const pw = 44
    const x0 = Math.round((VIEW_W - list.length * pw) / 2)
    list.forEach((id, i) => {
      const h = HEROES[id]
      const on = id === this.heroId
      const x = x0 + i * pw
      ctx.fillStyle = on ? h.color : '#14101c'
      ctx.fillRect(x, 31, pw - 4, 44)
      ctx.fillStyle = on ? '#3a2a5a' : '#1a1428'
      ctx.fillRect(x + 1, 32, pw - 6, 42)
      ctx.save()
      if (!on) ctx.globalAlpha = 0.55
      drawPortrait(ctx, sheet(h.sheet), on ? 'portrait_angry' : 'portrait_neutral', x + 2, 33)
      ctx.restore()
    })
    // the selected hero, big
    const h = HEROES[this.heroId]
    const s = sheet(h.sheet)
    ctx.fillStyle = 'rgba(26,20,40,0.85)'
    ctx.fillRect(40, 84, VIEW_W - 80, 104)
    ctx.fillStyle = h.color
    ctx.fillRect(40, 84, VIEW_W - 80, 1)
    ctx.fillRect(40, 187, VIEW_W - 80, 1)
    drawFrame(ctx, s, h.anim.idle[Math.floor(t / h.anim.idleRate) % h.anim.idle.length], 104, 180, 1)
    const tx = 156
    drawText(ctx, h.name, tx, 96, { scale: 2, color: h.color, outline: '#14101c' })
    drawText(ctx, h.tagline, tx, 116, { color: '#ffffff', outline: '#14101c' })
    drawText(ctx, h.trait, tx, 130, { color: h.color, outline: '#14101c' })
    drawText(ctx, `SPECIAL: ${h.specialName}`, tx, 144, { color: '#5af0ff', outline: '#14101c' })
    // stat bars: health, speed, reach
    const stats: [string, number][] = [
      ['POWER', Math.max(...h.combo.map((m) => m.damage), h.special.damage) / 20],
      ['SPEED', h.walkX / 1.45],
      ['HEALTH', h.hp / 150],
    ]
    stats.forEach(([label, k], i) => {
      const y = 156 + i * 9
      drawText(ctx, label, tx, y, { color: '#9aa2c4', outline: '#14101c' })
      ctx.fillStyle = '#14101c'
      ctx.fillRect(tx + 44, y, 82, 6)
      ctx.fillStyle = h.color
      ctx.fillRect(tx + 45, y + 1, Math.round(80 * Math.min(1, k)), 4)
    })
    if (Math.floor(t / 25) % 2 === 0) drawText(ctx, '< >  CHOOSE     ENTER / X  FIGHT', VIEW_W >> 1, 200, { align: 'center', color: '#c8ccdc', outline: '#14101c' })
  }

  /** a fighter plus what goes with it: ram speed lines, dizzy stars */
  private drawOne(ctx: CanvasRenderingContext2D, f: Fighter, cam: number) {
    const fx = sheet('fx')
    const p = f.isPlayer ? (f as Player) : null
    if (p && p.state === 'special' && p.move && p.hero.specialFx === 'ram' && p.t >= p.move.active[0] && p.t < p.move.active[1] - 6)
      drawFrame(ctx, fx, 'ramlines', p.x - cam - p.facing * 30, p.y - 2, p.facing, { alpha: 0.85 })
    drawFighter(ctx, f, cam)
    if (!f.isPlayer && f.state === 'down' && f.hp > 0) drawStars(ctx, f.x - cam - f.facing * 22, f.y - 14, this.tick)
    if (f.stunT > 0) drawStars(ctx, f.x - cam, f.y - 78, this.tick)
  }
}
