/**
 * Audio foundation. Recorded cues are declared with `src: null` and silently
 * skipped until real recordings are added to /public/audio. Until then the city
 * uses a few procedurally synthesised sounds (ambience, passing cars, impacts,
 * heartbeat), built from filtered noise and oscillators; see the "synth" section.
 *
 * Signal graph (prepared for later scenes):
 *   cue sources -> bus (ambience | sfx | body | music) -> world filter -> master -> out
 * The world filter is a low-pass that the time-dilation scene will sweep down to
 * muffle the city, while the "body" bus (breathing, heartbeat) bypasses it.
 */
export type Bus = 'ambience' | 'sfx' | 'body' | 'music';

interface CueDef {
  src: string | null;
  bus: Bus;
  loop?: boolean;
  gain?: number;
}

/** Planned cues for the station. Fill `src` once licensed/recorded assets exist. */
export const cues = {
  stationAmbience: { src: null, bus: 'ambience', loop: true, gain: 0.6 },
  trainIdleHum: { src: null, bus: 'ambience', loop: true, gain: 0.35 },
  footstepPlatform: { src: null, bus: 'sfx', gain: 0.5 },
  stepDown: { src: null, bus: 'sfx', gain: 0.7 },
} satisfies Record<string, CueDef>;

export type CueId = keyof typeof cues;

class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private worldFilter: BiquadFilterNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private buffers = new Map<CueId, AudioBuffer>();

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);
    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 20000;
    this.worldFilter.connect(this.master);
    (['ambience', 'sfx', 'music'] as Bus[]).forEach((b) => {
      const g = ctx.createGain();
      g.connect(this.worldFilter!);
      this.buses.set(b, g);
    });
    const body = ctx.createGain();
    body.connect(this.master);
    this.buses.set('body', body);
    void this.preload();
  }

  private async preload() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.keys(cues) as CueId[]).map(async (id) => {
        const src = (cues[id] as CueDef).src;
        if (!src) return;
        try {
          const res = await fetch(src);
          this.buffers.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch (err) {
          console.warn(`[audio] could not load cue "${id}"`, err);
        }
      }),
    );
  }

  /** Plays a cue if its asset is available; otherwise does nothing. */
  play(id: CueId) {
    const ctx = this.ctx;
    const buffer = this.buffers.get(id);
    if (!ctx || !buffer) return null;
    const def = cues[id] as CueDef;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!def.loop;
    const g = ctx.createGain();
    g.gain.value = def.gain ?? 1;
    src.connect(g).connect(this.buses.get(def.bus)!);
    src.start();
    return src;
  }

  /** Mutes or unmutes everything (the visitor's sound preference). */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.15);
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // -------------------------------------------------------------------------
  // synth: procedural sounds for scenes without recorded assets

  private enabled = true;
  private noise: AudioBuffer | null = null;
  private ambience: GainNode | null = null;
  private heart: number | null = null;

  private noiseBuffer() {
    const ctx = this.ctx!;
    if (this.noise) return this.noise;
    const len = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    return b;
  }

  private noiseSource(loop = false) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = loop;
    return src;
  }

  /** Distant city: a low, slightly uneven rumble with a faint hiss on top. Idempotent. */
  startCityAmbience() {
    const ctx = this.ctx;
    if (!ctx || this.ambience) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.buses.get('ambience')!);
    const rumble = this.noiseSource(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const rg = ctx.createGain();
    rg.gain.value = 0.55;
    rumble.connect(lp).connect(rg).connect(out);
    const hiss = this.noiseSource(true);
    hiss.playbackRate.value = 0.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.6;
    const hg = ctx.createGain();
    hg.gain.value = 0.025;
    hiss.connect(bp).connect(hg).connect(out);
    // slow swell, like traffic two streets away
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.18;
    lfo.connect(lg).connect(rg.gain);
    rumble.start();
    hiss.start(ctx.currentTime + 0.37);
    lfo.start();
    this.ambience = out;
  }

  /** 0..1 loudness of the city bed (ramped). */
  setAmbience(level: number, seconds = 1.2) {
    if (!this.ctx || !this.ambience) return;
    this.ambience.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, seconds / 3);
  }

  /** A car passing: tyre noise rising and falling, panned from one side to the other. */
  carPass(fromPan: number, toPan: number, seconds = 4, level = 0.35) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.linearRampToValueAtTime(950, t + seconds * 0.5);
    bp.frequency.linearRampToValueAtTime(360, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + seconds * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(fromPan, t);
    pan.pan.linearRampToValueAtTime(toPan, t + seconds);
    src.connect(bp).connect(g).connect(pan).connect(this.buses.get('sfx')!);
    src.start(t);
    src.stop(t + seconds + 0.1);
  }

  /**
   * Impacts, deliberately two different sounds: 1 is a dull body thud (low sine
   * drop plus a muffled transient), 2 a sharp crack (bright noise snap plus a
   * short knock). They bypass the muffling so they cut through the slow motion.
   */
  impact(kind: 1 | 2) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.buses.get('body')!;
    if (kind === 1) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.5);
      const n = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.6, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(lp).connect(ng).connect(out);
      n.start(t);
      n.stop(t + 0.2);
    } else {
      const n = this.noiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1600;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.75, t + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      n.connect(hp).connect(ng).connect(out);
      n.start(t);
      n.stop(t + 0.15);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** A slow, quiet heartbeat while time is stretched; level 0 stops it. */
  setHeartbeat(level: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (level <= 0.01) {
      if (this.heart !== null) window.clearInterval(this.heart);
      this.heart = null;
      return;
    }
    if (this.heart !== null) return;
    const beat = () => {
      const t = ctx.currentTime;
      for (const [dt, a] of [[0, 1], [0.24, 0.6]] as const) {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(58, t + dt);
        osc.frequency.exponentialRampToValueAtTime(40, t + dt + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.32 * a, t + dt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
        osc.connect(g).connect(this.buses.get('body')!);
        osc.start(t + dt);
        osc.stop(t + dt + 0.25);
      }
    };
    beat();
    this.heart = window.setInterval(beat, 1400);
  }

  /** For the time-dilation scene: 20000 = open, ~400 = heavily muffled. */
  setWorldMuffle(cutoffHz: number, seconds = 0.6) {
    if (!this.ctx || !this.worldFilter) return;
    this.worldFilter.frequency.setTargetAtTime(cutoffHz, this.ctx.currentTime, seconds / 3);
  }
}

export const audio = new AudioDirector();
