import { useRef } from 'react'
import type { Action, Input } from '../game/input'
import type { Scene } from '../game/Game'

const DIRS: Action[] = ['left', 'right', 'up', 'down']

/** Virtual stick on the left, three buttons on the right, start/pause on top. */
export function TouchControls({ input, scene }: { input: Input; scene: Scene }) {
  const pad = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)

  const setStick = (dx: number, dy: number) => {
    const dead = 12
    input.setVirtual('left', dx < -dead)
    input.setVirtual('right', dx > dead)
    input.setVirtual('up', dy < -dead)
    input.setVirtual('down', dy > dead)
    if (knob.current) {
      const len = Math.min(34, Math.hypot(dx, dy))
      const a = Math.atan2(dy, dx)
      knob.current.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`
    }
  }

  const onStick = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect()
    setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
  }

  const release = () => {
    DIRS.forEach((d) => input.setVirtual(d, false))
    if (knob.current) knob.current.style.transform = ''
  }

  const btn = (a: Action, label: string, cls: string) => (
    <div
      className={`tbtn ${cls}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        input.setVirtual(a, true)
      }}
      onPointerUp={() => input.setVirtual(a, false)}
      onPointerCancel={() => input.setVirtual(a, false)}
    >
      {label}
    </div>
  )

  const menu = scene !== 'play'
  return (
    <div className="touch-controls">
      <div
        className="stick"
        ref={pad}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onStick(e)
        }}
        onPointerMove={(e) => e.buttons && onStick(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="knob" ref={knob} />
      </div>
      {/* in menus HIT confirms, so the only top button needed is PAUSE during a fight */}
      <div className="mid">{!menu && btn('pause', 'PAUSE', 'small')}</div>
      <div className="buttons">
        {btn('special', 'SPEC', 'special')}
        {btn('jump', 'JUMP', 'jump')}
        {btn('attack', 'HIT', 'attack')}
      </div>
    </div>
  )
}
