// Procedural sound for the galleries, synthesized with WebAudio (no audio
// files): footsteps, the marble rolling and hitting things, gravity shifts,
// button clicks, the solve chime, the door, failure, and a quiet room tone.
// Audio can only start after a user gesture, so call unlock() from one.

export class Sound {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private rollGain: GainNode | undefined;
  private rollFilter: BiquadFilterNode | undefined;
  private whooshGain: GainNode | undefined;
  private whooshFilter: BiquadFilterNode | undefined;
  private rumbleGain: GainNode | undefined;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Creates and resumes the audio context. Safe to call on every gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, reused by every noisy sound.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;

    // Room tone: very quiet low rumble.
    const tone = this.loop(noise);
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 180;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.025;
    tone.connect(toneFilter).connect(toneGain).connect(this.master);

    // Rolling marble: band-limited noise whose level follows the ball.
    const roll = this.loop(noise);
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = "bandpass";
    this.rollFilter.frequency.value = 220;
    this.rollFilter.Q.value = 0.8;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);

    // Pendulum swoosh: air rushing as the bob passes.
    const whoosh = this.loop(noise);
    this.whooshFilter = ctx.createBiquadFilter();
    this.whooshFilter.type = "bandpass";
    this.whooshFilter.Q.value = 0.6;
    this.whooshFilter.frequency.value = 500;
    this.whooshGain = ctx.createGain();
    this.whooshGain.gain.value = 0;
    whoosh.connect(this.whooshFilter).connect(this.whooshGain).connect(this.master);

    // The building rumbling as a swing gets dangerous.
    const rumble = this.loop(noise);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 90;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(rumbleFilter).connect(this.rumbleGain).connect(this.master);
  }

  /** 0..1: how fast the pendulum bob is moving. */
  setWhoosh(level: number): void {
    if (!this.ctx || !this.whooshGain || !this.whooshFilter) return;
    const t = this.ctx.currentTime;
    const l = Math.min(1, Math.max(0, level));
    this.whooshGain.gain.setTargetAtTime(l * l * 0.18, t, 0.05);
    this.whooshFilter.frequency.setTargetAtTime(300 + l * 900, t, 0.08);
  }

  /** 0..1: how hard the building is shaking. */
  setRumble(level: number): void {
    if (!this.ctx || !this.rumbleGain) return;
    this.rumbleGain.gain.setTargetAtTime(Math.min(1, Math.max(0, level)) * 0.6, this.ctx.currentTime, 0.2);
  }

  /** A struck brass bell. */
  bell(freq: number): void {
    for (const [ratio, gain, decay] of [
      [1, 0.2, 3.2],
      [2.0, 0.08, 2.2],
      [2.76, 0.06, 1.6],
      [5.4, 0.025, 0.8],
    ] as [number, number, number][]) {
      this.tone({ freq: freq * ratio, gain, attack: 0.003, decay });
    }
  }

  /** Glass breaking. */
  shatter(): void {
    this.burst({ type: "highpass", freq: 3000, q: 0.5, gain: 0.45, attack: 0.002, decay: 0.5 });
    this.burst({ type: "bandpass", freq: 5200, q: 3, gain: 0.25, attack: 0.002, decay: 0.9 });
    for (let i = 0; i < 6; i++) this.tone({ freq: 2500 + Math.random() * 3500, gain: 0.04, attack: 0.001, decay: 0.15, delay: Math.random() * 0.4 });
  }

  /** Freezes all sound (the game is paused). */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** 0..1: how loudly the marble is rolling right now. */
  setRolling(level: number): void {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(1, level) * 0.35, t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(160 + level * 260, t, 0.1);
  }

  footstep(): void {
    this.burst({ type: "bandpass", freq: 380 + Math.random() * 120, q: 1.4, gain: 0.12, attack: 0.004, decay: 0.09 });
    this.burst({ type: "lowpass", freq: 140, q: 0.7, gain: 0.1, attack: 0.002, decay: 0.06 });
  }

  /** `strength` 0..1. */
  impact(strength: number): void {
    const s = Math.min(1, strength);
    this.burst({ type: "lowpass", freq: 300 + s * 500, q: 0.9, gain: 0.15 + s * 0.45, attack: 0.002, decay: 0.12 + s * 0.2 });
    this.tone({ freq: 90 + s * 40, endFreq: 50, gain: 0.25 * s, attack: 0.003, decay: 0.25 });
  }

  click(): void {
    this.tone({ freq: 1800, endFreq: 1200, gain: 0.08, attack: 0.001, decay: 0.03, type: "square" });
    this.burst({ type: "highpass", freq: 2500, q: 0.7, gain: 0.06, attack: 0.001, decay: 0.025 });
  }

  /** A deep sweep and a rush of air: "down" just moved. */
  gravityShift(): void {
    this.tone({ freq: 70, endFreq: 38, gain: 0.35, attack: 0.05, decay: 1.4 });
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    filter.frequency.exponentialRampToValueAtTime(400, t + 1.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
  }

  /** Three bell notes, rising. */
  solved(): void {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      this.tone({ freq: f, gain: 0.16, attack: 0.005, decay: 1.6, delay: i * 0.16 });
      this.tone({ freq: f * 2.76, gain: 0.04, attack: 0.005, decay: 0.6, delay: i * 0.16 }); // bell partial
    });
  }

  /** Stone grinding as the door sinks. */
  door(): void {
    this.burst({ type: "lowpass", freq: 120, q: 1.5, gain: 0.35, attack: 0.2, decay: 1.4 });
  }

  failed(): void {
    this.tone({ freq: 330, endFreq: 165, gain: 0.12, attack: 0.01, decay: 0.9, type: "triangle" });
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  private burst(o: { type: BiquadFilterType; freq: number; q: number; gain: number; attack: number; decay: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(o.gain, t + o.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.attack + o.decay);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.attack + o.decay + 0.05);
  }

  private tone(o: {
    freq: number;
    endFreq?: number;
    gain: number;
    attack: number;
    decay: number;
    delay?: number;
    type?: OscillatorType;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t + o.attack + o.decay);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(o.gain, t + o.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.attack + o.decay);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + o.attack + o.decay + 0.05);
  }
}
