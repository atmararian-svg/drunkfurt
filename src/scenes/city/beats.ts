/**
 * Local progress of the encounter's beats in Episode 2.
 *  noticed → walks (strangerMoves) → stops in front of you (stop) → squares up
 *  and holds your eye (confront) → winds up (cock) → commits (commit: slow
 *  motion starts) → DEFEND (gate) → the block and the counter, under ink (cut)
 *  → aftermath.
 */
export const BEAT = {
  noticed: 0.56,
  strangerMoves: 0.6,
  stop: 0.735,
  confront: 0.74,
  cock: 0.8,
  commit: 0.822,
  gate: 0.83,
  /** The camera cuts away here (under the ink of the fight). */
  cut: 0.85,
  aftermath: 0.905,
} as const;

/**
 * Knockout sequence (you did not block), in seconds of the fight's own clock
 * after the blow lands. The whole sequence is spread over gate → aftermath.
 */
export const KO = {
  snap: 0.12,
  fallFrom: 0.35,
  fallTo: 1.25,
  dark: 1.6,
  resolve: 2.6,
} as const;

/**
 * You defended: the camera steps back out of your eyes to a third person's view, behind you and
 * to one side, and the fight is played in full (fight.ts): your flurry, the uppercut, him on his
 * back. Then the camera comes back into your eyes and the story goes on. Seconds of the fight's
 * own clock after the press (spread over gate → aftermath).
 */
export const BLOCK = {
  /** The camera is out of your eyes by here (it starts at the press). */
  out: 1.0,
  /** The fight's clip starts (his knife hold eases into his guard before it). */
  fight: 0.45,
  /** BAM: the first blow of the flurry (clip 0.70). */
  hit1: 1.15,
  /** POW: the uppercut (clip 3.00). */
  hit2: 3.45,
  /** He is on the pavement (clip 3.82). */
  land: 4.27,
  /** The camera comes back into your eyes over this stretch. */
  backFrom: 5.05,
  backTo: 6.25,
  resolve: 6.5,
} as const;
