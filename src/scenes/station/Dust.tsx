import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three';
import { mulberry32 } from '../../core/math';
import { radialGlow } from '../../materials/textures';
import { MAST_X } from './layout';

const PER_LAMP = 90;

/** Dust drifting through the light under the nearest masts: barely there, but it gives the air volume. */
export function Dust({ lampZ }: { lampZ: number[] }) {
  const ref = useRef<Points>(null);
  const { geo, base, mat } = useMemo(() => {
    const rnd = mulberry32(77);
    const n = PER_LAMP * lampZ.length;
    const pos = new Float32Array(n * 3);
    const base = new Float32Array(n * 4);
    lampZ.forEach((z, l) => {
      for (let i = 0; i < PER_LAMP; i++) {
        const k = l * PER_LAMP + i;
        const y = 0.6 + rnd() * 4.4;
        const spread = 0.4 + (5.3 - y) * 0.5;
        base[k * 4] = MAST_X + (rnd() - 0.5) * spread * 2.6;
        base[k * 4 + 1] = y;
        base[k * 4 + 2] = z + (rnd() - 0.5) * spread * 2.2;
        base[k * 4 + 3] = rnd() * 100;
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    const mat = new PointsMaterial({
      size: 0.011,
      map: radialGlow(),
      color: new Color('#e9ecef').multiplyScalar(0.3),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    return { geo, base, mat };
  }, [lampZ]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.12;
    const p = geo.getAttribute('position') as BufferAttribute;
    const a = p.array as Float32Array;
    for (let k = 0; k < p.count; k++) {
      const s = base[k * 4 + 3];
      a[k * 3] = base[k * 4] + Math.sin(t + s) * 0.25;
      a[k * 3 + 1] = base[k * 4 + 1] + Math.sin(t * 0.7 + s * 1.3) * 0.3;
      a[k * 3 + 2] = base[k * 4 + 2] + Math.cos(t * 0.8 + s * 0.7) * 0.25;
    }
    p.needsUpdate = true;
  });

  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}
