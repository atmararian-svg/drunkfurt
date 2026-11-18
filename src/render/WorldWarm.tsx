import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { FogExp2, Group, HalfFloatType, Material, Mesh, Object3D, Scene, Texture, WebGLRenderTarget } from 'three';
import { chapterTurn } from '../core/timeline';
import { DIAG, diagNote } from '../ui/diag';
import { stylize } from './Stylizer';

/**
 * A world made ready for the graphics card before it is first seen: its shaders compiled with its own
 * lights and its fog, for both the screen and the linear target the frame is drawn into (`compileAsync`:
 * issued at once and compiled by the card in the background, KHR_parallel_shader_compile; nothing on the
 * page waits for them), and its textures uploaded. Until then the world is not drawn, so its first frame
 * never stops the page on a compile.
 *
 * On a device that had never shown the page, every shader is compiled from nothing: they were compiled
 * three times over at the worst moments (under the preloader all the mounted worlds drawn at once, with
 * all their lights together, so for none of them; again as the station came in after the sound choice;
 * and the street's at the turn into chapter 2 when the warm-up ahead, held back until 9 s after the
 * chapter's card, had not got there). Now each world is warmed as soon as it is in, the preloader waits
 * for the first two (`worldsWarm`, at most WAIT_MS), and the rest are warmed long before their turn.
 *
 * Never while the page reads its own picture back (the chapter transitions, the hand-over's pixels):
 * that read waits for every compile still under way.
 */
const WARM_RT = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
const WARM_FOG = new FogExp2('#000000', 0.01);
/** A world not warm this long after it is to be seen is shown all the same (ms). */
const SHOW_ANYWAY_MS = 15000;
/** A world still to come is warmed this long after it is mounted (ms). */
const AHEAD_DELAY_MS = 3000;

const pending = new Set<string>();
const done = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Resolves once every world mounted now has been warmed (or after `ms`). */
export function worldsWarm(ms: number) {
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(finish, ms);
    function finish() {
      window.clearTimeout(t);
      listeners.delete(check);
      resolve();
    }
    function check() {
      if (pending.size === 0 && done.size > 0) finish();
    }
    listeners.add(check);
    check();
  });
}

const reading = () => chapterTurn.busy || document.hidden || !!document.querySelector('.pixel-reveal, .chapter-out');

export function WorldWarm({ id, shown }: { id: string; shown: boolean }) {
  const { gl, camera } = useThree();
  const marker = useRef<Object3D>(null);
  const warm = useRef(false);
  const since = useRef(0);
  const shownAtMount = useRef(shown);

  useEffect(() => {
    let alive = true;
    pending.add(id);
    const t0 = performance.now();
    const settle = () => {
      warm.current = true;
      pending.delete(id);
      done.add(id);
      if (DIAG) diagNote(`world warm: ${id} in ${(performance.now() - t0).toFixed(0)} ms (programs ${gl.info.programs?.length})`);
      changed();
    };
    const run = async () => {
      // a world still to come waits a moment first: it is mounted at a chapter's turn, as the chapter's card
      // comes in, and its textures going up to the card are better not at the same moment
      // (under the preloader: at once)
      if (!shownAtMount.current && !document.documentElement.classList.contains('is-preloading')) await new Promise((r) => window.setTimeout(r, AHEAD_DELAY_MS));
      // (not while the picture is read back)
      while (alive && reading()) await new Promise((r) => window.setTimeout(r, 200));
      const root = marker.current?.parent as (Group & { fog?: FogExp2 | null }) | undefined;
      if (!alive || !root) return;
      stylize(root, gl.getPixelRatio());
      // its textures up to the card now, not on the frame that first shows them
      const seen = new Set<Texture>();
      root.traverse((o) => {
        const mats = ((o as Mesh).material ? (Array.isArray((o as Mesh).material) ? (o as Mesh).material : [(o as Mesh).material]) : []) as Material[];
        for (const m of mats) for (const v of Object.values(m)) if (v && (v as Texture).isTexture && !seen.has(v as Texture)) seen.add(v as Texture);
      });
      seen.forEach((t) => {
        try {
          gl.initTexture(t);
        } catch {
          // (a texture still without its image: it goes up on first use)
        }
      });
      // its shaders, for the linear target the frame is drawn into and for the screen
      for (const target of [WARM_RT, null]) {
        if (!alive) return;
        while (alive && reading()) await new Promise((r) => window.setTimeout(r, 200));
        const wasVisible = root.visible;
        const prevTarget = gl.getRenderTarget();
        let job: Promise<unknown> = Promise.resolve();
        try {
          root.visible = true;
          root.fog = WARM_FOG;
          gl.setRenderTarget(target);
          job = gl.compileAsync(root, camera, root as unknown as Scene);
        } catch (err) {
          console.warn('[warm]', err);
        } finally {
          gl.setRenderTarget(prevTarget);
          root.fog = null;
          root.visible = wasVisible;
        }
        await job;
      }
      if (alive) settle();
    };
    void run();
    return () => {
      alive = false;
      pending.delete(id);
      done.delete(id);
      changed();
    };
  }, [id, gl, camera]);

  // drawn once warm (or, if that takes too long, all the same)
  useFrame(() => {
    const root = marker.current?.parent;
    if (!root) return;
    if (shown && !since.current) since.current = performance.now();
    if (!shown) since.current = 0;
    // (into a chapter by its turn before it is warm, as on a very slow card: shown at once, as before)
    const want = shown && (warm.current || chapterTurn.busy || performance.now() - since.current > SHOW_ANYWAY_MS);
    if (root.visible !== want) root.visible = want;
  });
  return <object3D ref={marker} />;
}
