import { ATTACKER_START } from './layout';

/** Where he stops: square in front of you, a little over an arm's length away. */
export const STRANGER_STOP: [number, number] = [6.55, -35.25];

/** The stranger's way from the doorway to you, along the right sidewalk (validated in tests). */
export const STRANGER_ROUTE: [number, number][] = [ATTACKER_START, [7.7, -49.5], [6.85, -40.5], STRANGER_STOP];
