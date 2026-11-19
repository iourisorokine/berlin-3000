import { useEffect, useRef, useState } from 'react'
import { audio } from './game/audio'
import { VIEW_H, VIEW_W } from './game/constants'
import { Game, type Scene } from './game/Game'
import { TouchControls } from './ui/TouchControls'
import { screenScale } from './ui/screenScale'

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [scene, setScene] = useState<Scene>('loading')
  const [muted, setMuted] = useState(false)
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight })
  const touch = isTouch()

  // React only hosts the canvas, the scaling and the touch buttons; the game runs itself.
  useEffect(() => {
    const game = new Game(canvasRef.current!, { onScene: setScene })
    gameRef.current = game
    game.start()
    return () => {
      game.dispose()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight })
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') setMuted((m) => !m)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => audio.setMuted(muted), [muted])

  const scale = screenScale(VIEW_W, VIEW_H, win.w, win.h, touch ? 150 : 40)

  return (
    // a click gives the page keyboard focus (it runs inside a frame) and unlocks audio
    <div className={`app ${touch ? 'touch' : ''}`} onPointerDown={() => { window.focus(); audio.start() }}>
      <div className="screen-wrap" style={{ width: VIEW_W * scale, height: VIEW_H * scale }}>
        <canvas ref={canvasRef} className="screen" width={VIEW_W} height={VIEW_H} style={{ width: VIEW_W * scale, height: VIEW_H * scale }} />
        <button className="mute" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Sound on' : 'Sound off'}>
          {muted ? 'SOUND OFF' : 'SOUND ON'}
        </button>
      </div>
      {touch && gameRef.current && <TouchControls input={gameRef.current.input} scene={scene} />}
      {!touch && <p className="hint">Arrows / WASD move · X hit · C or Space jump · V special · Esc pause · M mute</p>}
    </div>
  )
}
