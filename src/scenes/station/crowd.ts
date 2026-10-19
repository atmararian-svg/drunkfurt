import { BENCH_Z } from './props';
import { MAST_X } from './layout';
import { OBSTACLES, REGIONS } from './nav';
import { makeNav } from '../../characters/nav';
import * as generic from '../../characters/crowd';
import type { Crowd, PersonDef } from '../../characters/crowd';

export type { Behaviour, Crowd, PersonDef, PersonState, Route } from '../../characters/crowd';
export { lerpAngle } from '../../characters/crowd';

/** The station's walkable space, from the furniture placement data (nav.ts). */
export const stationNav = makeNav(REGIONS, OBSTACLES);

const BENCH_55 = BENCH_Z[1];

/**
 * The cast. Most people are doing something where they stand; only a few walk.
 * Every spot and route is checked against the obstacle map and the camera path.
 */
export const PEOPLE: PersonDef[] = [
  // --- moments on the platform
  // the traveller you watch from the door: waits, cuts across in front of you (scroll), then stops by the train
  { name: 'traveller', b: { kind: 'scroll', route: [[8.4, -14.4], [5.0, -11.7], [2.3, -9.7], [1.6, -8.6]], t0: 0.4, t1: 0.56, idle: 'pockets' },
    look: { height: 1.86, build: 'average', outfit: 'coat', top: 34, bottom: 28, skin: 120, hair: 'short', hat: 'cap' }, gait: { swing: 0.8, lean: 0.03, stride: 1.05 } },
  // two colleagues talking, a metre apart
  { name: 'talker', b: { kind: 'stand', x: 7.55, z: -19.2, faceTo: [6.8, -19.8], activity: 'talk' },
    look: { height: 1.79, build: 'broad', outfit: 'jacket', top: 52, bottom: 30, skin: 96, hair: 'cropped' } },
  { name: 'listener', b: { kind: 'stand', x: 6.8, z: -19.8, faceTo: [7.55, -19.2], activity: 'listen' },
    look: { height: 1.68, build: 'slim', frame: 'narrow', outfit: 'coat', top: 150, bottom: 24, skin: 140, hair: 'bun' } },
  // looking up at the destination display
  { name: 'board', b: { kind: 'stand', x: 2.0, z: -13.7, yaw: Math.PI + 0.12, activity: 'board' },
    look: { height: 1.74, build: 'slim', outfit: 'hoodie', top: 70, bottom: 40, skin: 110, hair: 'short', carry: 'backpack' } },
  { name: 'smoker', b: { kind: 'stand', x: 8.2, z: -25.6, yaw: Math.PI * 0.8, activity: 'smoke' },
    look: { height: 1.81, build: 'average', outfit: 'parka', top: 40, bottom: 26, skin: 100, hair: 'none', hat: 'beanie' } },
  { name: 'caller', b: { kind: 'stand', x: 7.9, z: -34.2, yaw: 2.3, activity: 'call' },
    look: { height: 1.71, build: 'soft', outfit: 'coat', top: 96, bottom: 30, skin: 130, hair: 'long' } },
  { name: 'phone', b: { kind: 'stand', x: 8.35, z: -42, yaw: Math.PI / 2 + 0.3, activity: 'phone' },
    look: { height: 1.66, build: 'slim', frame: 'narrow', outfit: 'jacket', top: 30, bottom: 60, skin: 150, hair: 'long', carry: 'shoulderbag' } },
  // on the bench by mast -61: one facing Gleis 7 on her phone, one facing Gleis 8
  { name: 'sitter', b: { kind: 'sit', x: MAST_X - 0.34, z: BENCH_55 + 0.5, yaw: -Math.PI / 2, activity: 'sitPhone' },
    look: { height: 1.7, build: 'average', frame: 'narrow', outfit: 'dress', top: 44, bottom: 30, skin: 140, hair: 'long', carry: 'tote' } },
  { name: 'sitter 2', b: { kind: 'sit', x: MAST_X + 0.34, z: BENCH_55 - 0.6, yaw: Math.PI / 2, activity: 'sit' },
    look: { height: 1.83, build: 'soft', outfit: 'coat', top: 26, bottom: 26, skin: 105, hair: 'none', hat: 'cap' } },
  { name: 'adjuster', b: { kind: 'stand', x: 6.3, z: -66, yaw: Math.PI, activity: 'adjust' },
    look: { height: 1.62, build: 'slim', outfit: 'parka', top: 120, bottom: 36, skin: 130, hair: 'short', carry: 'backpack' } },
  { name: 'waiting', b: { kind: 'stand', x: 3.2, z: -79, yaw: Math.PI, activity: 'suitcase' },
    look: { height: 1.76, build: 'average', outfit: 'coat', top: 60, bottom: 30, skin: 115, hair: 'short', carry: 'suitcase' } },
  // --- the few who walk: their own strip of floor each
  { name: 'suitcase walker', b: { kind: 'lane', route: [[7.4, -38], [7.4, -95]], speed: 1.05, dwell: 6, start: 0.15 },
    look: { height: 1.78, build: 'average', outfit: 'coat', top: 36, bottom: 28, skin: 110, hair: 'short', carry: 'suitcase' }, gait: { swing: 0.55, lean: 0.03, stride: 0.95 } },
  { name: 'commuter', b: { kind: 'lane', route: [[1.6, -88], [1.6, -40]], speed: 1.3, dwell: 8, start: 0.6 },
    look: { height: 1.84, build: 'broad', outfit: 'jacket', top: 48, bottom: 34, skin: 95, hair: 'cropped', carry: 'backpack' }, gait: { swing: 1.0, lean: 0.05, stride: 1.05 } },
  // --- concourse: two walkers between shop windows, two people under the big board
  { name: 'c1', b: { kind: 'lane', route: [[-18, -107.8], [20, -107.8]], speed: 1.2, dwell: 4, start: 0.1, dwellYaw: Math.PI },
    look: { height: 1.74, build: 'average', outfit: 'coat', top: 40, bottom: 28, skin: 120, hair: 'short' }, gait: { swing: 0.9, lean: 0.03, stride: 1 } },
  { name: 'c3', b: { kind: 'lane', route: [[-14, -117.4], [24, -117.4]], speed: 1.05, dwell: 5, start: 0.7, dwellYaw: Math.PI },
    look: { height: 1.69, build: 'slim', outfit: 'dress', top: 70, bottom: 30, skin: 140, hair: 'long', carry: 'tote' }, gait: { swing: 0.75, lean: 0.02, stride: 0.95 } },
  { name: 'board c', b: { kind: 'stand', x: 9.2, z: -111.4, yaw: Math.PI, activity: 'board' },
    look: { height: 1.8, build: 'average', outfit: 'parka', top: 50, bottom: 30, skin: 110, hair: 'short', carry: 'backpack' } },
  { name: 'board c2', b: { kind: 'stand', x: 10.4, z: -111.9, yaw: Math.PI - 0.2, activity: 'suitcase' },
    look: { height: 1.65, build: 'soft', outfit: 'coat', top: 110, bottom: 30, skin: 135, hair: 'bun', carry: 'suitcase' } },
];

/** Where everyone stood after the last step (read by the pigeon). */
export const crowdPositions: { x: number; z: number }[] = [];

export const createCrowd = (defs: PersonDef[] = PEOPLE) => generic.createCrowd(defs, stationNav);
export const validateCrowd = (defs: PersonDef[] = PEOPLE) => generic.validateCrowd(defs, stationNav);
export const worstObstacleClearance = generic.worstObstacleClearance;
export function stepCrowd(c: Crowd, dt: number, scrollT: number, visitor: { x: number; z: number }) {
  generic.stepCrowd(c, dt, scrollT, visitor);
  crowdPositions.length = 0;
  crowdPositions.push(...c.positions);
}
