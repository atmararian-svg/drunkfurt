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
  /** Under ink from here until AFTERMATH once resolved. */
  cut: 0.85,
  aftermath: 0.905,
} as const;

/** Knockout sequence (you did not block), in real seconds after the fist lands. */
export const KO = {
  snap: 0.12,
  fallFrom: 0.35,
  fallTo: 1.25,
  dark: 1.6,
  resolve: 2.6,
} as const;

/** Block sequence, in real seconds after the click. */
export const BLOCK = {
  guardUp: 0.12,
  contact: 0.15,
  hitStop: 0.07,
  counter: 0.4,
  counterLands: 0.53,
  ink: 0.64,
  resolve: 2.1,
} as const;
