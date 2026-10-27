/**
 * A touch device (a phone, a tablet: no hovering pointer). Read once: the
 * page's words for what to do follow it (TAP instead of PRESS D or CLICK).
 */
export const TOUCH = !!window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

/**
 * A phone: a touch screen under 600 px on its short side (either way up). Its
 * layout differs (the chapter selector along the bottom, the sound switch top
 * centre); the page carries it as the class `is-phone` on <html>, kept up to
 * date as the window turns or resizes.
 */
export const isPhone = () => TOUCH && Math.min(window.innerWidth, window.innerHeight) < 600;

const mark = () => document.documentElement.classList.toggle('is-phone', isPhone());
mark();
window.addEventListener('resize', mark);
