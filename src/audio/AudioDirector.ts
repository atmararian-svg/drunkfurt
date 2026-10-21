import revEngineUrl from '../assets/audio/aggressive-supercar-engine.mp3?url';
import doorOpenUrl from '../assets/audio/door-open.mp3?url';
import engineDefaultUrl from '../assets/audio/engine-default.mp3?url';
import engineStartUrl from '../assets/audio/engine-start.mp3?url';
import exhalesUrl from '../assets/audio/exhales.mp3?url';
import hitsUrl from '../assets/audio/hits.mp3?url';
import gearShiftUrl from '../assets/audio/gear-shift.mp3?url';
import wheelsUrl from '../assets/audio/wheels.mp3?url';

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
  // the station at night: no recording in the project yet; until one is set here (a seamless loop of
  // a large station hall at night), stationBed() synthesises it
  stationAmbience: { src: null, bus: 'ambience', loop: true, gain: 0.6 },
  trainIdleHum: { src: null, bus: 'ambience', loop: true, gain: 0.35 },
  footstepPlatform: { src: null, bus: 'sfx', gain: 0.5 },
  stepDown: { src: null, bus: 'sfx', gain: 0.7 },
  // the fight in Episode 02: the two supplied recordings, each holding two sounds: the hits ("Удары",
  // the block and the punch) and the exhales ("Выдохи"); each sound is played as its own slice of
  // its file (FIGHT_SLICES), so each lands exactly on its hit
  fightHits: { src: hitsUrl, bus: 'body', gain: 1 },
  fightExhales: { src: exhalesUrl, bus: 'body', gain: 0.85 },
  // the knockout's sounds are synthesised until a recording is set here
  fightKnockout: { src: null, bus: 'body', gain: 1 },
  fightRing: { src: null, bus: 'body', gain: 0.6 },
  fightFall: { src: null, bus: 'body', gain: 0.9 },
  // the getaway (episode 3): the supplied recordings. The rev sequence on the spot is the one
  // recording aggressive-supercar-engine (four throttle blips; see REV_SLICES); the launch plays
  // the wheels (tyres breaking traction) and the gear-shift recording from 3.00 s into the file.
  revEngine: { src: revEngineUrl, bus: 'body', gain: 0.9 },
  wheels: { src: wheelsUrl, bus: 'body', gain: 0.8 },
  gearShift: { src: gearShiftUrl, bus: 'body', gain: 0.95 },
  // the driver's door opening, the engine starting, and the engine idling (the supplied recordings):
  // engineStart plays once at the ignition; when it has played through, engineIdle takes over and
  // runs, seamlessly looped, whenever the engine is on and nobody is on the throttle
  carDoorOpen: { src: doorOpenUrl, bus: 'sfx', gain: 0.85 },
  engineStart: { src: engineStartUrl, bus: 'body', gain: 0.85 },
  engineIdle: { src: engineDefaultUrl, bus: 'body', gain: 0.75 },
  // still synthesised until a recording is set here: carUnlock (central locking, two clacks),
  // carDoorClose (a heavy, damped shut), and engineLoop: a seamless loop of the engine recorded at
  // ENGINE_LOOP_RPM under load, pitched by rpm (playbackRate = rpm / ENGINE_LOOP_RPM).
  carUnlock: { src: null, bus: 'sfx', gain: 0.7 },
  carDoorClose: { src: null, bus: 'sfx', gain: 0.9 },
  engineLoop: { src: null, bus: 'body', loop: true, gain: 0.8 },
} satisfies Record<string, CueDef>;

export type CueId = keyof typeof cues;

/**
 * Where each fight sound is in its recording (seconds): the slice played, its transient (the
 * moment of contact, or the breath's onset), and a level, so the two hits sit together (the first
 * is recorded much quieter). Every slice is started so that its transient falls LEAD seconds after
 * the cue, so a hit and its exhale, cued together, land together.
 */
const FIGHT_SLICES = {
  block: { cue: 'fightHits', from: 0.88, to: 1.12, at: 0.925, level: 3.2 },
  punch: { cue: 'fightHits', from: 1.12, to: 1.58, at: 1.165, level: 0.85 },
  exhale1: { cue: 'fightExhales', from: 0.82, to: 1.12, at: 0.87, level: 0.9 },
  exhale2: { cue: 'fightExhales', from: 1.12, to: 1.73, at: 1.15, level: 0.9 },
} as const;
const FIGHT_LEAD = 0.03;

/**
 * The rev sequence from aggressive-supercar-engine (9.0 s, 48 kHz): four
 * throttle blips whose rises begin at about 0.62, 1.80, 2.70 and 3.85 s of the
 * file (the revs peak at 1.30, 2.25, 3.35 and 4.30 s). Each blip is played as
 * its own slice, started on its press (0, 1, 2, 3 s into the sequence), so the
 * sound keeps exact time with the presses and the needle; neighbouring slices
 * overlap by REV_XFADE. The last runs on into the launch, which fades it.
 */
const REV_SLICES = [0.62, 1.8, 2.7, 3.85];
const REV_XFADE = 0.08;
/** The rpm the engineLoop recording (if one is supplied) was made at. */
export const ENGINE_LOOP_RPM = 3000;

/**
 * The bytes of an audio file. A data URL (the single-file build, where every
 * asset is inlined) is decoded in memory: a page with a strict content policy
 * refuses to fetch even its own data URLs. Any other URL is fetched.
 */
async function bytesOf(src: string): Promise<ArrayBuffer> {
  if (src.startsWith('data:')) {
    const raw = atob(src.slice(src.indexOf(',') + 1));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${res.status} for ${src}`);
  return res.arrayBuffer();
}

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
          this.buffers.set(id, await ctx.decodeAudioData(await bytesOf(src)));
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

  // -------------------------------------------------------------------------
  // the station at night (chapter 1)

  private station: { out: GainNode; stop: () => void } | null = null;

  /**
   * The night station's sound, restrained: the air of a big glass hall (two
   * bands of soft noise, slowly breathing), the mains hum of its lights (50 Hz
   * and its harmonics, very quiet), and now and then, far off and smeared by
   * the hall's echo, the station gong and an announcement nobody could make
   * out (band-passed voice-like noise, syllable-paced), or a train's air
   * brakes sighing on another platform. A recorded loop set as
   * `stationAmbience` is used instead when present. Idempotent; `level`
   * fades it in and out.
   */
  stationBed(level: number, seconds = 1.5) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.station) this.station = this.buffers.has('stationAmbience') ? this.recordedStation() : this.synthStation();
    this.station.out.gain.setTargetAtTime(level, ctx.currentTime, seconds / 3);
  }

  /** The station's sound is faded out and released (the chapter is left). */
  stationStop(seconds = 1.2) {
    const ctx = this.ctx;
    const st = this.station;
    if (!ctx || !st) return;
    this.station = null;
    st.out.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
    window.setTimeout(() => st.stop(), seconds * 1000 + 300);
  }

  private recordedStation() {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.buses.get('ambience')!);
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get('stationAmbience')!;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = (cues.stationAmbience as CueDef).gain ?? 1;
    src.connect(g).connect(out);
    src.start();
    return { out, stop: () => src.stop() };
  }

  private synthStation() {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.buses.get('ambience')!);
    const nodes: AudioScheduledSourceNode[] = [];
    // the hall's echo: a long, dark impulse response (3.5 s), for the distant events
    const len = Math.floor(ctx.sampleRate * 3.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const hall = ctx.createConvolver();
    hall.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2400;
    hall.connect(dark).connect(wet).connect(out);
    // the air: a low roar and a faint high wash, each slowly breathing
    const air = (type: BiquadFilterType, f: number, q: number, level: number, rate: number) => {
      const n = this.noiseSource(true);
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = level * 0.3;
      lfo.connect(depth).connect(g.gain);
      n.connect(flt).connect(g).connect(out);
      n.start();
      lfo.start();
      nodes.push(n, lfo);
    };
    air('lowpass', 260, 0.7, 0.32, 0.05);
    air('bandpass', 1900, 0.6, 0.018, 0.031);
    // the lights' mains hum
    [50, 100, 150].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = [0.012, 0.007, 0.003][i];
      o.connect(g).connect(out);
      o.start();
      nodes.push(o);
    });
    // distant events, now and then, into the hall's echo
    let timer = 0;
    let alive = true;
    const gong = (t: number) => {
      // the station gong: three soft bell tones, falling
      [659.3, 523.3, 392].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        const at = t + i * 0.42;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.045, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
        o.connect(g).connect(hall);
        o.start(at);
        o.stop(at + 1.7);
      });
    };
    const announcement = (t: number, seconds: number) => {
      // a voice through a tannoy, too far to understand: noise shaped by two formants, syllable-paced
      const n = this.noiseSource(true);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 650;
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1500;
      f2.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      // syllables: an uneven 4–6 per second, in phrases
      for (let x = 0; x < seconds; x += 0.12 + Math.random() * 0.12) {
        const pause = Math.random() < 0.08;
        g.gain.linearRampToValueAtTime(pause ? 0 : 0.05 + Math.random() * 0.05, t + x + 0.04);
        f1.frequency.linearRampToValueAtTime(500 + Math.random() * 350, t + x + 0.05);
        f2.frequency.linearRampToValueAtTime(1200 + Math.random() * 700, t + x + 0.05);
      }
      g.gain.linearRampToValueAtTime(0, t + seconds + 0.1);
      n.connect(f1).connect(g);
      n.connect(f2).connect(g);
      g.connect(hall);
      n.start(t);
      n.stop(t + seconds + 0.3);
    };
    const brakes = (t: number) => {
      // air brakes on a far platform: a long sigh of filtered noise
      const n = this.noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.4);
      n.connect(f).connect(g).connect(hall);
      n.start(t);
      n.stop(t + 2.6);
    };
    const next = (first = false) => {
      if (!alive) return;
      timer = window.setTimeout(() => {
        if (!alive) return;
        const t = ctx.currentTime + 0.05;
        const r = Math.random();
        if (r < 0.45) {
          gong(t);
          announcement(t + 1.6, 4 + Math.random() * 3);
        } else if (r < 0.75) brakes(t);
        else announcement(t, 2.5 + Math.random() * 2);
        next();
      }, (first ? 2.5 : 14 + Math.random() * 16) * 1000);
    };
    next(true);
    return {
      out,
      stop: () => {
        alive = false;
        window.clearTimeout(timer);
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            // already stopped
          }
        }
        out.disconnect();
      },
    };
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
    const ctx = this.ctx;
    if (!ctx) return;
    if (kind === 'exhale1' || kind === 'exhale2' || kind === 'block' || kind === 'punch') {
      if (this.playSlice(kind)) return;
    } else if (this.play(({ ko: 'fightKnockout', ring: 'fightRing', fall: 'fightFall' } as const)[kind])) return;
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

  /** One fight sound from its recording (a slice of the file, its transient FIGHT_LEAD s from now); false if not loaded. */
  private playSlice(kind: keyof typeof FIGHT_SLICES) {
    const ctx = this.ctx!;
    const sl = FIGHT_SLICES[kind];
    const buffer = this.buffers.get(sl.cue);
    if (!buffer) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const start = Math.max(sl.from, sl.at - FIGHT_LEAD);
    const level = ((cues[sl.cue] as CueDef).gain ?? 1) * sl.level;
    // a 6 ms fade in (the slice starts mid-file) and a short fade at its end
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.setValueAtTime(level, t + (sl.to - start) - 0.03);
    g.gain.linearRampToValueAtTime(0, t + (sl.to - start));
    src.connect(g).connect(this.buses.get('body')!);
    src.start(t, start, sl.to - start + 0.01);
    return true;
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
    if (!ctx) return;
    const rec = this.buffers.has('engineStart') ? this.play('engineStart') : null;
    if (rec) {
      // an idle already running (the frame's order) gives way: it comes back when the start has played
      this.idle(false);
      this.starter = rec;
      this.starterEnds = ctx.currentTime + rec.buffer!.duration;
      rec.onended = () => {
        if (this.starter === rec) this.starter = null;
      };
      return;
    }
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


  // -------------------------------------------------------------------------
  // the engine's own recordings: the start, then the idle

  private starter: AudioBufferSourceNode | null = null;
  private starterEnds = 0;
  private idleState: { out: GainNode; next: number; parts: AudioBufferSourceNode[] } | null = null;

  /** The idle recording is decoded (otherwise the synthesised engine stands in for it). */
  get hasIdle() {
    return this.buffers.has('engineIdle');
  }

  /**
   * The engine idling, the engineIdle recording: called every frame with whether it should sound
   * (engine on, no throttle, no launch). It starts only once engineStart has played through, and
   * loops without a seam: the file is laid end to end in overlapping copies, each faded in and
   * out over 80 ms, scheduled half a second ahead. Off, it fades out over a quarter second.
   */
  idle(on: boolean) {
    const ctx = this.ctx;
    const buffer = this.buffers.get('engineIdle');
    if (!ctx || !buffer || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (!on) {
      if (!this.idleState) return;
      const st = this.idleState;
      this.idleState = null;
      st.out.gain.cancelScheduledValues(t);
      st.out.gain.setValueAtTime(st.out.gain.value, t);
      st.out.gain.linearRampToValueAtTime(0, t + 0.25);
      for (const p of st.parts) {
        try {
          p.stop(t + 0.3);
        } catch {
          // already stopped
        }
      }
      return;
    }
    if (!this.idleState) {
      // after the starter (a moment's overlap, so there is no gap), or now
      const at = Math.max(t, this.starter ? this.starterEnds - 0.08 : t);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime((cues.engineIdle as CueDef).gain ?? 1, at + (this.starter ? 0.08 : 0.25));
      out.connect(this.buses.get('body')!);
      this.idleState = { out, next: at, parts: [] };
    }
    const st = this.idleState;
    const TRIM = 0.03;
    const FADE = 0.08;
    const length = buffer.duration - 2 * TRIM - FADE;
    while (st.next < t + 0.5) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      const a = st.next;
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(1, a + FADE);
      g.gain.setValueAtTime(1, a + length);
      g.gain.linearRampToValueAtTime(0, a + length + FADE);
      src.connect(g).connect(st.out);
      src.start(a, TRIM);
      src.stop(a + length + FADE + 0.01);
      src.onended = () => {
        st.parts = st.parts.filter((p) => p !== src);
      };
      st.parts.push(src);
      st.next = a + length;
    }
  }

  /** The engine is off (the scroll went back before the ignition, or the scene ended): the starter and the idle stop. */
  engineOff() {
    if (!this.ctx) return;
    this.idle(false);
    if (this.starter) {
      try {
        this.starter.stop(this.ctx.currentTime + 0.05);
      } catch {
        // already stopped
      }
      this.starter = null;
    }
  }

  // -------------------------------------------------------------------------
  // the getaway's recordings

  private revNodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  private launch: { src: AudioBufferSourceNode; gain: GainNode }[] = [];

  /** Is the recording for this cue decoded and ready? */
  has(id: CueId) {
    return this.buffers.has(id);
  }

  private fadeOut(node: { src: AudioBufferSourceNode; gain: GainNode }, seconds: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.setValueAtTime(node.gain.gain.value, t);
    node.gain.gain.linearRampToValueAtTime(0, t + seconds);
    try {
      node.src.stop(t + seconds + 0.02);
    } catch {
      // already stopped
    }
  }

  /**
   * The rev sequence's sound, once per sequence: the four slices of
   * aggressive-supercar-engine scheduled on the audio clock at 0, 1, 2 and 3 s
   * from now (REV_SLICES). Returns false when the recording is not ready; the
   * sequence and the launch run regardless.
   */
  revSequence() {
    const ctx = this.ctx;
    const buffer = this.buffers.get('revEngine');
    if (!ctx || ctx.state !== 'running' || !buffer) return false;
    this.revStop(0.05);
    const t0 = ctx.currentTime + 0.01;
    const level = (cues.revEngine as CueDef).gain ?? 1;
    REV_SLICES.forEach((from, i) => {
      const last = i === REV_SLICES.length - 1;
      const at = t0 + i;
      // each slice runs to the next press (plus the crossfade); the last on into the launch
      const length = last ? Math.min(2.4, buffer.duration - from) : 1 + REV_XFADE;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + (i === 0 ? 0.02 : REV_XFADE));
      gain.gain.setValueAtTime(level, at + length - REV_XFADE);
      gain.gain.linearRampToValueAtTime(0, at + length);
      src.connect(gain).connect(this.buses.get('body')!);
      src.start(at, Math.max(0, from - (i === 0 ? 0 : REV_XFADE / 2)), length + 0.02);
      const node = { src, gain };
      src.onended = () => {
        this.revNodes = this.revNodes.filter((n) => n !== node);
      };
      this.revNodes.push(node);
    });
    return true;
  }

  /** The rev sequence's sound fades out (cancelled, or the launch takes over). */
  revStop(seconds = 0.3) {
    if (!this.ctx) return;
    for (const n of this.revNodes) this.fadeOut(n, seconds);
    this.revNodes = [];
  }

  /** The rev sequence's sound is playing (the idle stays out of its way). */
  get revving() {
    return this.revNodes.length > 0;
  }

  /**
   * The launch, once: the wheels (tyres breaking traction) and the gear-shift
   * recording from `offset` seconds into the file. `late` is how long ago the
   * launch actually began (if the sound starts after it), so the recording is
   * started further in and its gear changes stay on the launch's own clock.
   * Never throws, never waits: if a recording is not ready it is skipped.
   */
  launchStart(offset: number, late = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.launch.length) return false;
    // the revs hand over to the launch's own recordings
    this.revStop(0.4);
    const t = ctx.currentTime;
    for (const [id, from] of [['wheels', 0], ['gearShift', offset]] as [CueId, number][]) {
      const buffer = this.buffers.get(id);
      if (!buffer) continue;
      const at = from + late;
      if (at >= buffer.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime((cues[id] as CueDef).gain ?? 1, t);
      src.connect(gain).connect(this.buses.get('body')!);
      src.start(t, at);
      this.launch.push({ src, gain });
    }
    return this.launch.length > 0;
  }

  /** The scene is over (or was rewound): the launch's recordings and any rev fade out. */
  carStop(seconds = 0.6) {
    if (!this.ctx) return;
    for (const n of this.launch) this.fadeOut(n, seconds);
    this.launch = [];
    this.revStop(Math.min(seconds, 0.3));
  }

  /** The launch's recordings are playing. */
  get launching() {
    return this.launch.length > 0;
  }
}

export const audio = new AudioDirector();
