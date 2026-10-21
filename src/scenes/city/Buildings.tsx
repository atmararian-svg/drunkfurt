import { useMemo } from 'react';
import { BoxGeometry, ExtrudeGeometry, Path, Shape } from 'three';
import { GeoBatch, compose } from '../../core/geometry';
import { mulberry32 } from '../../core/math';
import { cityMaterials } from './cityMaterials';
import { CROSS, PORTAL, SIDE_STREETS, STATION_FACE_Z, STREET } from './layout';

const TILE_W = 12; // metres per facade texture repeat (4 bays)
const FLOOR = 3.4;
const GROUND = 4.2;
const SHOP_W = 80; // metres per shopfront texture repeat (10 shops)
const BLOCK_DEPTH = 16; // metres from the boulevard front to the back of its blocks

/** Box with UVs scaled so `tileW`×`tileH` metres map to one texture repeat on every face. */
function facadeBox(w: number, h: number, d: number, tileW: number, tileH: number) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  // face order: +x, -x, +y, -y, +z, -z; 4 vertices each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tileW, (uv.getY(i) * dims[f][1]) / tileH);
    }
  return g;
}

/** Mansard roof: a trapezoid section extruded along the block. */
function mansard(depth: number, len: number, h: number) {
  const s = new Shape();
  const inset = 1.6;
  s.moveTo(0, 0);
  s.lineTo(depth, 0);
  s.lineTo(depth - inset * 0.6, h);
  s.lineTo(inset, h);
  s.lineTo(0, 0);
  const g = new ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  // UVs in metres / 3 so the slate courses keep their scale
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
  return g;
}

interface Block {
  side: -1 | 1;
  z0: number;
  z1: number;
  floors: number;
  variant: number;
}

/** Fronts facing the boulevard, block by block, with gaps for the side streets. */
function planBlocks() {
  const rnd = mulberry32(2024);
  const out: Block[] = [];
  for (const side of [-1, 1] as const) {
    let z: number = STREET.z0;
    while (z > STREET.z1) {
      const gap = SIDE_STREETS.find(([a, b]) => z <= a && z > b);
      if (gap) {
        z = gap[1];
        continue;
      }
      let w = 11 + Math.floor(rnd() * 8);
      const next = SIDE_STREETS.find(([a]) => a < z && a > z - w);
      if (next) w = z - next[0];
      out.push({ side, z0: z, z1: z - w, floors: 4 + Math.floor(rnd() * 3), variant: Math.floor(rnd() * 4) });
      z -= w;
    }
  }
  return out;
}

function addBuilding(b: GeoBatch, x0: number, x1: number, z0: number, z1: number, floors: number, variant: number, frontAxis: 'x' | 'z', rnd: () => number, shops = true) {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const upperH = floors * FLOOR;
  // a hair out of true, like a hand-drawn building
  const lean: [number, number, number] = [(rnd() - 0.5) * 0.006, 0, (rnd() - 0.5) * 0.006];
  b.add(shops ? `shops${variant % 2}` : 'plaster', facadeBox(w, GROUND, d, SHOP_W, GROUND), compose([cx, GROUND / 2, cz], lean));
  b.add(`facade${variant}`, facadeBox(w, upperH, d, TILE_W, (FLOOR * 5)), compose([cx, GROUND + upperH / 2, cz], lean));
  const top = GROUND + upperH;
  // cornices: they stand out from the front and the back, not past the ends along the street, where
  // the next block's cornice continues them (overhanging there, two cornices at the same height
  // overlapped in the same planes at every junction and flickered)
  const along = frontAxis === 'x' ? [0.7, 0] : [0, 0.7];
  b.box('cornice', [w + along[0], 0.45, d + along[1]], [cx, top + 0.22, cz], lean);
  b.box('cornice', [w + along[0] * 0.57, 0.25, d + along[1] * 0.57], [cx, GROUND + 0.1, cz], lean);
  // mansard roof along the street-facing length
  const roofH = 3 + rnd() * 1.4;
  if (frontAxis === 'x') {
    // the roof slopes up from the street front (x0) towards the back
    const g = mansard(w, d, roofH);
    if (x1 > x0) b.add('slate', g, compose([x0, top + 0.45, Math.min(z0, z1)]));
    else b.add('slate', g, compose([x0, top + 0.45, Math.max(z0, z1)], [0, Math.PI, 0]));
  } else {
    const g = mansard(d, w, roofH);
    b.add('slate', g, compose([Math.min(x0, x1), top + 0.45, Math.max(z0, z1)], [0, Math.PI / 2, 0]));
  }
  // chimneys
  for (let k = 0; k < 2; k++)
    if (rnd() < 0.7) b.box('plaster', [0.7, 2.2, 0.9], [cx + (rnd() - 0.5) * w * 0.6, top + roofH + 0.4, cz + (rnd() - 0.5) * d * 0.6]);
}

function stationFront(b: GeoBatch) {
  // the station's head building, seen from inside its main portal
  const s = new Shape();
  s.moveTo(-40, 0);
  s.lineTo(44, 0);
  s.lineTo(44, 24);
  s.lineTo(-40, 24);
  s.lineTo(-40, 0);
  const hole = new Path();
  const { x, halfWidth: hw, height } = PORTAL;
  const spring = height - hw;
  hole.moveTo(x - hw, 0);
  hole.lineTo(x + hw, 0);
  hole.lineTo(x + hw, spring);
  hole.absarc(x, spring, hw, 0, Math.PI, false);
  hole.lineTo(x - hw, 0);
  s.holes.push(hole);
  const g = new ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false, curveSegments: 24 });
  b.add('stationStone', g, compose([0, 0, STATION_FACE_Z]));
  // interior of the station hall behind the portal: dark walls and ceiling
  b.box('stationFloor', [30, 0.4, 16], [1.5, 13, STATION_FACE_Z + 9]);
  b.box('stationStone', [0.6, 13, 16], [PORTAL.x - 9, 6.5, STATION_FACE_Z + 9]);
  b.box('stationStone', [0.6, 13, 16], [PORTAL.x + 9, 6.5, STATION_FACE_Z + 9]);
  // pilasters either side of the portal
  for (const sgn of [-1, 1]) b.box('stationStone', [1.2, 14, 0.8], [x + sgn * (hw + 1.4), 7, STATION_FACE_Z - 0.3]);
  b.box('cornice', [84, 0.8, 1.2], [2, 15, STATION_FACE_Z - 0.2]);
}

/**
 * The city fabric: the station front, the blocks around the square and the two
 * long rows of 19th-century houses down the boulevard.
 */
export function Buildings() {
  const m = cityMaterials();
  const parts = useMemo(() => {
    const b = new GeoBatch();
    const rnd = mulberry32(77);
    stationFront(b);
    // blocks facing the boulevard (front faces at x = ±9.5, 16 m deep)
    const blocks = planBlocks();
    for (const k of blocks) {
      const x0 = k.side * STREET.curbOuter;
      const x1 = k.side * (STREET.curbOuter + BLOCK_DEPTH);
      addBuilding(b, x0, x1, k.z0, k.z1, k.floors, k.variant, 'x', rnd);
    }
    // corner blocks facing the square across the cross street. They stand behind the first
    // boulevard blocks, not in them: these used to start at the kerb line too, so their fronts,
    // shopfronts and cornices lay in the same planes as the boulevard blocks' (x = ±9.5) over
    // z -25…-41, and the two surfaces z-fought, flickering right ahead of the camera as the
    // chapter opened. Their roofline differs from the neighbour's, so no cornice is coplanar either.
    for (const side of [-1, 1] as const) {
      const neighbour = blocks.find((k) => k.side === side)!;
      const floors = neighbour.floors === 5 ? 6 : 5;
      addBuilding(b, side * (STREET.curbOuter + BLOCK_DEPTH), side * 70, CROSS.z0 - 3, CROSS.z0 - 19, floors, side > 0 ? 2 : 1, 'z', rnd);
      // the square's flanks
      addBuilding(b, side * 31, side * 46, STATION_FACE_Z - 1, CROSS.z1 + 0.5, 4, side > 0 ? 3 : 0, 'z', rnd, false);
    }
    // the city goes on past the boulevard, lower, towards the towers
    for (let i = 0; i < 18; i++) {
      const x = -80 + i * 10 + rnd() * 4;
      const z = -440 - rnd() * 140;
      addBuilding(b, x, x + 8 + rnd() * 6, z, z - 12, 3 + Math.floor(rnd() * 3), Math.floor(rnd() * 4), 'z', rnd, false);
    }
    return b.build();
  }, []);
  const mat = (key: string) => {
    if (key.startsWith('facade')) return m.facade[Number(key.slice(6))];
    if (key.startsWith('shops')) return m.shops[Number(key.slice(5))];
    return (m as unknown as Record<string, never>)[key];
  };
  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mat(key)} castShadow receiveShadow />
      ))}
    </group>
  );
}
