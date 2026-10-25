/**
 * A touch device (a phone, a tablet: no hovering pointer). Read once: the
 * page's words for what to do follow it (TAP instead of PRESS D or CLICK).
 */
export const TOUCH = !!window.matchMedia?.('(hover: none), (pointer: coarse)').matches;
