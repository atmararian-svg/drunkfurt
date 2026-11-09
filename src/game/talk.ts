import { Object3D, Vector3 } from 'three';
import type { EpisodeId } from '../core/timeline';
import { VENDING } from '../scenes/station/props';
import { walk } from './walk';

/**
 * People and things to talk to on the walk (the game build): a few in each chapter, beside the
 * way. Near one (TALK.reach) and looking at it, the hint under the crosshair says so; E starts the
 * talk and goes on line by line, shown in the thought box (the speaker's name as its kicker), and
 * the last E, or walking away, ends it. Places in the room are the model's own (`anchor`, set by
 * the room once it is loaded).
 */
interface Line {
  who: string;
  text: string;
}
interface TalkPoint {
  id: string;
  episode: EpisodeId;
  /** Where (x, z), or a named place of a loaded model. */
  at: [number, number] | string;
  /** What the hint calls it. */
  name: string;
  verb?: 'TALK TO' | 'LOOK AT';
  lines: Line[];
  /** How near counts (m). */
  reach?: number;
}

const ME = 'ME:';

const POINTS: TalkPoint[] = [
  // chapter 1, the platform
  {
    id: 'board',
    episode: 'station',
    at: [2.0, -13.7],
    name: 'THE TRAVELLER',
    lines: [
      { who: 'TRAVELLER:', text: 'Forty minutes late. Again.' },
      { who: ME, text: "In Germany that's not a delay. That's a rumour with a timetable." },
    ],
  },
  {
    id: 'talkers',
    episode: 'station',
    at: [7.2, -19.5],
    name: 'THE TWO OF THEM',
    lines: [
      { who: 'STRANGER:', text: 'And then he says the website is basically done. Since March.' },
      { who: ME, text: "Every website is basically done. That's the whole problem." },
    ],
  },
  {
    id: 'smoker',
    episode: 'station',
    at: [8.2, -25.6],
    name: 'THE SMOKER',
    lines: [
      { who: 'SMOKER:', text: 'Feuer? No? Then keep walking, tourist.' },
      { who: ME, text: 'Not a tourist. Just new at being here.' },
    ],
  },
  {
    id: 'caller',
    episode: 'station',
    at: [7.9, -34.2],
    name: 'THE MAN ON THE PHONE',
    lines: [
      { who: 'MAN ON THE PHONE:', text: 'Ja. Ja. Nein. Ja. Tschüss.' },
      { who: ME, text: 'A whole business meeting in five words. Respect.' },
    ],
  },
  {
    id: 'vending',
    episode: 'station',
    at: [VENDING.x, VENDING.z],
    name: 'THE VENDING MACHINE',
    verb: 'LOOK AT',
    lines: [
      { who: 'VENDING MACHINE:', text: 'AUSSER BETRIEB.' },
      { who: ME, text: 'Out of order. Same, buddy. Same.' },
    ],
  },
  // chapter 2, the plaza
  {
    id: 'arrival',
    episode: 'city',
    at: [-3.4, 3.0],
    name: 'THE WOMAN WITH THE SUITCASE',
    lines: [
      { who: 'WOMAN:', text: 'Is it always like this here at night?' },
      { who: ME, text: 'Only on the nights that end in -day.' },
    ],
  },
  {
    id: 'kiosk',
    episode: 'city',
    at: [-8.3, -2.8],
    name: 'THE KIOSK REGULARS',
    reach: 3.2,
    lines: [
      { who: 'KIOSK REGULAR:', text: 'Beer is two euros. Advice is free: go home.' },
      { who: ME, text: "Can't. I've got a website to fix. Not even mine." },
    ],
  },
  {
    id: 'tram',
    episode: 'city',
    at: [9.0, -7.9],
    name: 'THE GUY AT THE TRAM STOP',
    lines: [
      { who: 'GUY AT THE TRAM STOP:', text: 'Stay off the side streets tonight. Trust me.' },
      { who: ME, text: "Wasn't planning to. Then again, I never am." },
    ],
  },
  // chapter 3, the room
  {
    id: 'clock',
    episode: 'home',
    at: 'leds',
    name: 'THE CLOCK',
    verb: 'LOOK AT',
    reach: 3.4,
    lines: [{ who: ME, text: 'Almost midnight. Good. The best work starts after everyone else has given up.' }],
  },
  {
    id: 'wall',
    episode: 'home',
    at: 'screen_05',
    name: 'THE SCREENS',
    verb: 'LOOK AT',
    reach: 4.2,
    lines: [
      { who: ME, text: 'Every project I ever finished. And a few that finished me.' },
      { who: ME, text: 'The big one in the middle is the one that matters. Sit down first.' },
    ],
  },
];

/** Named places of loaded models (the room's clock, its screens), in world space. */
export const anchors = new Map<string, Object3D>();
const tmp = new Vector3();

const DEFAULT_REACH = 2.4;
/** How far off the look a point may be and still be the one you mean (rad). */
const AIM = 0.6;

const talk = { point: null as TalkPoint | null, line: 0, near: null as TalkPoint | null };

const where = (p: TalkPoint) => {
  if (typeof p.at !== 'string') return { x: p.at[0], z: p.at[1] };
  const a = anchors.get(p.at);
  if (!a) return null;
  a.getWorldPosition(tmp);
  return { x: tmp.x, z: tmp.z };
};

/** Called every frame: which point you are at and looking at, and whether a talk has been walked away from. */
export function stepTalk() {
  talk.near = null;
  if (!walk.free) {
    talk.point = null;
    return;
  }
  let best = Infinity;
  for (const p of POINTS) {
    if (p.episode !== walk.episode) continue;
    const at = where(p);
    if (!at) continue;
    const dx = at.x - walk.pos.x;
    const dz = at.z - walk.pos.z;
    const d = Math.hypot(dx, dz);
    if (talk.point === p && d > (p.reach ?? DEFAULT_REACH) + 1.4) talk.point = null;
    if (d > (p.reach ?? DEFAULT_REACH)) continue;
    // the look's direction on the ground (three's camera looks down -z at yaw 0)
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - walk.yaw), Math.cos(Math.atan2(-dx, -dz) - walk.yaw)));
    if (off > AIM) continue;
    if (d < best) {
      best = d;
      talk.near = p;
    }
  }
}

/** What the crosshair's hint says for talking (or null). */
export function talkHint() {
  const p = talk.near;
  if (!p) return null;
  if (talk.point === p) return talk.line < p.lines.length - 1 ? 'NEXT' : 'DONE';
  return `${p.verb ?? 'TALK TO'} ${p.name}`;
}

/** E: start the talk you are at, or go on to its next line, or end it. Returns whether there was one. */
export function talkAction() {
  const p = talk.near ?? talk.point;
  if (!p) return false;
  if (talk.point !== p) {
    talk.point = p;
    talk.line = 0;
  } else if (talk.line < p.lines.length - 1) talk.line++;
  else talk.point = null;
  return true;
}

/** The line being said, for the thought box (or null). */
export function talkLine() {
  const p = talk.point;
  if (!p) return null;
  const l = p.lines[talk.line];
  return { key: `talk-${p.id}-${talk.line}`, kicker: l.who, text: l.text };
}
