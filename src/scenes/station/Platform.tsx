import { useMemo } from 'react';
import { PlaneGeometry } from 'three';
import { GeoBatch, compose } from '../../core/geometry';
import { materials } from '../../materials/materials';
import { TRACK_BED } from './layout';

interface Props {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const EDGE = 0.36;
const TILE = 2.4; // metres covered by one paving texture repeat

/**
 * Island platform at 76 cm above rail: paved surface, light coping stones with
 * a slight overhang, the white safety line and a tactile guidance strip on both
 * edges, and the recessed platform wall facing each track.
 */
function buildPlatform({ x0, x1, z0, z1 }: Props) {
  const b = new GeoBatch();
  const len = z1 - z0;
  const zm = (z0 + z1) / 2;
  const innerW = x1 - x0 - EDGE * 2;

  const top = new PlaneGeometry(innerW, len);
  const uv = top.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * innerW) / TILE, (uv.getY(i) * len) / TILE);
  b.add('platform', top, compose([(x0 + x1) / 2, 0, zm], [-Math.PI / 2, 0, 0]));

  // body of the platform (hidden mostly, gives solid sides)
  b.box('platformSide', [x1 - x0 - 0.3, -TRACK_BED - 0.02, len], [(x0 + x1) / 2, TRACK_BED / 2 - 0.01, zm]);

  for (const side of [-1, 1] as const) {
    const edgeX = side < 0 ? x0 : x1;
    const inward = -side;
    // coping stone with 6 cm overhang over the track
    b.box('platformEdge', [EDGE + 0.06, 0.16, len], [edgeX + inward * (EDGE / 2 - 0.03), -0.08 + 0.0005, zm]);
    // recessed wall under the overhang
    b.box('platformSide', [0.12, -0.16 - TRACK_BED, len], [edgeX + inward * 0.12, (TRACK_BED - 0.16) / 2, zm]);
    // tactile guidance strip and white safety line
    const tx = edgeX + inward * (EDGE + 0.5);
    const tactile = new PlaneGeometry(0.3, len);
    const tuv = tactile.getAttribute('uv');
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i), tuv.getY(i) * len * 0.5);
    b.add('tactile', tactile, compose([tx, 0.004, zm], [-Math.PI / 2, 0, 0]));
    b.add(
      'safetyLine',
      new PlaneGeometry(0.1, len),
      compose([edgeX + inward * (EDGE + 0.88), 0.004, zm], [-Math.PI / 2, 0, 0]),
    );
  }
  return b.build();
}

export function Platform(props: Props) {
  const m = materials();
  const parts = useMemo(() => buildPlatform(props), [props.x0, props.x1, props.z0, props.z1]);
  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={m[key as keyof typeof m]} receiveShadow />
      ))}
    </group>
  );
}
