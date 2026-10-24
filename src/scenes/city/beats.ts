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
 * You defended: ACTION goes first, then (from `veil`) the street breaks into
 * pixels and darkens until `dark`; only in that dark do the two hits land
 * (printed as BAM and POW), with room between them, and it opens on him lying
 * there. Seconds of the fight's own clock after the press (spread over
 * gate → aftermath). Unhurried on purpose: one thing after the other.
 */
export const BLOCK = {
  veil: 0.18,
  dark: 0.75,
  hit1: 1.0,
  hit2: 1.55,
  resolve: 3.0,
} as const;
