export type Action = 'left' | 'right' | 'up' | 'down' | 'attack' | 'jump' | 'special' | 'start' | 'pause'

const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'start', 'pause']

// X / C / V sit at the same place on QWERTY, QWERTZ and AZERTY keyboards.
const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyX: 'attack',
  KeyJ: 'attack',
  KeyC: 'jump',
  KeyK: 'jump',
  Space: 'jump',
  KeyV: 'special',
  KeyL: 'special',
  Enter: 'start',
  Escape: 'pause',
  KeyP: 'pause',
}

/**
 * Merges keyboard, gamepad and on-screen touch buttons into one set of
 * actions. `held` = down now; `pressed` = went down since the last frame.
 */
export class Input {
  held: Record<Action, boolean> = Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>
  pressed: Record<Action, boolean> = { ...this.held }
  private keys = new Set<Action>()
  private virtual = new Set<Action>()
  private prev = new Set<Action>()
  /** keys that went down since the last poll (catches taps shorter than a frame) */
  private taps = new Set<Action>()
  /** any key/touch at all, so audio can start after a user gesture */
  onFirstInput: (() => void) | null = null

  constructor() {
    window.addEventListener('keydown', this.down)
    window.addEventListener('keyup', this.up)
    window.addEventListener('blur', this.clear)
  }

  dispose() {
    window.removeEventListener('keydown', this.down)
    window.removeEventListener('keyup', this.up)
    window.removeEventListener('blur', this.clear)
  }

  setVirtual(a: Action, on: boolean) {
    if (on) {
      if (!this.virtual.has(a)) this.taps.add(a)
      this.virtual.add(a)
      this.fireFirst()
    } else this.virtual.delete(a)
  }

  /** Call once per game frame, before reading held/pressed. */
  poll() {
    const now = new Set<Action>([...this.keys, ...this.virtual])
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      const b = (i: number) => !!pad.buttons[i]?.pressed
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      if (ax < -0.4 || b(14)) now.add('left')
      if (ax > 0.4 || b(15)) now.add('right')
      if (ay < -0.4 || b(12)) now.add('up')
      if (ay > 0.4 || b(13)) now.add('down')
      if (b(2)) now.add('attack')
      if (b(0)) now.add('jump')
      if (b(3) || b(1)) now.add('special')
      if (b(9)) now.add('start')
      if (b(8)) now.add('pause')
    }
    for (const a of ACTIONS) {
      this.held[a] = now.has(a) || this.taps.has(a)
      this.pressed[a] = (now.has(a) && !this.prev.has(a)) || this.taps.has(a)
    }
    this.prev = new Set([...now, ...this.taps])
    this.taps.clear()
  }

  private fireFirst() {
    if (this.onFirstInput) {
      this.onFirstInput()
      this.onFirstInput = null
    }
  }

  private down = (e: KeyboardEvent) => {
    const a = KEYS[e.code]
    if (e.code === 'KeyM') return
    if (!a) return
    e.preventDefault()
    if (!e.repeat) this.taps.add(a)
    this.keys.add(a)
    this.fireFirst()
  }

  private up = (e: KeyboardEvent) => {
    const a = KEYS[e.code]
    if (a) this.keys.delete(a)
  }

  private clear = () => {
    this.keys.clear()
    this.virtual.clear()
  }
}
