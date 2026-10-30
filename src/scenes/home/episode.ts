import { Vector3 } from 'three';
import { CameraTrack } from '../../core/cameraTrack';
import { clamp, deg, smoothstep } from '../../core/math';
import type { CameraPose } from '../../core/sequence';
import type { EpisodeDef } from '../../episodes/types';
import { DISPLAY, DISPLAY_NORMAL, HOME_BEAT, SEAT_EYE } from './layout';
import { flyAt, monitor, resetMonitor } from './monitor';
import { RoomScene } from './RoomScene';
import { TOUCH } from '../../ui/touch';

/**
 * Episode 4 camera. The page opens on the way in, in the dark behind the
 * operator's chair, the monitor wall ahead.
 *
 *  0.00–0.12  the ink opens on the way in (the page turn after the getaway)
 *  0.12–0.42  across the room towards the wall, past the right of the chair
 *  0.42–0.50  at the chair's side, looking down at it
 *  0.50–0.66  turning into it and lowering, eye height 1.65 → 1.16 m
 *  0.66–0.72  the settle: a little dip, then upright, eyes on the big screen
 *  0.76       the story waits here (HOME_BEAT.gate): click the screen
 *
 * After the click (monitor.ts) the camera leaves the track: it moves straight
 * into the screen, square to it, until the screen's picture fills the view.
 */
const S = SEAT_EYE;
export const homeTrack = new CameraTrack([
  { t: 0, pos: [2.85, 1.68, 8.6], yaw: deg(4), pitch: deg(-4), fov: 50 },
  { t: HOME_BEAT.opened, pos: [2.86, 1.68, 8.1], yaw: deg(4), pitch: deg(-4), fov: 50 },
  { t: 0.22, pos: [2.92, 1.67, 6.5], yaw: deg(4), pitch: deg(-5), fov: 50 },
  { t: 0.32, pos: [2.98, 1.67, 5.0], yaw: deg(6), pitch: deg(-8), fov: 50 },
  { t: 0.42, pos: [3.02, 1.66, 3.75], yaw: deg(14), pitch: deg(-17), fov: 50 },
  // at the chair's right side, looking down at the seat
  { t: HOME_BEAT.atChair, pos: [2.97, 1.65, 3.2], yaw: deg(32), pitch: deg(-26), fov: 50 },
  // turning in and going down over the seat
  { t: 0.58, pos: [2.62, 1.42, 2.98], yaw: deg(14), pitch: deg(-6), fov: 50 },
  // down: a touch lower than the eye will rest, the seat gives
  { t: HOME_BEAT.seated, pos: [S.x, S.y - 0.035, S.z + 0.02], yaw: deg(2), pitch: deg(6), fov: 48 },
  { t: 0.72, pos: [S.x, S.y, S.z], yaw: deg(1), pitch: deg(10), fov: 46 },
  { t: HOME_BEAT.gate, pos: [S.x, S.y, S.z], yaw: deg(0.5), pitch: deg(10.5), fov: 46 },
  { t: 1, pos: [S.x, S.y, S.z], yaw: deg(0.5), pitch: deg(10.5), fov: 46 },
]);

/** Field of view (deg) the move into the screen ends on. */
const FLY_FOV = 40;
/** How far the pointer over the screen draws you towards it (m), and how much the view narrows (deg). */
const LEAN = { distance: 0.3, fov: 3 };

/** The lean to read the screen about the author: the share of the way there, and how much the view narrows (deg). */
const READ = { share: 0.6, fov: 10 };
const toAbout = new Vector3();
const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const toScreen = new Vector3();
const target = new Vector3();

/**
 * Where the camera stands when the screen's picture exactly covers the view:
 * on the screen's axis, square to it, at the distance where the picture's
 * height (or, on a viewport wider than 16:9, its width) fills the frame.
 * The page's overlay image is cover-fit and centred, the same crop.
 */
export function coverDistance(fovDeg: number, aspect: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.min(DISPLAY.height / (2 * t), DISPLAY.width / (2 * t * aspect)) * 0.995;
}

const smootherstep = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** The lean towards the screen while the pointer is on it, and the move into it after the click. */
function lookAtScreen(local: number, pose: CameraPose) {
  pose.seated = smoothstep(clamp((local - HOME_BEAT.atChair) / (HOME_BEAT.seated - HOME_BEAT.atChair), 0, 1));
  if (local < HOME_BEAT.seated) return;
  const h = smoothstep(clamp(monitor.hover, 0, 1));
  if (h > 0) {
    toScreen.copy(DISPLAY.centre).sub(pose.position).normalize();
    pose.position.addScaledVector(toScreen, LEAN.distance * h);
    pose.fov = (pose.fov ?? 46) - LEAN.fov * h;
  }
  // the screen about the author: the pointer on it turns you to it and draws you in, near enough to read
  const a = smoothstep(clamp(monitor.about.hover, 0, 1));
  if (a > 0) {
    const d = toAbout.copy(monitor.about.centre).sub(pose.position);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    pose.position.addScaledVector(d, READ.share * a);
    pose.yaw += wrapPi(yaw - pose.yaw) * a;
    pose.pitch += (pitch - pose.pitch) * a;
    pose.fov = (pose.fov ?? 46) - READ.fov * a;
    pose.still = Math.max(pose.still ?? 0, a);
  }
  const f = flyAt();
  if (f <= 0) return;
  // slow off the mark, then quicker, and a soft arrival exactly on the mark
  const e = smootherstep(Math.pow(f, 1.3));
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  target.copy(DISPLAY.centre).addScaledVector(DISPLAY_NORMAL, coverDistance(FLY_FOV, aspect));
  pose.position.lerp(target, e);
  pose.yaw += (0 - pose.yaw) * e;
  pose.pitch += (DISPLAY.tilt - pose.pitch) * e;
  pose.roll *= 1 - e;
  pose.fov = (pose.fov ?? 46) + (FLY_FOV - (pose.fov ?? 46)) * e;
  // the visitor's own look-around lets go at once, so the framing is exact when it arrives
  pose.still = smoothstep(clamp(f * 4, 0, 1));
}

export const homeEpisode: EpisodeDef = {
  id: 'home',
  number: 4,
  title: 'The Cave',
  subtitle: 'The back room · 00:32',
  World: RoomScene,
  track: homeTrack,
  reset: resetMonitor,
  adjustPose: lookAtScreen,
  // seated, the head stays near the headrest (the rig already scales it down)
  clampHead: (_base, o) => {
    o.y = Math.min(o.y, 0.03);
  },
  captions: [
    { from: 0.16, to: 0.38, place: 'tl', text: 'CRASIGOSTRAẞE 24. EVERYTHING I HAVE BUILT IS ON THESE SCREENS. TIME TO SHOW IT.' },
    { from: 0.74, to: 1, place: 'bl', tone: 'tip', text: TOUCH ? 'TAP THE SCREEN.' : 'CLICK THE SCREEN.', when: () => monitor.armed && !monitor.entering },
  ],
  beats: [0, HOME_BEAT.opened, 0.32, HOME_BEAT.atChair, HOME_BEAT.gate],
};
