/**
 * Pointer input, kept outside React. Only used for the subtle look-around:
 * the story itself is driven by scrolling.
 */
const pointer = { x: 0, y: 0, active: false };
let attached = 0;

const onMove = (e: PointerEvent) => {
  if (e.pointerType === 'touch') return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  pointer.active = true;
};
const onLeave = () => {
  pointer.active = false;
};

export const input = {
  attach() {
    if (attached++ > 0) return;
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
  },
  detach() {
    if (--attached > 0) return;
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
  },
  pointer,
};
