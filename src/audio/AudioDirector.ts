/**
 * Audio foundation. No sound assets ship yet, so nothing is audible: cues are
 * declared with `src: null` and silently skipped until real recordings are added
 * to /public/audio and referenced here.
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

  /** For the time-dilation scene: 20000 = open, ~400 = heavily muffled. */
  setWorldMuffle(cutoffHz: number, seconds = 0.6) {
    if (!this.ctx || !this.worldFilter) return;
    this.worldFilter.frequency.setTargetAtTime(cutoffHz, this.ctx.currentTime, seconds / 3);
  }
}

export const audio = new AudioDirector();
