import { audio } from './audio'
import {
  band,
  HITSTOP,
  HITSTOP_HEAVY,
  MAX_ATTACKERS,
  RES,
  VIEW_H,
  VIEW_W,
} from './constants'
import { drawStars, Effects, type PickupKind } from './effects'
import { ENEMY_TYPES, makeEnemy, updateEnemy, type Enemy, type EnemyKind } from './enemy'
import { canBeHit, drawFighter, inReach, isActive, physics, setState, takeHit, type Fighter, type Move } from './fighter'
import { drawText } from './font'
import { dim, drawBanner, drawCombo, drawGo, drawHud } from './hud'
import { Input } from './input'
import { drawLogo } from './logo'
import { FixedLoop } from './loop'
import { HERO_ORDER, HEROES, SPECIAL_SLOWDOWN, type HeroId } from './heroes'
import { LEVELS, rollSpawns, rollWaves, unlockedCount, unlockNext, type Spawn, type WaveDef } from './levels'
import { makePlayer, updatePlayer, type Player } from './player'
import { drawBerlinMap, drawPin, SPOTS } from './map'
import { drawBreakable, gone, LOOT, makeBreakables, standing, updateBreakable, type Breakable } from './props'
import type { Stage } from './stage'
import { drawFrame, drawPortrait, hasSheet, loadSprites, sheet } from './sprites'

/** what a pickup does: heal (hp), refill the special, or score points */
const PICKUPS: Record<PickupKind, { label: string; hp?: number; special?: boolean; score?: number; ticket?: boolean }> = {
  doner: { label: 'DONER', hp: 35 },
  currywurst: { label: 'CURRYWURST', hp: 25 },
  pretzel: { label: 'BREZEL', hp: 15 },
  mate: { label: 'MATE: SPECIAL READY', special: true },
  cash: { label: '500', score: 500 },
  phone: { label: '300', score: 300 },
  wristband: { label: 'VIP STAMP 1000', score: 1000 },
  glowstick: { label: '200', score: 200 },
  // the U-Bahn: a day ticket makes the inspectors harmless for 25 seconds
  ticket: { label: 'TAGESTICKET', ticket: true },
  flatwhite: { label: 'FLAT WHITE: SPECIAL READY', special: true },
  franzbroetchen: { label: 'FRANZBROETCHEN', hp: 20 },
  avotoast: { label: 'AVOCADO TOAST', hp: 30 },
  carrotcake: { label: 'KAROTTENKUCHEN', hp: 25 },
  oatmilk: { label: '150', score: 150 },
  sourdough: { label: 'SAUERTEIG', hp: 15 },
  yogamat: { label: '150', score: 150 },
  pumpkin: { label: 'KUERBIS', hp: 12 },
  goldkey: { label: 'PENTHOUSE-SCHLUESSEL 1000', score: 1000 },
  mug: { label: '200', score: 200 },
  glasscase: { label: '300', score: 300 },
  record: { label: 'RARE VINYL 500', score: 500 },
  falafel: { label: 'FALAFEL', hp: 30 },
  gummies: { label: 'GUMMIBAERCHEN', hp: 12 },
  coffee: { label: 'KAFFEE: SPECIAL READY', special: true },
  umbrella: { label: '150', score: 150 },
  pizzabox: { label: '150', score: 150 },
  skate: { label: '250', score: 250 },
  gnome: { label: 'GARTENZWERG 1000', score: 1000 },
  shoe: { label: '400', score: 400 },
  keys: { label: '300', score: 300 },
  wallet: { label: '500', score: 500 },
  shades: { label: '200', score: 200 },
}

export type Scene = 'loading' | 'title' | 'levels' | 'select' | 'play' | 'paused' | 'gameover' | 'win'

/** someone standing in the way who never fights: hitting them costs points */
interface Bystander {
  id: number
  x: number
  y: number
  look: string
  flip: boolean
  flinch: number
  phase: number
}

const BYSTANDER_LINES = ['HEY!', 'AUA!', 'SPINNST DU?!', 'ALTER!', 'NICHT MICH!']

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
  /** the SOUND menu entry (the mute state lives in the page) */
  onToggleMute?: () => void
  /** on-screen touch controls are shown (menu hints name the touch buttons) */
  touch?: boolean
}

export class Game {
  readonly input = new Input()
  private ctx: CanvasRenderingContext2D
  private loop: FixedLoop
  private stages: Stage[] = []
  /** the level being played (or highlighted on the level-select screen) */
  private levelIdx = 0
  /** this run's waves (rolled at every start) */
  private waves: WaveDef[] = []
  private get level() {
    return LEVELS[this.levelIdx]
  }
  private get stage(): Stage | null {
    return this.stages[this.levelIdx] ?? null
  }
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
  private bystanders: Bystander[] = []
  /** the level's fights are won: the hero now walks to the exit door */
  private exitOpen = false
  /** frames since the hero started walking through the exit door (0 = not yet) */
  private exitT = 0
  /** the side room (cafe): not visited yet, fighting inside, won (can leave), left */
  private sideState: 'none' | 'fight' | 'clear' | 'done' = 'none'
  /** the circle wipe between the street and the side room */
  private trans: { t: number; to: 'side' | 'street' } | null = null
  /** what stays outside while the hero is in the side room */
  private outside: { props: Breakable[]; bystanders: Bystander[]; pickups: Effects['pickups'] } | null = null
  /** highlighted entry of the menu on screen (title, pause, game over, win) */
  private menuIdx = 0
  /** the CONTROLS page of the main menu is open */
  private showControls = false

  /** the entries of the current scene's menu */
  private menuItems(): string[] {
    switch (this.scene) {
      case 'title':
        return ['PLAY', 'CONTROLS', `SOUND: ${audio.muted ? 'OFF' : 'ON'}`]
      case 'paused':
        return ['RESUME', 'RESTART LEVEL', 'CHANGE FIGHTER', 'LEVEL SELECT', 'MAIN MENU']
      case 'gameover':
        return ['RETRY', 'CHANGE FIGHTER', 'LEVEL SELECT', 'MAIN MENU']
      case 'win':
        return [...(this.levelIdx + 1 < LEVELS.length ? ['NEXT LEVEL'] : []), 'PLAY AGAIN', 'LEVEL SELECT', 'MAIN MENU']
      default:
        return []
    }
  }

  /** up/down moves the highlight; ENTER or X picks. Returns the picked label, or null. */
  private menuPick(): string | null {
    const pr = this.input.pressed
    const items = this.menuItems()
    if (pr.up || pr.down) {
      this.menuIdx = (this.menuIdx + (pr.down ? 1 : -1) + items.length) % items.length
      audio.swing()
    }
    if (pr.start || pr.attack) {
      audio.start()
      audio.pickup()
      return items[this.menuIdx]
    }
    return null
  }

  private drawMenu(ctx: CanvasRenderingContext2D, y: number) {
    this.menuItems().forEach((label, i) => {
      const on = i === this.menuIdx
      const text = on ? `> ${label} <` : label
      drawText(ctx, text, VIEW_W >> 1, y + i * 14, { scale: on ? 1 : 1, align: 'center', color: on ? '#ffe14a' : '#9aa2c4', outline: '#14101c', shadow: on ? '#14101c' : undefined })
    })
  }

  /** heroes whose sprites exist, in select-screen order */
  private heroes(): HeroId[] {
    // the redesigned RAVE QUEEN takes over from the enemy-sheet version once her art exists
    return HERO_ORDER.map((id) => (id === 'queen' && hasSheet('ravequeen') ? 'ravequeen' : id)).filter((id) => hasSheet(HEROES[id].sheet))
  }

  private cb: GameCallbacks
  /** the little hero on the level-select map */
  private mapWalker = { x: SPOTS.berghain.x, y: SPOTS.berghain.y, tx: 0, ty: 0, facing: 1 as 1 | -1 }
  /** a click or tap on the canvas, in art pixels (used by the map) */
  private tap: { x: number; y: number } | null = null

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.cb = cb
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
    this.loop = new FixedLoop(
      () => this.update(),
      () => this.render(),
    )
    this.input.onFirstInput = () => audio.start()
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect()
      this.tap = { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H }
      audio.start()
    })
    // handy in the browser console while tuning: __bb.player, __bb.enemies
    ;(window as unknown as { __bb: Game }).__bb = this
  }

  async start() {
    this.loop.start()
    await loadSprites()
    const stages = LEVELS.map((l) => l.makeStage())
    await Promise.all(stages.map((st) => st.load()))
    this.stages = stages
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
    this.menuIdx = 0
    this.showControls = false
    this.cb.onScene(s)
  }

  private reset() {
    this.player = makePlayer(this.heroId, 70, 180)
    this.enemies = []
    this.props = makeBreakables(this.level.props)
    this.waves = rollWaves(this.level.waves)
    this.stage?.reset?.()
    audio.mode = this.level.music
    if (this.stage) [band.top, band.bot] = this.stage.band
    this.player.y = Math.max(band.top + 10, this.player.y)
    this.exitOpen = false
    this.exitT = 0
    this.sideState = 'none'
    this.trans = null
    this.outside = null
    // bystanders spread over the level, never at the very start
    const bs = this.level.bystanders
    this.bystanders = []
    if (bs && this.stage)
      for (let i = 0; i < bs.count; i++) {
        const span = (this.stage.len - 420) / bs.count
        this.bystanders.push({
          id: 9000 + i,
          x: Math.round(300 + span * (i + 0.2 + Math.random() * 0.6)),
          y: Math.round(band.top + 6 + Math.random() * (band.bot - band.top - 14)),
          look: bs.looks[Math.floor(Math.random() * bs.looks.length)],
          flip: Math.random() < 0.5,
          flinch: 0,
          phase: Math.floor(Math.random() * 60),
        })
      }
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
    // the backdrop keeps living behind the menus (the train rolls on)
    if (this.scene !== 'play' && this.scene !== 'paused' && this.stage) this.stage.update()
    switch (this.scene) {
      case 'title': {
        if (this.showControls) {
          if (pr.start || pr.attack || pr.pause) this.showControls = false
          return
        }
        const pick = this.menuPick()
        if (pick === 'PLAY') this.setScene('levels')
        else if (pick === 'CONTROLS') this.showControls = true
        else if (pick?.startsWith('SOUND')) {
          if (this.cb.onToggleMute) this.cb.onToggleMute()
          else audio.setMuted(!audio.muted)
        }
        return
      }
      case 'levels': {
        const tap = this.tap
        this.tap = null
        let go = this.sceneT > 10 && (pr.start || pr.attack)
        let pick = this.levelIdx
        if (pr.left || pr.right || pr.up || pr.down) pick = (pick + (pr.right || pr.up ? 1 : -1) + LEVELS.length) % LEVELS.length
        if (tap) {
          // a tap on a pin picks it (a second tap goes); a tap on the card goes
          const hit = LEVELS.findIndex((lv) => Math.hypot(SPOTS[lv.id].x - tap.x, SPOTS[lv.id].y - 7 - tap.y) < 12)
          if (hit >= 0) {
            if (hit === this.levelIdx) go = true
            pick = hit
          } else if (tap.x > 274) go = true
        }
        if (pick !== this.levelIdx) {
          this.levelIdx = pick
          this.stage?.reset?.()
          audio.mode = this.level.music
          audio.swing()
        }
        // the hero on the map walks to the chosen pin
        const w = this.mapWalker
        const s = SPOTS[this.level.id]
        w.tx = s.x
        w.ty = s.y
        const dx = w.tx - w.x
        const dy = w.ty - w.y
        const d = Math.hypot(dx, dy)
        if (d > 0.5) {
          const v = Math.min(d, 1.4)
          w.x += (dx / d) * v
          w.y += (dy / d) * v
          if (Math.abs(dx) > 0.5) w.facing = dx > 0 ? 1 : -1
        }
        if (go) {
          if (this.levelIdx < unlockedCount()) {
            audio.pickup()
            this.setScene('select')
          } else audio.hit(false)
        }
        if (pr.pause) this.setScene('title')
        return
      }
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
        if (pr.pause) this.setScene('levels')
        return
      case 'paused': {
        if (pr.pause) {
          this.setScene('play')
          return
        }
        const pick = this.menuPick()
        if (pick === 'RESUME') this.setScene('play')
        else if (pick === 'RESTART LEVEL') {
          this.reset()
          this.setScene('play')
        } else if (pick === 'CHANGE FIGHTER') this.setScene('select')
        else if (pick === 'LEVEL SELECT') this.setScene('levels')
        else if (pick === 'MAIN MENU') this.setScene('title')
        return
      }
      case 'gameover':
      case 'win': {
        const pick = this.sceneT > 60 ? this.menuPick() : null
        if (pick === 'NEXT LEVEL') this.levelIdx++
        if (pick === 'RETRY' || pick === 'PLAY AGAIN' || pick === 'NEXT LEVEL') {
          this.reset()
          this.setScene('play')
          return
        }
        if (pick === 'CHANGE FIGHTER') this.setScene('select')
        else if (pick === 'LEVEL SELECT') this.setScene('levels')
        else if (pick === 'MAIN MENU') this.setScene('title')
        this.player.t++
        for (const e of this.enemies) physics(e)
        this.fx.update()
        return
      }
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
    if (this.trans) {
      this.updateTransition()
      return
    }
    const p = this.player
    this.updateWaves()
    // the stage moves: a braking or departing train throws everyone standing
    const jolt = this.stage!.update()
    if (jolt) {
      for (const f of [p as Fighter, ...this.enemies])
        if (f.z === 0 && f.state !== 'down' && f.state !== 'dead' && f.state !== 'enter') f.vx += jolt
      if (Math.abs(jolt) > 1) {
        this.shake = Math.max(this.shake, 6)
        this.fx.popup(p.x, p.y - 100, jolt > 0 ? 'RUCK!' : 'WOAH!', '#ffe14a')
      }
    }

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
    // BAD BAD SCHWEIN's dance: a deep "bum" and a puff of dust on every step
    if (p.state === 'special' && p.hero.specialFx === 'shuffle' && p.move?.rehit && isActive(p) && (p.t - p.move.active[0]) % p.move.rehit === 0) {
      audio.bum()
      this.fx.dust(p.x - 14, p.y)
      this.fx.dust(p.x + 14, p.y)
      this.shake = Math.max(this.shake, 3)
    }
    // throwing moves launch their projectile on the first active frame
    if (p.move?.projectile && (p.state === 'attack' || p.state === 'special') && p.t === p.move.active[0]) {
      const pr = p.move.projectile
      this.projectiles.push({ x: p.x + p.facing * 16, y: p.y, z: 46, vx: p.facing * pr.speed, sprite: pr.sprite, damage: pr.damage, knockdown: pr.knockdown, rot: 0, t: 0, hit: new Set() })
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
        audio.sitar()
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
        // just a dance: the steps (bum, bum, bum) are played below, on each hit of the move
      } else if (p.hero.specialFx === 'gallery') {
        this.galleryT = 110
        this.fx.popup(p.x, p.y - 124, 'VOILA!', '#f2c14e')
        audio.flash()
      } else this.fx.ramDust(p.x - p.facing * 14, p.y, p.facing)
      if (p.hero.sugarRush) {
        p.boostT = p.hero.sugarRush
        this.fx.popup(p.x, p.y - 110, 'SUGAR RUSH!', '#ff4fa3')
      }
      this.fx.popup(p.x, p.y - 97, p.hero.specialName, '#5af0ff')
    }
    for (const e of this.enemies) {
      updateEnemy(e, p)
      if (e.state === 'attack' && e.move) this.enemyTrick(e, e.move)
      // the buskers never stop busking while they are on screen
      if (e.kind === 'busker' && (e.state === 'idle' || e.state === 'walk') && (this.tick + e.id * 37) % 260 === 0 && Math.abs(e.x - this.camX - VIEW_W / 2) < VIEW_W / 2)
        audio.riff(0.45)
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
      if (f.state !== 'enter' && !(f.isPlayer && this.exitT)) f.y = Math.max(band.top, Math.min(band.bot, f.y))
      f.x = Math.max(8, Math.min(this.stage!.len - 8, f.x))
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
          a.y = Math.max(band.top, Math.min(band.bot, a.y + s * 0.6))
          b.y = Math.max(band.top, Math.min(band.bot, b.y - s * 0.6))
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
    if (!this.stage!.inSide) this.updateCamera()
    audio.closeness = this.stage!.closeness(p.x)
    this.ghostHp += (p.hp / p.maxHp - this.ghostHp) * 0.04
    if (this.lastFoeT > 0) this.lastFoeT--

    if (p.state === 'dead' && p.t > 90) this.setScene('gameover')
    if (this.cleared && !this.exitOpen && !this.enemies.length && this.waveIdx >= this.waves.length) {
      this.exitOpen = true
      this.fx.popup(p.x, p.y - 100, this.stage!.exit.label, '#7dff5a')
    }
    // the level ends when the hero walks through the exit door
    const ex = this.stage!.exit
    if (this.exitOpen && !this.exitT && !this.stage!.inSide && p.z === 0 && (p.state === 'idle' || p.state === 'walk') && Math.abs(p.x - ex.x) < 16 && p.y < band.top + 12) {
      this.exitT = 1
      audio.pickup()
    }
    if (this.exitT) {
      this.exitT++
      p.x += (ex.x - p.x) * 0.2
      p.y -= 0.45
      setState(p, 'walk')
      if (this.exitT > 50) {
        setState(p, 'victory')
        unlockNext(this.levelIdx)
        this.setScene('win')
      }
    }
    for (const b of this.bystanders) if (b.flinch > 0) b.flinch--
    // the side room's door: in from the street between fights, out once the room is won
    const side = this.stage!.side
    const atDoor = (x: number) => p.z === 0 && (p.state === 'idle' || p.state === 'walk') && Math.abs(p.x - x) < 16 && p.y < band.top + 12
    if (side && !this.exitT) {
      if (!this.stage!.inSide && this.sideState === 'none' && !this.waveActive && !this.enemies.length && atDoor(side.door)) this.trans = { t: 0, to: 'side' }
      else if (this.stage!.inSide && this.sideState === 'clear' && atDoor(this.camX + side.doorScreenX)) this.trans = { t: 0, to: 'street' }
    }
  }

  /** the circle wipe: closes on the hero, swaps street and side room, opens again */
  private updateTransition() {
    const tr = this.trans!
    tr.t++
    if (tr.t === 1) audio.pickup()
    if (tr.t === 22) {
      const st = this.stage!
      const side = st.side!
      const p = this.player
      if (tr.to === 'side') {
        st.inSide = true
        ;[band.top, band.bot] = side.band
        this.outside = { props: this.props, bystanders: this.bystanders, pickups: this.fx.pickups }
        this.props = makeBreakables((this.level.sideProps ?? []).map(([k, x, y]) => [k, this.camX + x, y]))
        this.bystanders = []
        this.fx.pickups = []
        p.x = this.camX + side.doorScreenX + 24
        p.y = band.top + 8
        p.facing = 1
        this.sideState = 'fight'
        this.waveActive = true
        this.waveT = 0
        this.pending = this.level.sideWave ? rollSpawns(this.level.sideWave) : []
        audio.mode = 'cafe'
      } else {
        st.inSide = false
        ;[band.top, band.bot] = st.band
        if (this.outside) {
          this.props = this.outside.props
          this.bystanders = this.outside.bystanders
          this.fx.pickups = this.outside.pickups
        }
        p.x = side.door
        p.y = band.top + 6
        this.sideState = 'done'
        audio.mode = this.level.music
      }
      this.fx.debris = []
      this.projectiles = []
      setState(p, 'idle')
    }
    if (tr.t >= 44) this.trans = null
  }

  private updateWaves() {
    if (!this.waveActive) {
      if (this.stage!.inSide) return
      const w = this.waves[this.waveIdx]
      if (w && this.camX >= w.cam - 0.5) {
        this.camX = w.cam
        this.waveActive = true
        this.waveT = 0
        this.pending = rollSpawns(w)
        if (w.station) this.stage!.arrive?.()
      }
      return
    }
    // spawns wait while the train is still braking into the station
    if (this.stage!.ready()) this.waveT++
    for (const s of this.pending.filter((s) => s.delay <= this.waveT)) this.spawn(s)
    this.pending = this.pending.filter((s) => s.delay > this.waveT)
    if (!this.pending.length && this.enemies.every((e) => e.state === 'dead') && this.sideState === 'fight') {
      // the side room is won: a treat and a bonus, and the door out opens
      this.waveActive = false
      this.sideState = 'clear'
      this.player.score += 1000
      this.fx.popup(this.player.x, this.player.y - 100, `${this.stage!.side!.label} FREI! +1000`, '#ffe14a')
      this.fx.drop('flatwhite', this.camX + VIEW_W / 2, band.top + 20)
      return
    }
    if (!this.pending.length && this.enemies.every((e) => e.state === 'dead')) {
      // the train leaves after a station fight, except at the last one: that is where the hero gets off
      if (this.waves[this.waveIdx].station && this.waveIdx < this.waves.length - 1) this.stage!.depart?.()
      this.waveActive = false
      this.waveIdx++
      if (this.waveIdx >= this.waves.length) this.cleared = true
    }
  }

  private spawn(s: Spawn) {
    // no mirror matches: when a hero shares a sheet with an enemy, that enemy is swapped
    const look = ENEMY_TYPES[s.kind].sheet
    if (look === this.player.hero.sheet || look === this.player.hero.twin) {
      const alt: EnemyKind[] = ['punkgirl', 'monk', 'mullet']
      s = { ...s, kind: alt[this.enemies.length % alt.length] }
    }
    const y = band.top + 6 + Math.random() * (band.bot - band.top - 12)
    // out of the queue, the club door or a train door; from a screen edge if the stage has no such place
    const at = s.from === 'left' || s.from === 'right' ? null : this.stage!.spawnPoint(s.from, this.camX)
    const fromRight = s.from === 'right' || (!at && Math.random() < 0.6)
    const e = at ? makeEnemy(s.kind, at.x, at.y, at.enter) : makeEnemy(s.kind, fromRight ? this.camX + VIEW_W + 14 : this.camX - 14, y, false)
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
    // bystanders: they don't fight back, they just cost you
    if (pAttacking) {
      for (const b of this.bystanders) {
        if (p.hitList.has(b.id) || !inReach(p, { x: b.x, y: b.y, z: 0 } as Fighter, p.move!)) continue
        p.hitList.add(b.id)
        b.flinch = 16
        p.score = Math.max(0, p.score - 100)
        audio.pop()
        this.shake = Math.max(this.shake, 2)
        this.fx.popup(b.x, b.y - 92, BYSTANDER_LINES[Math.floor(Math.random() * BYSTANDER_LINES.length)], '#ffffff')
        this.fx.popup(b.x, b.y - 30, '-100', '#ff7a7a')
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
      if (!e.move || e.move.harmless || e.whiff || e.state !== 'attack' || !isActive(e)) continue
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
      this.fx.spark(t.x - t.facing * 6, t.y, t.z + 50, false)
      this.freeze = HITSTOP
      this.fx.popup(t.x, t.y - 106, 'FLEX!', '#ffffff')
      return
    }
    // SHOVELIST's groove bonus: dazed (dancing) enemies take extra damage
    let move = m
    if (a.isPlayer && t.stunT > 0 && (a as Player).hero.dazeBonus) {
      move = { ...m, damage: Math.round(m.damage * (a as Player).hero.dazeBonus!) }
      this.fx.popup(t.x, t.y - 106, 'GROOVE!', '#c46bff')
    }
    const down = takeHit(t, a, move)
    if (t.isPlayer) (t as Player).calmT = 0
    const heavy = !!m.heavy || down
    audio.hit(heavy)
    if (a.isPlayer && a.state === 'special' && (a as Player).hero.specialFx === 'ram') this.fx.ramHit(t.x - a.facing * 4, t.y, a.facing)
    this.fx.spark(t.x - t.facing * 6, t.y, t.z + 50, heavy)
    this.fx.hitGag(t.x, t.y, t.z + 53, a.facing, heavy)
    if (m.stun && !down) {
      t.stunT = Math.round(m.stun * ((t as Enemy).isBoss ? 0.35 : 1))
      t.statue = !!m.statue
      if (m.statue) this.fx.popup(t.x, t.y - 97 - (t.id % 3) * 9, `${2 + Math.floor(Math.random() * 98)}.000 €`, '#f2c14e')
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
      this.player.specialCd = Math.max(0, this.player.specialCd - (move.damage * 5) / SPECIAL_SLOWDOWN)
      this.player.score += Math.round(move.damage * 10 * this.multiplier())
      if (e.hp <= 0) {
        const pts = ENEMY_TYPES[e.kind].score
        this.player.score += pts
        this.fx.popup(e.x, e.y - 92, `+${pts}`)
        if (!e.isBoss && Math.random() < this.level.dropChance) this.fx.drop(this.level.loot[Math.floor(Math.random() * this.level.loot.length)], e.x, e.y)
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
        this.fx.spark(e.x, e.y, 46, down)
        this.fx.hitGag(e.x, e.y, 53, dir, down)
        audio.hit(down)
        this.freeze = HITSTOP
        this.lastFoe = e
        this.lastFoeT = 180
        this.countHit()
        this.player.score += Math.round(pr.damage * 10 * this.multiplier())
        this.player.specialCd = Math.max(0, this.player.specialCd - (pr.damage * 5) / SPECIAL_SLOWDOWN)
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
        this.fx.spark(o.x, o.y, 46, true)
        this.fx.hitGag(o.x, o.y, 53, pusher.facing, true)
        this.fx.popup(o.x, o.y - 106, 'DOMINO!', '#ffe14a')
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
    if (e.t === 1 && m.say) {
      this.fx.popup(e.x, e.y - 106, m.say, '#ffffff')
      // a voice for the shout: deep for the movers and the inspector, high for the singer's duo
      const pitch = { couch: 115, inspector: 105, busker: 190, bouncer: 85 }[e.kind as string] ?? 150
      audio.shout(m.say.split(/[ ,]+/).filter(Boolean).length, pitch)
    }
    // PROST PAULE: one swing in three goes nowhere
    if (e.t === 1) {
      e.whiff = m.fx === 'stagger' && Math.random() < 0.35
      if (e.whiff) this.fx.popup(e.x, e.y - 100, 'HICKS!', '#ffd0a0')
    }
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
          this.fx.popup(p.x, p.y - 97, '*COUGH*', '#b8f0b0')
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
      case 'ticket': {
        audio.click()
        const near = Math.abs(p.x - e.x) < 50 && Math.abs(p.y - e.y) < 14 && Math.sign(p.x - e.x) === e.facing
        if (!near || p.state === 'down' || p.state === 'dead' || p.z > 0) break
        if (p.ticketT > 0) {
          this.fx.popup(p.x, p.y - 100, 'HAB ICH!', '#7dff5a')
          break
        }
        // no ticket: frozen on the spot, and it costs you
        p.frozenT = 80
        p.score = Math.max(0, p.score - 60)
        this.fx.popup(p.x, p.y - 30, '-60 EURO', '#ff7a7a')
        break
      }
      case 'stagger':
        if (e.whiff) {
          e.vx += e.facing * 2 // swings into thin air and stumbles past
          audio.whoosh()
        } else audio.swing()
        break
      case 'sofa':
        this.shake = Math.max(this.shake, 6)
        this.fx.dust(front, e.y, true)
        audio.thud()
        audio.boing()
        break
      case 'chord':
        audio.riff()
        this.fx.gust(front, e.y, e.facing)
        this.fx.gust(front + e.facing * 26, e.y - 4, e.facing)
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
    if (b.kind === 'speaker') audio.flash()
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
      if (it.ticket) p.ticketT = 1500
      if (it.score) p.score += it.score
      this.fx.popup(p.x, p.y - 92, it.hp ? `+${it.hp} ${it.label}` : `+${it.label}`, it.score ? '#ffe14a' : '#7dff5a')
      audio.pickup()
    }
  }

  private updateCamera() {
    if (this.waveActive) return
    const target = this.player.x - 150
    const next = this.waves[this.waveIdx]
    const end = Math.min(this.stage!.len - VIEW_W, this.cleared ? this.stage!.exit.x - 60 : Infinity)
    const limit = next ? next.cam : end
    // never scrolls back, like the arcade classics
    this.camX = Math.max(this.camX, Math.min(limit, end, this.camX + Math.max(0, (target - this.camX) * 0.12)))
  }

  // ------------------------------------------------------------ render
  private render() {
    const ctx = this.ctx
    ctx.setTransform(RES, 0, 0, RES, 0, 0)
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
    const playing = this.scene !== 'title' && this.scene !== 'select' && this.scene !== 'levels'
    const all: Fighter[] = playing ? [this.player, ...this.enemies] : []
    const split = this.stage.split
    const behind = all.filter((f) => f.y < split && !(f.isPlayer && this.exitT > 50)).sort((a, b) => a.y - b.y)
    for (const f of behind) {
      ctx.save()
      if (f.isPlayer && this.exitT) ctx.globalAlpha = Math.max(0, 1 - this.exitT / 50)
      drawFighter(ctx, f, cam)
      ctx.restore()
    }
    this.stage.drawFront(ctx, cam)
    // fighters and street props share one depth order
    const front: { y: number; draw: () => void }[] = all
      .filter((f) => f.y >= split && !(f.isPlayer && this.exitT > 50))
      .map((f) => ({
        y: f.y,
        draw: () => {
          // walking through the exit door: the hero fades into the doorway
          const fade = f.isPlayer && this.exitT ? Math.max(0, 1 - this.exitT / 50) : 1
          ctx.save()
          ctx.globalAlpha = fade
          this.drawOne(ctx, f, cam)
          ctx.restore()
        },
      }))
    if (playing) for (const b of this.props) front.push({ y: b.y, draw: () => drawBreakable(ctx, b, cam) })
    if (playing) {
      const bsheet = this.level.bystanders ? sheet(this.level.bystanders.sheet) : null
      for (const b of this.bystanders)
        front.push({
          y: b.y,
          draw: () => {
            if (!bsheet) return
            const shakeX = b.flinch > 0 ? (b.flinch % 4 < 2 ? 2 : -2) : 0
            ctx.fillStyle = 'rgba(8,6,16,0.35)'
            ctx.fillRect(Math.round(b.x - cam) - 10, Math.round(b.y), 20, 2)
            const fr = (b.flinch > 0 ? 'q' : Math.floor((this.tick + b.phase) / 50) % 2 ? 'q' : 'p') + b.look
            drawFrame(ctx, bsheet, fr, b.x - cam + shakeX, b.y, b.flip ? -1 : 1)
          },
        })
    }
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
    ctx.setTransform(RES, 0, 0, RES, 0, 0)

    const t = this.sceneT
    switch (this.scene) {
      case 'title':
        dim(ctx, 0.55)
        drawLogo(ctx, this.tick)
        drawText(ctx, 'A BERLIN BEAT-EM-UP', VIEW_W >> 1, 112, { align: 'center', color: '#9aa2c4', outline: '#14101c' })
        if (this.showControls) {
          this.drawControls(ctx)
          return
        }
        this.drawMenu(ctx, 136)
        if (t < 400 || Math.floor(t / 25) % 2 === 0)
          drawText(ctx, this.cb.touch ? 'STICK UP/DOWN CHOOSE   HIT OK' : 'UP/DOWN CHOOSE   ENTER OR X OK   (CLICK THE GAME FIRST)', VIEW_W >> 1, 196, { align: 'center', color: '#c8ccdc', outline: '#14101c' })
        return
      case 'levels':
        this.drawLevels(ctx, t)
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
        const inSide = !!this.stage.inSide
        if (this.scene === 'play' && !inSide && !this.waveActive && this.waveIdx > 0 && this.waveIdx < this.waves.length) drawGo(ctx, this.tick)
        // doors to walk through: the exit, the side room's door from the street, the way back out
        if (this.scene === 'play' && !this.exitT && !this.trans) {
          const side = this.stage.side
          if (this.exitOpen && !inSide) this.drawDoorArrow(ctx, this.stage.exit.x - this.camX, this.stage.exit.label, '#7dff5a')
          if (side && !inSide && this.sideState === 'none' && !this.waveActive) this.drawDoorArrow(ctx, side.door - this.camX, `${side.label}?`, '#ffe14a')
          if (side && inSide && this.sideState === 'clear') this.drawDoorArrow(ctx, side.doorScreenX, 'RAUS', '#7dff5a')
        }
        if (this.trans) this.drawWipe(ctx, this.trans.t)
        if (this.scene === 'play' && t < 150 && this.waveIdx === 0)
          drawBanner(ctx, [{ text: `LEVEL ${this.levelIdx + 1}`, scale: 2, color: '#ffe14a' }, { text: this.level.name, scale: 3, color: '#ffffff' }], 70)
        if (this.scene === 'paused') {
          dim(ctx, 0.6)
          drawBanner(ctx, [{ text: 'PAUSE', scale: 3, color: '#ffffff' }], 46)
          this.drawMenu(ctx, 90)
        }
        if (this.scene === 'gameover') {
          dim(ctx, Math.min(0.6, t / 60))
          drawBanner(ctx, this.level.lose.map((text) => ({ text, scale: 3, color: '#ff3a5a' })), 52)
          if (t > 60) this.drawMenu(ctx, 124)
        }
        if (this.scene === 'win') {
          dim(ctx, Math.min(0.55, t / 60))
          drawBanner(
            ctx,
            [
              ...this.level.win.map((text) => ({ text, scale: 3, color: '#7dff5a' })),
              { text: `SCORE ${this.player.score}`, scale: 2, color: '#ffe14a' },
            ],
            44,
          )
          if (t > 60) this.drawMenu(ctx, 140)
        }
      }
    }
  }

  /** a bouncing arrow and a label over a door the hero can walk through */
  private drawDoorArrow(ctx: CanvasRenderingContext2D, sx: number, label: string, color: string) {
    if (sx < -10 || sx > VIEW_W + 10 || Math.floor(this.tick / 15) % 3 === 2) return
    const x = Math.round(sx)
    const y = band.top - 64 + Math.round(Math.sin(this.tick / 6) * 3)
    ctx.fillStyle = '#14101c'
    ctx.fillRect(x - 7, y - 1, 15, 9)
    ctx.fillStyle = color
    for (let i = 0; i < 6; i++) ctx.fillRect(x - 6 + i, y + i, 13 - 2 * i, 1)
    drawText(ctx, label, x, y - 12, { align: 'center', color, outline: '#14101c' })
  }

  /** the circle wipe around the hero (closing until frame 22, then opening) */
  private drawWipe(ctx: CanvasRenderingContext2D, t: number) {
    const k = t < 22 ? 1 - t / 22 : (t - 22) / 22
    const r = Math.max(0, 300 * k * k)
    const x = this.player.x - this.camX
    const y = this.player.y - 40
    ctx.save()
    ctx.fillStyle = '#06040e'
    ctx.beginPath()
    ctx.rect(0, 0, VIEW_W, VIEW_H)
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill('evenodd')
    ctx.restore()
  }

  /** LEVEL SELECT: one card per level, a picture, the name, and a lock on levels not reached yet */
  private drawLevels(ctx: CanvasRenderingContext2D, t: number) {
    drawBerlinMap(ctx, t)
    drawText(ctx, 'CHOOSE YOUR NIGHT', VIEW_W >> 1, 6, { scale: 2, align: 'center', color: '#ffe14a', outline: '#14101c', shadow: '#14101c' })
    const open = unlockedCount()
    // the night's route, pin to pin
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    LEVELS.forEach((lv, i) => {
      const s = SPOTS[lv.id]
      if (i) ctx.lineTo(s.x, s.y - 4)
      else ctx.moveTo(s.x, s.y - 4)
    })
    ctx.stroke()
    ctx.setLineDash([])
    LEVELS.forEach((lv, i) => {
      const s = SPOTS[lv.id]
      drawPin(ctx, s.x, s.y, i + 1, s.color, i === this.levelIdx, i >= open, t)
    })
    // the hero walks from pin to pin
    const h = HEROES[this.heroId]
    const w = this.mapWalker
    const moving = Math.hypot(w.tx - w.x, w.ty - w.y) > 0.5
    const walk = h.anim.walk ?? h.anim.idle
    const fr = moving ? walk[Math.floor(t / 6) % walk.length] : h.anim.idle[Math.floor(t / h.anim.idleRate) % h.anim.idle.length]
    drawFrame(ctx, sheet(h.sheet), fr, w.x - 15, w.y - 2, w.facing, { scale: 0.34 })

    // the card of the chosen level
    const lv = this.level
    const spot = SPOTS[lv.id]
    const locked = this.levelIdx >= open
    const cx = 278
    const cy = 34
    const cw = 100
    ctx.fillStyle = spot.color
    ctx.fillRect(cx - 2, cy - 2, cw + 4, 160)
    ctx.fillStyle = '#14101c'
    ctx.fillRect(cx, cy, cw, 156)
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx + 2, cy + 2, cw - 4, 56)
    ctx.clip()
    this.stage?.drawPreview(ctx, cx + 2, cy + 2, cw - 4, 56)
    if (locked) {
      ctx.fillStyle = 'rgba(10,8,20,0.75)'
      ctx.fillRect(cx + 2, cy + 2, cw - 4, 56)
    }
    ctx.restore()
    let y = cy + 64
    drawText(ctx, `LEVEL ${this.levelIdx + 1}`, cx + cw / 2, y, { align: 'center', color: spot.color, outline: '#14101c' })
    y += 12
    for (const line of wrap(locked ? '???' : lv.name, 15)) {
      drawText(ctx, line, cx + cw / 2, y, { align: 'center', color: '#ffffff', outline: '#14101c' })
      y += 10
    }
    y += 2
    for (const line of wrap(spot.area, 15)) {
      drawText(ctx, line, cx + cw / 2, y, { align: 'center', color: '#9aa2c4', outline: '#14101c' })
      y += 10
    }
    drawText(ctx, lv.when, cx + cw / 2, y + 2, { align: 'center', color: '#5af0ff', outline: '#14101c' })
    if (locked) drawText(ctx, 'LOCKED', cx + cw / 2, cy + 26, { align: 'center', color: '#9aa2c4', outline: '#14101c' })
    else if (Math.floor(t / 20) % 2 === 0) drawText(ctx, this.cb.touch ? 'TAP: GO!' : 'ENTER: GO!', cx + cw / 2, cy + 142, { align: 'center', color: '#ffe14a', outline: '#14101c' })
    drawText(ctx, this.cb.touch ? 'TAP A PIN OR < >' : '< > OR CLICK A PIN     ESC  BACK', 140, 206, { align: 'center', color: '#c8ccdc', outline: '#14101c' })
  }

  /** CONTROLS page of the main menu */
  private drawControls(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(26,20,40,0.9)'
    ctx.fillRect(36, 122, VIEW_W - 72, 88)
    const rows: [string, string][] = [
      ['ARROWS / WASD', 'MOVE'],
      ['X', 'HIT - KEEP HITTING FOR A COMBO'],
      ['C / SPACE', 'JUMP - JUMP + X ATTACKS IN THE AIR'],
      ['V', 'SPECIAL MOVE (WHEN THE BAR IS FULL)'],
      ['TAP TWICE', 'RUN - X WHILE RUNNING: DASH ATTACK'],
      ['ESC / P', 'PAUSE MENU      M  SOUND ON/OFF'],
    ]
    rows.forEach(([k, v], i) => {
      drawText(ctx, k, 46, 130 + i * 11, { color: '#ffe14a', outline: '#14101c' })
      drawText(ctx, v, 128, 130 + i * 11, { color: '#ffffff', outline: '#14101c' })
    })
    if (Math.floor(this.sceneT / 25) % 2 === 0) drawText(ctx, 'ENTER: BACK', VIEW_W >> 1, 200, { align: 'center', color: '#9aa2c4', outline: '#14101c' })
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
    if (!f.isPlayer && f.state === 'down' && f.hp > 0) drawStars(ctx, f.x - cam - f.facing * 25, f.y - 16, this.tick)
    if (f.stunT > 0) drawStars(ctx, f.x - cam, f.y - 90, this.tick)
    // frozen by a ticket inspector: a blinking "?!" and a hint to mash
    if (p && p.frozenT > 0 && Math.floor(this.tick / 6) % 2 === 0) drawText(ctx, '?!', p.x - cam, p.y - 104, { align: 'center', color: '#ff7a7a', outline: '#14101c' })
  }
}

/** splits a name into lines of at most `n` characters, at spaces */
function wrap(text: string, n: number): string[] {
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1]
    if (last !== undefined && last.length + 1 + word.length <= n) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}
