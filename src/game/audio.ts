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
  /** SHOVEL RAVE: a quick rising arpeggio over the club kick */
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
