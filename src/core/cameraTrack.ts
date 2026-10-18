import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp } from './math';
import type { CameraKey, CameraPose } from './sequence';

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * A composed camera path: keyframes at normalised positions 0..1, sampled with
 * Catmull-Rom so velocity stays continuous through every key. Used both for
 * scroll-driven episode tracks and time-driven shots.
 */
export class CameraTrack {
  private curve: CatmullRomCurve3;
  constructor(readonly keys: CameraKey[]) {
    this.curve = new CatmullRomCurve3(keys.map((k) => new Vector3(...k.pos)), false, 'centripetal');
  }

  sample(t: number, out: CameraPose) {
    const keys = this.keys;
    t = clamp(t, 0, 1);
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const local = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    // ease within each segment so holds (repeated keys) settle instead of snapping
    const s = local * local * (3 - 2 * local);
    this.curve.getPoint((i + s) / (keys.length - 1), out.position);
    const k = (j: number) => keys[clamp(j, 0, keys.length - 1)];
    const angle = (get: (c: CameraKey) => number) => catmullRom(get(k(i - 1)), get(a), get(b), get(k(i + 2)), s);
    out.yaw = angle((c) => c.yaw);
    out.pitch = angle((c) => c.pitch);
    out.roll = angle((c) => c.roll ?? 0);
    out.fov = angle((c) => c.fov ?? 54);
    return out;
  }
}
