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
 * You defended: the page goes black before anything is shown, two hits land in
 * the dark (printed as BAM! and WHAM!), and it opens on him lying there.
 * Seconds of the fight's own clock after the click (spread over gate → aftermath).
 */
export const BLOCK = {
  dark: 0.3,
  hit1: 0.42,
  hit2: 0.86,
  resolve: 2.1,
} as const;
