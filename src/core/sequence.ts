import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp, easeInOutCubic } from './math';

/**
 * Scripted camera shots. A shot is a list of keyframes sampled over time; the
 * first-person rig hands camera control to the active shot and takes it back
 * when the shot finishes. Scenes define their own shots (see scenes/<id>/shots.ts).
 */
export interface CameraKey {
  /** Normalised time 0..1 within the shot. */
  t: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  roll?: number;
}

export interface CameraShot {
  id: string;
  duration: number;
  keys: CameraKey[];
  /** Global easing applied to shot time before sampling keys. */
  ease?: (t: number) => number;
}

export interface CameraPose {
  position: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class ShotPlayer {
  private shot: CameraShot | null = null;
  private curve: CatmullRomCurve3 | null = null;
  private elapsed = 0;
  private onDone: (() => void) | null = null;

  get active() {
    return this.shot !== null;
  }

  play(shot: CameraShot, onDone?: () => void) {
    if (this.shot) return false; // never overlap shots
    this.shot = shot;
    this.curve = new CatmullRomCurve3(
      shot.keys.map((k) => new Vector3(...k.pos)),
      false,
      'centripetal',
    );
    this.elapsed = 0;
    this.onDone = onDone ?? null;
    return true;
  }

  /** Advances the shot and writes the sampled pose. Returns false when inactive. */
  update(dt: number, out: CameraPose) {
    const shot = this.shot;
    if (!shot || !this.curve) return false;
    this.elapsed += dt;
    const raw = clamp(this.elapsed / shot.duration, 0, 1);
    const t = (shot.ease ?? easeInOutCubic)(raw);

    // Locate the segment, then sample position and angles with Catmull-Rom so
    // velocity stays continuous through every key.
    const keys = shot.keys;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const local = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    this.curve.getPoint((i + local) / (keys.length - 1), out.position);
    const k = (j: number) => keys[clamp(j, 0, keys.length - 1)];
    const angle = (get: (c: CameraKey) => number) =>
      catmullRom(get(k(i - 1)), get(a), get(b), get(k(i + 2)), local);
    out.yaw = angle((c) => c.yaw);
    out.pitch = angle((c) => c.pitch);
    out.roll = angle((c) => c.roll ?? 0);

    if (raw >= 1) {
      const done = this.onDone;
      this.shot = null;
      this.curve = null;
      this.onDone = null;
      done?.();
    }
    return true;
  }
}
