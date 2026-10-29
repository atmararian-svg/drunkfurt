import { Camera, Mesh, Raycaster, Vector2, Vector3 } from 'three';
import { story } from '../../core/store';
import { Gate, gates, localProgress, readScroll } from '../../core/timeline';
import { BEAT } from './beats';
import { encounter } from './encounter';

/**
 * The letter he dropped. After you defend, a crumpled sheet lies on the
 * pavement by him; the story waits (a gate at LETTER.gate) until you have
 * picked it up and read it (ui/letterReveal.ts), and then until you have told
 * him where to find you (the invitation, typed in a balloon, plus a moment to
 * read it). Only then does the scroll go on to the car.
 *
 * Nothing here runs on its own clock except the invitation's hold; the rest
 * follows the scroll and the visitor's clicks. Going back into the chapter
 * (`resetLetter`, from the encounter's reset) puts it all back.
 */
export const LETTER = {
  /** Where the story waits for the letter (city local progress). */
  gate: 0.96,
  /** The sheet is on the pavement from the moment the dark opens on the aftermath. */
  from: BEAT.aftermath,
  /** After the invitation is fully typed, it holds this long before the story goes on (ms). */
  hold: 1600,
};

// one sentence per line: at 600 px the second and third would otherwise run together and leave "problem." alone on a line
export const INVITATION = "Hey, man. When you wake up, come to Crasigostraße 24.\nYou don't have to rob people.\nI'll help you fix your website problem.";

export const letter = {
  /** The reveal is open. */
  open: false,
  /** Read and closed again (once). */
  read: false,
  /** The invitation has been said (typed and held): the story may go on. */
  invited: false,
  /** The invitation was skipped (SKIP DIALOGUE): it is not shown again this pass. */
  skipped: false,
  /** The pointer is over the sheet on the pavement. */
  over: false,
  /** Set by the prop: the sheet's mesh, and the camera to pick with. */
  mesh: null as Mesh | null,
  camera: null as Camera | null,
};

const gate: Gate = { episode: 'city', at: LETTER.gate, open: true };
gates.push(gate);

let holdTimer = 0;

/** Whether the sheet is there to be found (the visitor defended, and the aftermath has come). */
export const letterThere = (local = localProgress('city')) => encounter.outcome === 'blocked' && local >= LETTER.from;

/** Called every frame by the city world: the gate and the prompt follow the state. */
export function updateLetter() {
  const local = localProgress('city');
  // only the defended outcome has a letter; otherwise nothing waits here
  gate.open = encounter.outcome !== 'blocked' || letter.invited;
  // (it can be picked up as soon as the street is clear again after the fight: the fight's own playback ends there, no scroll needed)
  const waiting = !gate.open && local >= LETTER.from + 0.04;
  const want = waiting ? (letter.read ? 'invite' : 'letter') : null;
  const now = story.getState().prompt;
  if (want !== now && (now === null || now === 'letter' || now === 'invite')) story.setState({ prompt: want });
}

/** The invitation has been typed in full: after a moment to read it, the story goes on. */
export function invitationTyped() {
  if (!letter.read || letter.invited) return;
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    letter.invited = true;
    updateLetter();
    // the page may already be scrolled past the wait: carry on from where it is, without another scroll
    readScroll();
  }, LETTER.hold);
}

/** SKIP DIALOGUE: the invitation is taken as said, at once, and goes; the story may go on. */
export function skipInvitation() {
  if (!letter.read || letter.invited) return;
  window.clearTimeout(holdTimer);
  letter.skipped = true;
  letter.invited = true;
  updateLetter();
  readScroll();
}

export function resetLetter() {
  window.clearTimeout(holdTimer);
  letter.skipped = false;
  letter.open = false;
  letter.read = false;
  letter.invited = false;
  letter.over = false;
  gate.open = true;
  const p = story.getState().prompt;
  if (p === 'letter' || p === 'invite') story.setState({ prompt: null });
}

const ray = new Raycaster();
const ndc = new Vector2();

/** Whether a point on the page (CSS px) is over the sheet on the pavement. */
export function pickLetter(clientX: number, clientY: number) {
  const { mesh, camera } = letter;
  if (!mesh || !camera || !mesh.visible) return false;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // a forgiving target: the ball is small on screen, so its bounding sphere, a little enlarged, counts
  mesh.geometry.computeBoundingSphere();
  const s = mesh.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
  s.radius *= 1.8;
  return ray.ray.intersectsSphere(s);
}

const at = new Vector3();
const edge = new Vector3();

/** Where the sheet lies on the page: its centre and its size across (CSS px), for the reveal to lift it from there. */
export function letterSpot() {
  const { mesh, camera } = letter;
  if (!mesh || !camera) return undefined;
  mesh.geometry.computeBoundingSphere();
  const s = mesh.geometry.boundingSphere!;
  mesh.updateWorldMatrix(true, false);
  at.copy(s.center).applyMatrix4(mesh.matrixWorld);
  const r = s.radius * mesh.matrixWorld.getMaxScaleOnAxis();
  edge.copy(at).project(camera);
  const x = ((edge.x + 1) / 2) * window.innerWidth;
  const y = ((1 - edge.y) / 2) * window.innerHeight;
  // its size: the projected distance to a point one radius up from the centre, doubled
  edge.copy(at).setY(at.y + r).project(camera);
  const size = 2 * Math.abs(((1 - edge.y) / 2) * window.innerHeight - y);
  return { x, y, size: Math.max(12, size) };
}
