import { clamp, deg, smoothstep } from '../../core/math';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
import type { CameraPose } from '../../core/sequence';
import type { EpisodeDef } from '../../episodes/types';
import { CityScene } from './CityScene';
import { BEAT, BLOCK, KO, encounter, encounterAt, resetEncounter } from './encounter';
import { INVITATION, LETTER, invitationTyped, letter, resetLetter } from './letter';
import { strangerGroundAt } from './strangerRoute';
import { cityTrack } from './track';

/**
 * Episode 2 camera, by beat (local progress):
 *  0.00–0.10  under the station portal, behind the ink and the title
 *  0.10–0.22  out onto the square: the street, the houses, the towers
 *  0.22–0.40  a look around: the kiosk on the left, the tram stop on the right
 *  0.40–0.60  across the zebra and down the right sidewalk
 *  0.60–0.72  a man leaves a doorway ahead and walks towards you
 *  0.72–0.845 he closes in; everything slows to a tenth
 *  0.845      DEFEND (the story waits here)
 *  0.85–0.905 the strike, under ink
 *  0.905–1.00 aftermath: a new angle on the same spot
 */
/**
 * While he approaches, the camera turns to keep him in frame, and once he is in
 * your face it frames his face and shoulders. As the punch comes you lean back
 * a little; the block and the counter jolt the camera, briefly.
 */
const KO_DOWN = { x: 6.25, y: 0.24, z: -33.6 };

/** The camera at the gate: where you stand when he swings. */
const GATE_FRAME = { x: 6.5, y: 1.68, z: -34, yaw: deg(2), pitch: 0 };

function encounterCamera(local: number, pose: CameraPose) {
  const v = encounterAt(local);
  // knocked out: from the hit to the ground, then lying on the pavement looking at your bag
  if (v.outcome === 'knockedOut' && v.t >= 0) {
    const t = v.t;
    const snap = smoothstep(clamp(t / KO.snap, 0, 1));
    const fall = smoothstep(clamp((t - KO.fallFrom) / (KO.fallTo - KO.fallFrom), 0, 1));
    const start = GATE_FRAME;
    // the head snaps back and up, then you go down sideways
    pose.position.set(
      lerp(start.x, KO_DOWN.x, fall),
      lerp(start.y, KO_DOWN.y, fall * fall),
      lerp(start.z + 0.18 * snap, KO_DOWN.z, fall),
    );
    pose.yaw = lerp(start.yaw + 0.12 * snap, deg(6), fall);
    pose.pitch = lerp(start.pitch + 0.45 * snap * (1 - fall), deg(-14), fall);
    pose.roll = lerp(-0.25 * snap, deg(-78), fall);
    pose.fov = 46;
    // lying still, breathing (ambient, a few millimetres)
    pose.position.y += Math.sin(performance.now() / 900) * 0.004 * smoothstep(clamp(t - KO.fallTo, 0, 1));
    return;
  }
  if (local < BEAT.noticed - 0.02 || local > BEAT.cut) return;
  if (v.outcome === 'blocked' && v.t >= BLOCK.dark) return; // the page is black; he is down
  const w = 0.75 * smoothstep(clamp((local - (BEAT.noticed - 0.02)) / 0.1, 0, 1));
  const him = strangerGroundAt(local);
  const dx = him.x - pose.position.x;
  const dz = him.z - pose.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.5) {
    const want = Math.atan2(-dx, -dz);
    const d = Math.atan2(Math.sin(want - pose.yaw), Math.cos(want - pose.yaw));
    pose.yaw += d * w;
    // look up a touch at his face once he is close (he is taller than you)
    pose.pitch += smoothstep(clamp((4 - dist) / 2.5, 0, 1)) * 0.05;
  }
  // lean back from the incoming fist
  const lean = 0.07 * Math.pow(v.punch, 1.5);
  pose.position.x -= Math.sin(pose.yaw) * -lean;
  pose.position.z += Math.cos(pose.yaw) * lean;
  pose.pitch -= 0.03 * v.punch;
  // impact jolt: a few centimetres and a fraction of a degree, decaying fast (a function of the fight's own clock)
  const k = v.shake * v.shake;
  if (k > 0) {
    const t = v.t;
    pose.position.x += Math.sin(t * 61) * 0.012 * k;
    pose.position.y += Math.sin(t * 47 + 1) * 0.01 * k;
    pose.roll += Math.sin(t * 53 + 2) * 0.012 * k;
    pose.pitch += Math.sin(t * 43) * 0.008 * k;
  }
}

export const cityEpisode: EpisodeDef = {
  id: 'city',
  number: 2,
  title: 'City',
  subtitle: 'Outside Frankfurt (Main) Hbf · 23:59',
  World: CityScene,
  track: cityTrack,
  reset: () => {
    resetEncounter();
    resetLetter();
  },
  adjustPose: encounterCamera,
  // the visitor can lean and crane, but not into the shop windows or the parked cars
  clampHead: (base, o) => {
    const x = base.x + o.x;
    if (x > 9.1) o.x = 9.1 - base.x;
    if (x < -9.1) o.x = -9.1 - base.x;
    if (base.y + o.y < 0.15) o.y = 0.15 - base.y;
  },
  beats: [0, 0.12, 0.22, 0.31, 0.4, 0.5, 0.62, BEAT.stop, BEAT.cock, BEAT.gate, 0.94, LETTER.gate, 1],
  captions: [
    { from: 0.14, to: 0.27, place: 'tl', kicker: 'Midnight, give or take', text: 'Outside, the city was awake. Not in a good way.' },
    { from: 0.3, to: 0.41, place: 'br', text: 'Banks at the end of the street. Everyone else down here.' },
    { from: 0.46, to: 0.58, place: 'tl', text: 'Twelve minutes in Drunkfurt. Nothing had happened yet.' },
    { from: 0.63, to: 0.72, place: 'bl', tone: 'yellow', text: 'Some people walk somewhere. He was walking at me.' },
    // he says it with the knife on you, and keeps saying it while the story waits for you
    { from: 0.79, to: 0.9, place: 'tr', tone: 'speech', kicker: 'ATTACKER:', text: 'Your bag. Give it to me. Now.', when: () => !encounter.outcome },
    { from: 0.92, to: 0.955, place: 'br', tone: 'yellow', text: 'He wanted my bag. He got the sidewalk.', when: () => encounter.outcome === 'blocked' },
    // the letter he dropped: the story waits until it has been read (letter.ts), then you tell him where to find you
    { from: LETTER.gate - 0.006, to: 1, place: 'bl', tone: 'yellow', text: 'Something fell out of his coat. A letter. Click it.', when: () => encounter.outcome === 'blocked' && !letter.read },
    { from: LETTER.gate - 0.006, to: 1, place: 'tr', tone: 'speech', kicker: 'PROTAGONIST → ATTACKER:', text: INVITATION, when: () => letter.read, onTyped: invitationTyped },
    { from: 0.935, to: 0.978, place: 'br', tone: 'yellow', text: 'When I came to, he was gone. He did not even take the bag.', when: () => encounter.outcome === 'knockedOut' },
  ],
};
