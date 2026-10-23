import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';
import { mulberry32 } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { input } from '../../player/input';
import { letter, letterThere, pickLetter } from './letter';

/** Where the sheet lies: on the pavement between you and him, by his coat (the street's frame, metres). */
export const LETTER_SPOT = { x: 6.42, y: 0.045, z: -35.15 };

/**
 * The crumpled letter on the pavement: a ball of paper (a subdivided
 * icosahedron pushed in and out by a seeded noise, flat shaded, so its facets
 * read as creases), printed like the rest of the street. It is there from the
 * aftermath; picked up (the reveal opens) it leaves the pavement, and once
 * read it is gone (the reveal drops it out of the page). The pointer over it lifts it a little in tone and shows the hand.
 */
function crumple() {
  const g = new IcosahedronGeometry(0.075, 2);
  const p = g.getAttribute('position');
  const rnd = mulberry32(17);
  // the same displacement for the same point (the geometry repeats vertices per face)
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let s = seen.get(k);
    if (s === undefined) seen.set(k, (s = 0.62 + rnd() * 0.55));
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.78, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

export function LetterProp({ active }: { active: boolean }) {
  const camera = useThree((s) => s.camera);
  const mesh = useMemo(() => {
    const mat = new MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.9, flatShading: true, emissive: new Color('#000000') });
    mat.userData.comic = { halftone: 0.4 };
    const m = new Mesh(crumple(), mat);
    m.name = 'letter';
    m.position.set(LETTER_SPOT.x, LETTER_SPOT.y, LETTER_SPOT.z);
    m.rotation.set(0.4, 1.1, 0.2);
    m.visible = false;
    return m;
  }, []);
  useEffect(() => {
    letter.mesh = mesh;
    letter.camera = camera;
    return () => {
      if (letter.mesh === mesh) letter.mesh = null;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    };
  }, [mesh, camera]);

  useFrame(() => {
    // (read, it is gone for good: the reveal crumpled it and dropped it out of the page)
    const show = active && letterThere(localProgress('city')) && !letter.open && !letter.read;
    mesh.visible = show;
    if (!show) {
      if (letter.over) {
        letter.over = false;
        document.documentElement.classList.remove('is-over-letter');
      }
      return;
    }
    const p = input.pointer;
    const over = p.active && pickLetter(((p.x + 1) / 2) * window.innerWidth, ((p.y + 1) / 2) * window.innerHeight);
    if (over !== letter.over) {
      letter.over = over;
      document.documentElement.classList.toggle('is-over-letter', over);
    }
    (mesh.material as MeshStandardMaterial).emissive.setScalar(over ? 0.22 : 0.06);
  });

  return <primitive object={mesh} />;
}
