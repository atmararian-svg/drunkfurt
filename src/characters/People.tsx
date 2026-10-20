import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, Group, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { playerState } from '../player/playerState';
import { animatePerson, createPerson } from './animate';
import { Crowd, stepCrowd, validateCrowd } from './crowd';

interface Props {
  crowd: Crowd;
  /** Episode-local scroll progress, for scroll-driven people. */
  scroll: () => number;
  /** Time scale (1 = normal); the city's slow-motion climax runs everyone at 0.1. */
  timeScale?: () => number;
  /** Called after each step, e.g. to feed positions to a pigeon. */
  onStep?: (c: Crowd) => void;
  /** Steps the simulation; set false while the world is preloading out of sight. */
  enabled?: boolean;
}

/**
 * Renders a crowd simulated in characters/crowd.ts: illustrated figures
 * (figure.ts) posed by what they are doing (pose.ts) at the positions the
 * simulation gives them.
 */
export function People({ crowd, scroll, timeScale, onStep, enabled = true }: Props) {
  const { figures, root } = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    mat.userData.comic = { halftone: 0.6 };
    const screen = new MeshBasicMaterial({ color: new Color('#dfe6ee').multiplyScalar(1.5) });
    const root = new Group();
    const figures = crowd.people.map((p) => {
      const fig = createPerson(p, mat, screen);
      root.add(fig.j.root);
      return fig;
    });
    return { figures, root };
  }, [crowd]);
  const clock = useMemo(() => ({ t: 0 }), []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const problems = validateCrowd(crowd.people, crowd.nav);
    if (problems.length) console.warn('[crowd] route problems:\n' + problems.join('\n'));
  }, [crowd]);

  useFrame((_, rawDt) => {
    if (!enabled) return;
    const dt = Math.min(rawDt, 0.05) * (timeScale ? timeScale() : 1);
    clock.t += dt;
    const t = clock.t;
    stepCrowd(crowd, dt, scroll(), playerState.position);
    onStep?.(crowd);
    crowd.state.forEach((st, i) => animatePerson(figures[i], crowd.people[i], st, t, dt));
  });

  return <primitive object={root} />;
}

