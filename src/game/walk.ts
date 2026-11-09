import { Vector3 } from 'three';
import { clamp, damp } from '../core/math';
import type { CameraPose } from '../core/sequence';
import { story } from '../core/store';
import {
  EpisodeId,
  autoplay,
  chapterStarts,
  chapterTurn,
  episodeRange,
  floorLimit,
  gateLimit,
  globalProgress,
  locate,
  playProgress,
  scrollToProgress,
  timeline,
} from '../core/timeline';
import { cityTrack } from '../scenes/city/track';
import { LAMP_X, LAMP_Z, PORTAL } from '../scenes/city/layout';
import { carTrack } from '../scenes/car/episode';
import { CAR_BEAT } from '../scenes/car/getaway';
import { homeTrack } from '../scenes/home/episode';
import { HOME_BEAT } from '../scenes/home/layout';
import { stationTrack } from '../scenes/station/episodeTrack';
import { MAST_X, MAST_Z } from '../scenes/station/layout';
import { VENDING } from '../scenes/station/props';
import type { CameraTrack } from '../core/cameraTrack';
import { keys } from './keys';

/**
 * Walking the story (the game build). Each chapter has legs you walk and stretches that play by
 * themselves (rails). A leg is a path on the ground, taken from the episode's own camera track
 * (its keys, so a place on the path is the same moment of the story as on the scroll page), and a
 * corridor either side of it, as wide as the place allows (the platform, the plaza, the pavement).
 * Where you stand along the path is the story's progress: walking on moves the story on, as the
 * scroll did, and everything else (the people, the stranger, the captions, the chapter turns, the
 * gates) follows it unchanged. You cannot leave the corridor, go back past where the leg starts or
 * on past a gate: nobody gets lost.
 *
 * Between legs the camera is on its rails again: stepping out of the train, the stranger stopping
 * you and the fight, getting up after the letter, getting into the car (E at its door), sitting
 * down at the desk (E at the chair). The move from the walk to the rails and back is eased.
 */
interface PathPoint {
  t: number;
  x: number;
  y: number;
  z: number;
  /** The corridor's half-width here (m). */
  w: number;
}
interface Leg {
  from: number;
  to: number;
  pts: PathPoint[];
  /** Keeps a point inside the place (the platform's edges, the pavement). */
  box?: (p: { x: number; z: number }) => void;
  /** Posts, lamps, benches: circles you walk round (x, z, r). */
  obstacles?: [number, number, number][];
  /** At the leg's end: what E does there (the hint), and how far on the rails then go (local). */
  end?: { hint: string; to: number; seconds: number };
}
interface Rails {
  from: number;
  to: number;
  /** Seconds per unit of local progress. */
  pace: number;
  /** 'auto': as soon as you are there; 'move': on the first step (the start of the story). */
  start: 'auto' | 'move';
}
interface WalkDef {
  legs: Leg[];
  rails: Rails[];
}

/** A leg's path from its track's keys between two moments (`skip`: keys that are shots, not places). */
function pathOf(track: CameraTrack, from: number, to: number, width: (x: number, z: number) => number, skip: number[] = []) {
  return track.keys
    .filter((k) => k.t >= from - 1e-6 && k.t <= to + 1e-6 && !skip.includes(k.t))
    .map((k) => ({ t: k.t, x: k.pos[0], y: k.pos[1], z: k.pos[2], w: width(k.pos[0], k.pos[2]) }));
}

const STATION: WalkDef = {
  rails: [{ from: 0, to: 0.32, pace: 22, start: 'move' }],
  legs: [
    {
      from: 0.32,
      to: 1,
      // (the low shot under the name sign, 0.8, is a look up, not a place)
      pts: pathOf(stationTrack, 0.32, 1, (_, z) => (z > -2 ? 1.4 : 6.5), [0.8]),
      // the platform, between the train and the far edge
      box: (p) => {
        p.x = clamp(p.x, 0.75, 9.3);
      },
      obstacles: [...MAST_Z.map((z): [number, number, number] => [MAST_X, z, 0.5]), [VENDING.x, VENDING.z, 0.9]],
    },
  ],
};

const CITY: WalkDef = {
  rails: [{ from: 0.7, to: 1, pace: 42, start: 'auto' }],
  legs: [
    {
      from: 0,
      to: 0.7,
      pts: pathOf(cityTrack, 0, 0.7, (_, z) => (z > 6 ? 2.4 : z > -11.5 ? 6.5 : z > -22 ? 3 : 1.5)),
      box: (p) => {
        // through the station's portal, over the plaza, across the road, then the pavement on the right
        if (p.z > 6) p.x = clamp(p.x, PORTAL.x - PORTAL.halfWidth + 0.6, PORTAL.x + PORTAL.halfWidth - 0.6);
        else if (p.z > -11.5) p.x = clamp(p.x, -6, 10.6);
        else if (p.z > -22) p.x = clamp(p.x, 0, 9.2);
        else p.x = clamp(p.x, 5.75, 9.2);
      },
      obstacles: LAMP_Z.map((z): [number, number, number] => [LAMP_X, z, 0.3]),
    },
  ],
};

const CAR: WalkDef = {
  rails: [
    { from: 0, to: CAR_BEAT.turn, pace: 30, start: 'auto' },
    // (into the car: started by E at its door, `end` below; the thoughts and the rev hold it on the way)
  ],
  legs: [
    {
      from: CAR_BEAT.turn,
      to: CAR_BEAT.walk,
      pts: pathOf(carTrack, CAR_BEAT.turn, CAR_BEAT.walk, () => 0.9),
      end: { hint: 'GET IN THE CAR', to: CAR_BEAT.doorClosed + 0.002, seconds: 5.5 },
    },
  ],
};

const HOME: WalkDef = {
  rails: [],
  legs: [
    {
      from: HOME_BEAT.opened,
      to: HOME_BEAT.atChair,
      pts: pathOf(homeTrack, HOME_BEAT.opened, HOME_BEAT.atChair, () => 0.55),
      end: { hint: 'SIT DOWN', to: HOME_BEAT.gate, seconds: 4.5 },
    },
  ],
};

const WALKS: Partial<Record<EpisodeId, WalkDef>> = { station: STATION, city: CITY, car: CAR, home: HOME };

/** The walk path of an episode's legs (for the red path on the ground). */
export function walkPath(id: EpisodeId) {
  return (WALKS[id]?.legs ?? []).map((l) => l.pts);
}

/** Walking pace and hurrying (m/s); looking (rad per px of mouse). */
const SPEED = { walk: 1.6, run: 3.4 };
const LOOK = 0.0022;
/** The view's height of field while you walk (deg). */
export const WALK_FOV = 58;

export const walk = {
  /** On a leg, walking (else on the rails). */
  free: false,
  /** 0 the camera on the rails … 1 in your own eyes on the walk. */
  blend: 0,
  pos: new Vector3(),
  yaw: 0,
  pitch: 0,
  /** What E does here, if anything (shown under the crosshair). */
  hint: null as string | null,
  /** The leg you are on, and the episode. */
  leg: null as Leg | null,
  episode: '' as EpisodeId | '',
  /** You have moved since the story began (the first step starts it). */
  moved: false,
};

/** The mouse turns the look (with the pointer held by the page). */
export function look(dx: number, dy: number) {
  walk.yaw -= dx * LOOK;
  walk.pitch = clamp(walk.pitch - dy * LOOK, -1.25, 1.25);
}

const busy = () => {
  const p = story.getState().prompt;
  return (
    chapterTurn.busy ||
    autoplay.active ||
    story.getState().phase !== 'ready' ||
    document.documentElement.classList.contains('is-preloading') ||
    p === 'defend' ||
    p === 'letter' ||
    p === 'invite' ||
    p === 'thought' ||
    p === 'rev' ||
    p === 'monitor'
  );
};

/** The point on a leg's path nearest to (x, z): its moment, the point, the way along, and the side offset. */
function project(leg: Leg, x: number, z: number) {
  let best = { d: Infinity, t: leg.from, px: 0, pz: 0, dx: 0, dz: -1, side: 0, y: 0, w: 1 };
  const pts = leg.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const len2 = sx * sx + sz * sz;
    const u = len2 > 1e-9 ? clamp(((x - a.x) * sx + (z - a.z) * sz) / len2, 0, 1) : 0;
    const px = a.x + sx * u;
    const pz = a.z + sz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d - 1e-6) {
      const len = Math.sqrt(len2) || 1;
      const dx = sx / len;
      const dz = sz / len;
      best = { d, t: a.t + (b.t - a.t) * u, px, pz, dx, dz, side: (x - px) * -dz + (z - pz) * dx, y: a.y + (b.y - a.y) * u, w: a.w + (b.w - a.w) * u };
    }
  }
  return best;
}

/** The point of a leg's path at a moment (and its direction). */
function pointAt(leg: Leg, t: number) {
  const pts = leg.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t <= b.t || i === pts.length - 2) {
      const u = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const len = Math.hypot(sx, sz) || 1;
      return { x: a.x + sx * u, z: a.z + sz * u, y: a.y + (b.y - a.y) * u, w: a.w + (b.w - a.w) * u, dx: sx / len, dz: sz / len };
    }
  }
  const p = pts[0];
  return { x: p.x, z: p.z, y: p.y, w: p.w, dx: 0, dz: -1 };
}

const localOf = (id: EpisodeId, g: number) => {
  const r = episodeRange(id);
  return (g - r.start) / (r.end - r.start);
};

/**
 * Called by the camera rig every frame, after the track's pose is sampled into `pose`: moves you,
 * moves the story with you, starts the rails, and blends the camera between them and your eyes.
 */
export function stepWalk(dt: number, pose: CameraPose) {
  const { id, local } = locate(timeline.progress);
  const def = id === 'outro' ? undefined : WALKS[id];
  walk.hint = null;
  if (id !== walk.episode) {
    walk.episode = id === 'outro' ? '' : id;
    walk.free = false;
  }
  // (a leg with something to do at its end holds you there; one without hands you to the rails that follow)
  const leg = !def || busy() ? undefined : def.legs.find((l) => local >= l.from - 0.003 && (l.end ? local <= l.to + 0.003 : local < l.to - 0.0005));
  if (leg && def) {
    if (!walk.free || walk.leg !== leg) {
      // onto a leg: from where the camera is, looking where it looks
      walk.free = true;
      walk.leg = leg;
      const p = pointAt(leg, clamp(local, leg.from, leg.to));
      walk.pos.set(pose.position.x, p.y, pose.position.z);
      walk.yaw = pose.yaw;
      walk.pitch = clamp(pose.pitch, -0.5, 0.5);
    }
    // the keys: forward along the look, sideways, Shift to hurry
    const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    walk.yaw += ((keys.turnLeft ? 1 : 0) - (keys.turnRight ? 1 : 0)) * 1.9 * dt;
    const len = Math.hypot(f, s);
    if (len > 0) {
      walk.moved = true;
      const v = ((keys.run ? SPEED.run : SPEED.walk) * dt) / len;
      const sin = Math.sin(walk.yaw);
      const cos = Math.cos(walk.yaw);
      // (three's camera looks down -z at yaw 0)
      walk.pos.x += (-sin * f + cos * s) * v;
      walk.pos.z += (-cos * f - sin * s) * v;
    }
    for (const [ox, oz, r] of leg.obstacles ?? []) {
      const dx = walk.pos.x - ox;
      const dz = walk.pos.z - oz;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-6) {
        walk.pos.x = ox + (dx / d) * r;
        walk.pos.z = oz + (dz / d) * r;
      }
    }
    leg.box?.(walk.pos);
    // where that is along the path: the story's moment, kept within the leg, the gates ahead and what has happened behind
    const pr = project(leg, walk.pos.x, walk.pos.z);
    // (not back past the chapter's opening shot either: behind it is the turn back to the chapter before)
    const opening = chapterStarts().filter((c) => c <= timeline.progress + 1e-6).pop() ?? 0;
    const lo = Math.max(leg.from, localOf(id as EpisodeId, Math.max(floorLimit(), opening + 1e-4)));
    const hi = Math.min(leg.to, localOf(id as EpisodeId, gateLimit()));
    const t = clamp(pr.t, lo, Math.max(lo, hi));
    const side = clamp(pr.side, -pr.w, pr.w);
    const at = t === pr.t ? { x: pr.px, z: pr.pz, y: pr.y, dx: pr.dx, dz: pr.dz } : pointAt(leg, t);
    walk.pos.x = at.x - at.dz * side;
    walk.pos.z = at.z + at.dx * side;
    leg.box?.(walk.pos);
    walk.pos.y = at.y;
    const g = globalProgress(id as EpisodeId, t);
    if (Math.abs(g - timeline.target) > 1e-6) scrollToProgress(g, false);
    if (leg.end && t >= leg.to - 0.004) walk.hint = leg.end.hint;
  } else {
    walk.free = false;
    walk.leg = null;
    // on the rails: they go on by themselves (or on the first step at the very start)
    const r = def?.rails.find((x) => local >= x.from - 1e-4 && local < x.to - 1e-4);
    const ask = story.getState().prompt;
    if (r && !busy() && ask === null && (r.start === 'auto' || walk.moved || keys.any())) {
      walk.moved = true;
      const target = Math.min(r.to, localOf(id as EpisodeId, gateLimit()));
      if (target > local + 1e-4) playProgress(timeline.progress, globalProgress(id as EpisodeId, target), (target - local) * r.pace);
    }
  }
  // the camera: your eyes while you walk, the rails otherwise, eased between
  walk.blend = walk.free ? damp(walk.blend, 1, 6, dt) : damp(walk.blend, 0, 4, dt);
  if (walk.blend < 0.002) walk.blend = 0;
  if (walk.blend > 0.998) walk.blend = 1;
  const k = walk.blend;
  if (k > 0) {
    pose.position.lerp(walk.pos, k);
    pose.yaw = pose.yaw + wrapPi(walk.yaw - pose.yaw) * k;
    pose.pitch = pose.pitch + (walk.pitch - pose.pitch) * k;
    pose.roll *= 1 - k;
    pose.fov = (pose.fov ?? 54) + (WALK_FOV - (pose.fov ?? 54)) * k;
    pose.seated = (pose.seated ?? 0) * (1 - k);
    pose.still = 0;
  }
}
const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** E at a leg's end (the car's door, the chair): the rails take you on. Returns whether it did. */
export function walkAction() {
  const leg = walk.leg;
  if (!walk.free || !leg?.end || walk.hint === null) return false;
  const id = walk.episode;
  if (!id) return false;
  const { local } = locate(timeline.progress);
  const target = Math.min(leg.end.to, localOf(id, gateLimit()));
  if (target <= local) return false;
  playProgress(timeline.progress, globalProgress(id, target), leg.end.seconds);
  return true;
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__walk = walk;
