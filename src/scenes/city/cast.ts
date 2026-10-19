import type { PersonDef } from '../../characters/crowd';

/**
 * The people out at midnight. Nearly everyone is doing something where they
 * stand; two walk. The right sidewalk ahead is left to the visitor and the
 * stranger.
 */
export const CITY_PEOPLE: PersonDef[] = [
  // just off the train too, getting their bearings outside the portal
  { name: 'arrival', b: { kind: 'stand', x: -3.4, z: 3.0, yaw: Math.PI + 0.25, activity: 'suitcase' },
    look: { height: 1.7, build: 'average', outfit: 'coat', top: 64, bottom: 30, skin: 120, hair: 'short', carry: 'suitcase' } },
  // two friends at the kiosk
  { name: 'kiosk talker', b: { kind: 'stand', x: -8.7, z: -2.4, faceTo: [-8.0, -3.2], activity: 'talk' },
    look: { height: 1.8, build: 'broad', outfit: 'parka', top: 44, bottom: 30, skin: 100, hair: 'none', hat: 'beanie' } },
  { name: 'kiosk listener', b: { kind: 'stand', x: -8.0, z: -3.2, faceTo: [-8.7, -2.4], activity: 'listen' },
    look: { height: 1.66, build: 'slim', frame: 'narrow', outfit: 'jacket', top: 140, bottom: 28, skin: 135, hair: 'long' } },
  // waiting for the night tram, on their phone
  { name: 'tram phone', b: { kind: 'stand', x: 9.0, z: -7.9, yaw: Math.PI * 0.85, activity: 'phone' },
    look: { height: 1.74, build: 'average', outfit: 'hoodie', top: 58, bottom: 36, skin: 110, hair: 'short', carry: 'backpack' } },
  // looking up the street at the towers
  { name: 'tourist', b: { kind: 'stand', x: -7.6, z: -46.5, yaw: Math.PI - 0.1, activity: 'board' },
    look: { height: 1.77, build: 'average', outfit: 'parka', top: 120, bottom: 34, skin: 125, hair: 'short', carry: 'backpack' } },
  // watching the road from the curb
  { name: 'curb', b: { kind: 'stand', x: -5.75, z: -36, yaw: Math.PI / 2 + 0.3, activity: 'pockets' },
    look: { height: 1.83, build: 'soft', outfit: 'coat', top: 30, bottom: 26, skin: 105, hair: 'none', hat: 'cap' } },
  { name: 'bar smoker', b: { kind: 'stand', x: -8.7, z: -58.5, yaw: -Math.PI / 2 + 0.6, activity: 'smoke' },
    look: { height: 1.72, build: 'slim', outfit: 'jacket', top: 26, bottom: 24, skin: 130, hair: 'bun' } },
  { name: 'caller', b: { kind: 'stand', x: -8.6, z: -74, yaw: Math.PI * 0.75, activity: 'call' },
    look: { height: 1.79, build: 'broad', outfit: 'coat', top: 52, bottom: 30, skin: 95, hair: 'cropped' } },
  { name: 'far talker', b: { kind: 'stand', x: -7.6, z: -104, faceTo: [-6.9, -104.9], activity: 'talk' },
    look: { height: 1.75, build: 'average', outfit: 'coat', top: 70, bottom: 30, skin: 115, hair: 'short' } },
  { name: 'far listener', b: { kind: 'stand', x: -6.9, z: -104.9, faceTo: [-7.6, -104], activity: 'listen' },
    look: { height: 1.68, build: 'soft', outfit: 'dress', top: 40, bottom: 30, skin: 140, hair: 'long', carry: 'tote' } },
  // two walkers, each with their own strip of sidewalk; they stop at shop windows
  { name: 'window shopper', b: { kind: 'lane', route: [[-6.55, -28], [-6.55, -98]], speed: 1.0, dwell: 7, start: 0.35, dwellYaw: -Math.PI / 2 },
    look: { height: 1.69, build: 'slim', frame: 'narrow', outfit: 'coat', top: 150, bottom: 30, skin: 140, hair: 'long', carry: 'shoulderbag' }, gait: { swing: 0.7, lean: 0.02, stride: 0.95 } },
  { name: 'late walker', b: { kind: 'lane', route: [[6.8, -84], [6.8, -180]], speed: 1.25, dwell: 5, start: 0.2, dwellYaw: Math.PI / 2 },
    look: { height: 1.84, build: 'average', outfit: 'jacket', top: 40, bottom: 34, skin: 100, hair: 'short', carry: 'backpack' }, gait: { swing: 0.9, lean: 0.04, stride: 1.05 } },
];
