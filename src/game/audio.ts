/**
 * All sound is synthesised (no audio files yet): a muffled techno kick
 * coming through the club walls, louder and brighter as you near the door,
 * plus simple hit / swing / KO effects.
 */
class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private clubFilter: BiquadFilterNode | null = null
  private clubGain: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer = 0
  private nextBeat = 0
  private beat = 0
  muted = false
  /** 0..1, set by the game from the player's distance to the door */
  closeness = 0
  /** time of the last kick, for visuals pulsing on the beat */
  lastKickAt = 0
  /** what plays in the background: the club through the walls, or a train on the rails */
  mode: 'club' | 'train' = 'club'
  /** 0..1, how fast the train runs (rail clacks and rumble) */
  trainSpeed = 0
  private rumble: GainNode | null = null
  private nextClack = 0

  start() {
    if (this.ctx) return
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.6
    this.master.connect(ctx.destination)
    this.clubFilter = ctx.createBiquadFilter()
    this.clubFilter.type = 'lowpass'
    this.clubFilter.frequency.value = 180
    this.clubGain = ctx.createGain()
    this.clubGain.gain.value = 0.5
    this.clubFilter.connect(this.clubGain).connect(this.master)
    const len = ctx.sampleRate
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.nextBeat = ctx.currentTime + 0.1
    this.timer = window.setInterval(() => this.schedule(), 50)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05)
  }

  /** beat phase 0..1 (1 right on the kick), for pulsing lights */
  pulse() {
    if (!this.ctx) return 0
    const since = this.ctx.currentTime - this.lastKickAt
    return Math.max(0, 1 - since / 0.3)
  }

  private schedule() {
    const ctx = this.ctx!
    if (this.mode === 'train') {
      this.scheduleTrain()
      return
    }
    if (this.rumble) this.rumble.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
    const spb = 60 / 132
    const k = this.closeness
    this.clubFilter!.frequency.setTargetAtTime(160 + k * k * 2400, ctx.currentTime, 0.3)
    this.clubGain!.gain.setTargetAtTime(0.35 + k * 0.5, ctx.currentTime, 0.3)
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const t = this.nextBeat
      this.kick(t)
      if (this.beat % 2 === 1) this.hat(t, 0.05)
      this.hat(t + spb / 2, 0.08)
      if (this.beat % 4 === 2) this.clap(t)
      window.setTimeout(() => (this.lastKickAt = t), Math.max(0, (t - ctx.currentTime) * 1000))
      this.nextBeat += spb
      this.beat++
    }
  }

  /** the night train: a low rumble and the clack-clack of the rail joints, faster with speed */
  private scheduleTrain() {
    const ctx = this.ctx!
    if (!this.rumble) {
      const s = ctx.createBufferSource()
      s.buffer = this.noise
      s.loop = true
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 220
      this.rumble = ctx.createGain()
      this.rumble.gain.value = 0
      s.connect(f).connect(this.rumble).connect(this.master!)
      s.start()
    }
    const v = this.trainSpeed
    this.rumble.gain.setTargetAtTime(0.05 + v * 0.22, ctx.currentTime, 0.3)
    this.nextBeat = ctx.currentTime + 0.1 // keeps the club beat from bursting out when it comes back
    if (v < 0.15) return
    if (this.nextClack < ctx.currentTime) this.nextClack = ctx.currentTime + 0.05
    while (this.nextClack < ctx.currentTime + 0.2) {
      const t = this.nextClack
      this.clack(t, 0.35 * v)
      this.clack(t + 0.12, 0.28 * v)
      this.nextClack += 0.9 / Math.max(0.3, v)
    }
  }

  private clack(t: number, vol: number) {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
    s.connect(f).connect(g).connect(this.master!)
    s.start(t)
    s.stop(t + 0.08)
  }

  /** brakes squealing into a station */
  brake() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(1900, t)
    o.frequency.linearRampToValueAtTime(1500, t + 1.6)
    f.type = 'bandpass'
    f.frequency.value = 1800
    f.Q.value = 8
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.3)
    g.gain.setValueAtTime(0.08, t + 1.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    o.connect(f).connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 1.85)
  }

  /** the two-tone chime before the doors close */
  chime() {
    this.tone(784, 0, 0.28, 0.18)
    this.tone(622, 0.3, 0.45, 0.18)
  }

  /** pneumatic hiss of the doors opening or closing */
  doors() {
    this.burst(2600, 0.7, 0.18, 0.45, 'highpass')
  }

  /** the buskers: an original bluesy accordion lick (minor pentatonic with the blue note) */
  riff() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime
    const notes = [57, 60, 62, 63, 64, 67, 64, 69] // A3 C4 D4 Eb4 E4 G4 E4 A4
    notes.forEach((n, i) => {
      const t = t0 + i * 0.1 + (i % 2) * 0.03 // a little shuffle
      const f = 440 * Math.pow(2, (n - 69) / 12)
      const g = ctx.createGain()
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1800
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      lp.connect(g).connect(this.master!)
      for (const d of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = d // two reeds slightly apart: an accordion's wobble
        o.connect(lp)
        o.start(t)
        o.stop(t + 0.18)
      }
    })
  }

  private tone(freq: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime + at
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private kick(t: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(120, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    g.gain.setValueAtTime(1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    o.connect(g).connect(this.clubFilter!)
    o.start(t)
    o.stop(t + 0.4)
  }

  private hat(t: number, vol: number) {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    s.connect(f).connect(g).connect(this.clubFilter!)
    s.start(t)
    s.stop(t + 0.06)
  }

  private clap(t: number) {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1500
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.25, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
    s.connect(f).connect(g).connect(this.clubFilter!)
    s.start(t)
    s.stop(t + 0.16)
  }

  private burst(freq: number, q: number, vol: number, dur: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    s.playbackRate.value = 0.7 + Math.random() * 0.6
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    s.connect(f).connect(g).connect(this.master)
    s.start(t)
    s.stop(t + dur + 0.02)
  }

  private thump(from: number, to: number, vol: number, dur: number) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(from, t)
    o.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  swing() {
    this.burst(900, 1.2, 0.18, 0.12)
  }
  hit(heavy = false) {
    this.burst(heavy ? 600 : 1200, 0.9, heavy ? 0.7 : 0.5, heavy ? 0.18 : 0.1)
    this.thump(heavy ? 160 : 220, 50, heavy ? 0.8 : 0.5, 0.12)
  }
  thud() {
    this.thump(110, 35, 0.9, 0.25)
    this.burst(300, 0.7, 0.4, 0.2, 'lowpass')
  }
  special() {
    this.burst(400, 0.5, 0.6, 0.5, 'lowpass')
    this.thump(80, 200, 0.4, 0.4)
  }
  /** PSYCHEDELIC RAVE: a sitar phrase over a tanpura drone, with a few tabla strokes */
  sitar() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const out = ctx.createGain()
    out.gain.value = 0.9
    out.connect(this.master)
    // tanpura drone: Sa and Pa, softly filtered, swelling in and out
    const drone = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    drone.gain.setValueAtTime(0.0001, t)
    drone.gain.exponentialRampToValueAtTime(0.05, t + 0.15)
    drone.gain.setValueAtTime(0.05, t + 1.3)
    drone.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    lp.connect(drone).connect(out)
    for (const f of [130.81, 196, 261.63]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = (Math.random() - 0.5) * 8
      o.connect(lp)
      o.start(t)
      o.stop(t + 1.85)
    }
    // the sitar's buzzing bridge: a soft clipper after a resonant band-pass
    const buzz = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1
      curve[i] = Math.tanh(x * 4)
    }
    buzz.curve = curve
    const sitarOut = ctx.createGain()
    sitarOut.gain.value = 0.5
    buzz.connect(sitarOut).connect(out)
    // a phrase in raga Bhairav (Sa re Ga ma Pa dha Ni), some notes sliding up into place
    const phrase: [number, number, boolean][] = [
      [0, 0.0, false], [1, 0.12, true], [4, 0.24, false], [5, 0.36, true], [7, 0.5, false],
      [8, 0.62, true], [7, 0.74, false], [5, 0.86, false], [4, 1.0, true], [1, 1.12, false], [0, 1.26, true],
    ]
    for (const [semi, at, slide] of phrase) {
      const f = 261.63 * Math.pow(2, semi / 12)
      const s = t + at
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(slide ? f * Math.pow(2, -1.5 / 12) : f, s)
      if (slide) o.frequency.exponentialRampToValueAtTime(f, s + 0.06)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f * 3
      bp.Q.value = 5
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, s)
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.004)
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.4)
      o.connect(bp).connect(g).connect(buzz)
      o.start(s)
      o.stop(s + 0.42)
    }
    // tabla: the bass drum's pitch bends up, a dry tap on top
    for (const at of [0, 0.5, 0.74, 1.0]) {
      const s = t + at
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(85, s)
      o.frequency.exponentialRampToValueAtTime(140, s + 0.12)
      g.gain.setValueAtTime(0.35, s)
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.25)
      o.connect(g).connect(out)
      o.start(s)
      o.stop(s + 0.27)
    }
    window.setTimeout(() => out.disconnect(), 2000)
  }
  /** BAD BAD SCHWEIN's dance step: a deep, round "bum" */
  bum() {
    this.thump(78, 40, 1, 0.32)
    this.burst(160, 0.6, 0.3, 0.16, 'lowpass')
  }
  /** a quick rising arpeggio */
  music() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    ;[0, 4, 7, 12, 16, 19, 24, 19, 16, 12].forEach((semi, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = i % 2 ? 'sawtooth' : 'square'
      o.frequency.value = 220 * Math.pow(2, semi / 12)
      const s = t + i * 0.07
      g.gain.setValueAtTime(0.09, s)
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.12)
      o.connect(g).connect(this.master!)
      o.start(s)
      o.stop(s + 0.14)
    })
  }
  /** vape exhale */
  hiss() {
    this.burst(5000, 0.6, 0.25, 0.6, 'highpass')
  }
  /** fan gust */
  whoosh() {
    this.burst(700, 0.8, 0.45, 0.35)
    this.burst(1400, 1.2, 0.25, 0.25)
  }
  /** camera shutter / door clicker */
  click() {
    this.burst(3000, 3, 0.4, 0.03)
    window.setTimeout(() => this.burst(2200, 3, 0.3, 0.03), 60)
  }
  /** bubble-gum pop */
  pop() {
    this.thump(900, 200, 0.4, 0.06)
    this.burst(2000, 2, 0.2, 0.04)
  }
  flash() {
    this.burst(4000, 0.8, 0.35, 0.08, 'highpass')
    this.burst(1800, 2, 0.2, 0.25)
  }
  pickup() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    ;[660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = f
      g.gain.setValueAtTime(0.12, t + i * 0.07)
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.08)
      o.connect(g).connect(this.master!)
      o.start(t + i * 0.07)
      o.stop(t + i * 0.07 + 0.1)
    })
  }

  stop() {
    window.clearInterval(this.timer)
    this.ctx?.close()
    this.ctx = null
  }
}

export const audio = new Audio()
