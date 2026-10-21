import { Vector3 } from 'three';

/**
 * Episode 4's room: the supplied "Surveillance room" (tools/room2glb.mjs), in
 * metres. The model's floor is at y = -2.895; the room is lifted so the floor
 * is at 0 and everything here is in that frame. The monitor wall faces +z
 * (a shallow arc of pillars, screens on arms); the operator's chair stands
 * 2.6 m in front of it, facing it.
 */
export const ROOM_LIFT = 2.895;

/** Beats, in local progress. */
export const HOME_BEAT = {
  /** the page has opened on the doorway */
  opened: 0.12,
  /** at the side of the chair */
  atChair: 0.5,
  /** down into the seat */
  seated: 0.66,
  /** the settle is over; the story waits here for the click on the screen */
  gate: 0.76,
};

/**
 * The large display that replaces the six central screens (the middle three
 * columns of the two middle rows): the same footprint, 1.69 × 0.95 m, 16:9,
 * flat, facing +z, a little in front of the arc so it clears its neighbours.
 */
export const DISPLAY = {
  centre: new Vector3(2.33, 1.64, 0.4),
  width: 1.68,
  height: 0.945,
  /** frame (bezel) width and housing depth */
  bezel: 0.035,
  depth: 0.06,
  /** facing the operator: +z, tipped 4° down towards the seat */
  tilt: (4 * Math.PI) / 180,
};

/** The screen's outward normal (unit), from the tilt. */
export const DISPLAY_NORMAL = new Vector3(0, -Math.sin(DISPLAY.tilt), Math.cos(DISPLAY.tilt));

/** Seated eye height and place in the operator's chair (seat top 0.5 m, seat 2.08–2.48 × 2.4–2.9, its back at z 3.0). */
export const SEAT_EYE = new Vector3(2.28, 1.19, 2.78);
