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
  // the fight in Episode 02: drop recordings into /public/audio and set src; until then they are synthesised
  fightExhale1: { src: null, bus: 'body', gain: 0.9 },
  fightExhale2: { src: null, bus: 'body', gain: 0.9 },
  fightBlock: { src: null, bus: 'body', gain: 1 },
  fightPunch: { src: null, bus: 'body', gain: 1 },
  fightKnockout: { src: null, bus: 'body', gain: 1 },
  fightRing: { src: null, bus: 'body', gain: 0.6 },
  fightFall: { src: null, bus: 'body', gain: 0.9 },
  // the getaway (episode 3). Each is synthesised until a recording is set here:
  // carUnlock (central locking, two clacks), carDoorOpen, carDoorClose (a heavy, damped shut),
  // engineStart (starter and catch, ~1 s), and engineLoop: a seamless loop of the engine
  // recorded at ENGINE_LOOP_RPM under load; it is pitched by rpm (playbackRate = rpm / ENGINE_LOOP_RPM).
  carUnlock: { src: null, bus: 'sfx', gain: 0.7 },
  carDoorOpen: { src: null, bus: 'sfx', gain: 0.8 },
  carDoorClose: { src: null, bus: 'sfx', gain: 0.9 },
  engineStart: { src: null, bus: 'body', gain: 0.9 },
  engineLoop: { src: null, bus: 'body', loop: true, gain: 0.8 },
} satisfies Record<string, CueDef>;

export type CueId = keyof typeof cues;
/** The rpm the engineLoop recording (if one is supplied) was made at. */
export const ENGINE_LOOP_RPM = 3000;

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

  /**
   * The fight's four sounds. A recording is used when one is loaded for the cue;
   * otherwise each is synthesised, and the four are deliberately different:
   *  - exhale1: a short, sharp boxer's exhale ("tss") as the guard comes up;
   *  - block:   forearm taking a fist: a dull, bony knock with a cloth slap;
   *  - exhale2: a heavier, lower exhale ("hhf") behind the counter-punch;
   *  - punch:   knuckles on a jaw: a hard crack with a deep body thump.
   */
  fight(kind: 'exhale1' | 'exhale2' | 'block' | 'punch' | 'ko' | 'ring' | 'fall') {
    const cue = ({ exhale1: 'fightExhale1', exhale2: 'fightExhale2', block: 'fightBlock', punch: 'fightPunch', ko: 'fightKnockout', ring: 'fightRing', fall: 'fightFall' } as const)[kind];
    if (this.play(cue)) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.buses.get('body')!;
    const noiseHit = (type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, at = 0) => {
      const n = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(peak, t + at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + attack + decay);
      n.connect(f).connect(g).connect(out);
      n.start(t + at);
      n.stop(t + at + attack + decay + 0.05);
    };
    const tone = (type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number, at = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + attack + decay);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(peak, t + at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + attack + decay);
      o.connect(lp).connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + attack + decay + 0.05);
    };
    if (kind === 'exhale1') {
      // air forced through the teeth: bright, breathy, very short
      noiseHit('bandpass', 2600, 1.4, 0.55, 0.008, 0.13);
      noiseHit('bandpass', 1200, 0.8, 0.25, 0.01, 0.09);
    } else if (kind === 'exhale2') {
      // heavier: chest voice under the breath, lower and a little longer
      noiseHit('bandpass', 1500, 1.0, 0.6, 0.012, 0.17);
      tone('sawtooth', 150, 105, 0.16, 0.015, 0.16);
    } else if (kind === 'block') {
      // bone and sleeve: mid knock, cloth slap, little low end
      tone('sine', 190, 90, 0.75, 0.004, 0.16);
      noiseHit('bandpass', 2200, 0.7, 0.5, 0.002, 0.05);
      noiseHit('lowpass', 500, 0.7, 0.4, 0.003, 0.09);
    } else if (kind === 'ko') {
      // his fist on your face, from the inside: a dull, enormous thud, low and close, little crack
      tone('sine', 85, 30, 0.9, 0.004, 0.6);
      noiseHit('lowpass', 420, 0.8, 0.7, 0.003, 0.25);
      noiseHit('bandpass', 1800, 0.9, 0.25, 0.002, 0.04);
    } else if (kind === 'ring') {
      // the ringing in your ears afterwards: a thin, high tone that slowly fades
      const o = ctx.createOscillator();
      o.frequency.value = 3150;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 3.3);
    } else if (kind === 'fall') {
      // you hit the pavement: a soft, heavy body thump
      tone('sine', 70, 38, 0.6, 0.01, 0.3);
      noiseHit('lowpass', 300, 0.7, 0.45, 0.006, 0.2);
    } else {
      // the counter lands: sharp crack on top, deep thump underneath, a short tail
      noiseHit('highpass', 2400, 0.7, 0.55, 0.002, 0.06);
      tone('sine', 120, 42, 0.62, 0.006, 0.38);
      noiseHit('lowpass', 800, 0.7, 0.35, 0.004, 0.16, 0.01);
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

  // -------------------------------------------------------------------------
  // the car

  private engineVoice: { gain: GainNode; set: (rpm: number, load: number) => void; stop: () => void } | null = null;

  /** A short mechanical transient: band-passed noise (a latch, a lock). */
  private clack(t: number, freq: number, level: number, length = 0.04, out = this.buses.get('body')!) {
    const ctx = this.ctx!;
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    n.stop(t + length + 0.05);
  }

  /** A low, damped thump (a door shutting, a body settling). */
  private thump(t: number, from: number, to: number, level: number, length: number, out = this.buses.get('body')!) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  /** The car recognises you: the central locking clacks twice. */
  carUnlock() {
    if (!this.ctx || this.play('carUnlock')) return;
    const t = this.ctx.currentTime;
    this.clack(t, 1400, 0.35, 0.05);
    this.clack(t + 0.11, 1250, 0.3, 0.05);
    this.thump(t, 140, 70, 0.12, 0.12);
  }

  /** The driver's door: the latch lets go and the seal parts. */
  carDoor(open: boolean) {
    if (!this.ctx || this.play(open ? 'carDoorOpen' : 'carDoorClose')) return;
    const t = this.ctx.currentTime;
    if (open) {
      this.clack(t, 2200, 0.4, 0.03);
      this.clack(t + 0.05, 900, 0.18, 0.12);
      this.thump(t + 0.03, 120, 80, 0.15, 0.18);
    } else {
      // a heavy, damped shut: the body takes it, then the latch
      this.thump(t, 95, 42, 0.85, 0.32);
      this.clack(t, 500, 0.5, 0.09);
      this.clack(t + 0.035, 2600, 0.25, 0.025);
    }
  }

  /** The starter turns it over, then the engine catches (the engine voice takes over from there). */
  engineStart() {
    const ctx = this.ctx;
    if (!ctx || this.play('engineStart')) return;
    const t = ctx.currentTime;
    const out = this.buses.get('body')!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.linearRampToValueAtTime(230, t + 0.55);
    // the starter's chug: the compression strokes, about 12 a second
    const chug = ctx.createGain();
    chug.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 12;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(chug.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.setValueAtTime(0.16, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(chug).connect(lp).connect(g).connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.75);
    lfo.stop(t + 0.75);
  }

  /**
   * The engine, one continuous voice whose pitch and timbre follow the rpm:
   * a four-cylinder fires twice a revolution, so the fundamental is rpm/30 Hz,
   * with the half order for the uneven beat and band-passed noise for the
   * intake. `load` (0..1) opens it up when you are on the throttle. Calling it
   * every frame only moves the parameters; rpm 0 fades the voice out and stops
   * it. With an engineLoop recording, the recording is pitched instead.
   */
  engine(rpm: number, load: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (rpm <= 0) {
      this.engineVoice?.stop();
      this.engineVoice = null;
      return;
    }
    if (!this.engineVoice) this.engineVoice = this.buffers.has('engineLoop') ? this.recordedEngine() : this.synthEngine();
    this.engineVoice.set(rpm, load);
  }

  private recordedEngine() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get('engineLoop')!;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain).connect(this.buses.get('body')!);
    src.start();
    return {
      gain,
      set: (rpm: number, load: number) => {
        const t = ctx.currentTime;
        src.playbackRate.setTargetAtTime(Math.max(0.2, rpm / ENGINE_LOOP_RPM), t, 0.04);
        gain.gain.setTargetAtTime((cues.engineLoop.gain ?? 1) * (0.35 + 0.65 * load), t, 0.06);
      },
      stop: () => {
        gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
        src.stop(ctx.currentTime + 0.6);
      },
    };
  }

  private synthEngine() {
    const ctx = this.ctx!;
    const out = this.buses.get('body')!;
    const fire = ctx.createOscillator();
    fire.type = 'sawtooth';
    const half = ctx.createOscillator();
    half.type = 'sawtooth';
    const halfGain = ctx.createGain();
    halfGain.gain.value = 0.45;
    const intake = this.noiseSource(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    const mix = ctx.createGain();
    // a touch of saturation, as an exhaust has
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(2.2 * x);
    }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    fire.connect(mix);
    half.connect(halfGain).connect(mix);
    intake.connect(bp).connect(intakeGain).connect(mix);
    mix.connect(shaper).connect(lp).connect(gain).connect(out);
    fire.start();
    half.start();
    intake.start();
    return {
      gain,
      set: (rpm: number, load: number) => {
        const t = ctx.currentTime;
        const f = rpm / 30;
        fire.frequency.setTargetAtTime(f, t, 0.03);
        half.frequency.setTargetAtTime(f / 2, t, 0.03);
        bp.frequency.setTargetAtTime(f * 6, t, 0.05);
        intakeGain.gain.setTargetAtTime(0.08 + 0.35 * load, t, 0.05);
        lp.frequency.setTargetAtTime(220 + rpm * 0.32 + load * 900, t, 0.05);
        gain.gain.setTargetAtTime(0.07 + 0.11 * load + 0.04 * (rpm / 6000), t, 0.06);
      },
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.setTargetAtTime(0.0001, t, 0.12);
        for (const n of [fire, half, intake]) n.stop(t + 0.7);
      },
    };
  }

}

export const audio = new AudioDirector();
