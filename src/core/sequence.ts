import { Vector3 } from 'three';
import { CameraTrack } from './cameraTrack';
import { clamp, easeInOutCubic } from './math';

/**
 * Camera keyframes and time-driven shots. Scroll-driven episode tracks use the
 * same keys through CameraTrack; ShotPlayer plays them over time instead.
 */
export interface CameraKey {
  /** Normalised time 0..1 within the shot. */
  t: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  roll?: number;
  /** Vertical field of view in degrees (default 54). */
  fov?: number;
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
  fov?: number;
  /** 0 on foot … 1 sitting in a vehicle: no footsteps, and the head moves only a little. */
  seated?: number;
  /**
   * 0 … 1 the camera holds exactly the composed pose: no look-around, no head
   * movement, no breathing (a framing that has to match something exactly).
   */
  still?: number;
}

/** Time-driven shots (for later scripted beats such as the slow-motion sequence). */
export class ShotPlayer {
  private shot: CameraShot | null = null;
  private track: CameraTrack | null = null;
  private elapsed = 0;
  private onDone: (() => void) | null = null;

  get active() {
    return this.shot !== null;
  }

  play(shot: CameraShot, onDone?: () => void) {
    if (this.shot) return false; // never overlap shots
    this.shot = shot;
    this.track = new CameraTrack(shot.keys);
    this.elapsed = 0;
    this.onDone = onDone ?? null;
    return true;
  }

  /** Abandons the current shot without calling its completion callback. */
  stop() {
    this.shot = null;
    this.track = null;
    this.onDone = null;
  }

  /** Advances the shot and writes the sampled pose. Returns false when inactive. */
  update(dt: number, out: CameraPose) {
    const shot = this.shot;
    if (!shot || !this.track) return false;
    this.elapsed += dt;
    const raw = clamp(this.elapsed / shot.duration, 0, 1);
    this.track.sample((shot.ease ?? easeInOutCubic)(raw), out);
    if (raw >= 1) {
      const done = this.onDone;
      this.shot = null;
      this.track = null;
      this.onDone = null;
      done?.();
    }
    return true;
  }
}
