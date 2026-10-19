import { useMemo } from 'react';
import { BackSide, Color, CylinderGeometry, ExtrudeGeometry, Material, MeshBasicMaterial, Shape } from 'three';
import { GeoBatch, compose } from '../../core/geometry';
import { mulberry32 } from '../../core/math';
import * as tex from './cityTextures';

/** A rounded polygon footprint extruded upwards (height along +y), UVs in metres. */
function tower(points: [number, number][], height: number, radius: number, tileW = 40, tileH = 80) {
  const s = new Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const a = [p[0] + (prev[0] - p[0]) * 0.15, p[1] + (prev[1] - p[1]) * 0.15];
    const c = [p[0] + (next[0] - p[0]) * 0.15, p[1] + (next[1] - p[1]) * 0.15];
    if (i === 0) s.moveTo(a[0], a[1]);
    else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p[0], p[1], c[0], c[1]);
  }
  s.closePath();
  void radius;
  const g = new ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  // wrap the window texture around: u by angle-ish distance, v by height
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / tileW, pos.getY(i) / tileH);
  return g;
}

const rect = (w: number, d: number): [number, number][] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const tri = (side: number): [number, number][] => {
  const r = side / Math.sqrt(3);
  return [0, 1, 2].map((k) => [Math.cos(-Math.PI / 2 + (k * Math.PI * 2) / 3) * r, Math.sin(-Math.PI / 2 + (k * Math.PI * 2) / 3) * r]);
};

/**
 * The banking district at the end of the boulevard, as silhouettes: you know
 * Frankfurt by these shapes, not by their window counts. Positions are composed
 * for the view down the street rather than surveyed.
 */
export function Skyline() {
  const { parts, mats, sky } = useMemo(() => {
    const b = new GeoBatch();
    const at = (x: number, z: number) => (g: ReturnType<typeof tower>) => g.translate(x, -0.2, z);
    // Commerzbank Tower: rounded triangle, stepped crown, mast
    b.add('cb', at(18, -820)(tower(tri(62), 250, 6)));
    b.add('cbCrown', at(18, -820)(tower(tri(54), 18, 5)).translate(0, 250, 0));
    b.add('dark', new CylinderGeometry(0.9, 1.6, 48, 6), compose([18, 290, -820]));
    // Main Tower: cylinder beside a slab, antenna
    b.add('main', at(-38, -760)(tower([[0, -20], [14, -14], [20, 0], [14, 14], [0, 20], [-14, 14], [-20, 0], [-14, -14]], 200, 4)));
    b.add('mainSlab', at(-62, -755)(tower(rect(26, 44), 175, 3)));
    b.add('dark', new CylinderGeometry(0.5, 1.2, 46, 6), compose([-38, 223, -760]));
    // Deutsche Bank twins, set at an angle to each other
    b.add('twin', at(58, -700)(tower(rect(34, 22), 155, 2)).rotateY(0.0));
    b.add('twin', tower(rect(34, 22), 155, 2).rotateY(0.35).translate(84, -0.2, -715));
    // a slab with a feather crown (Westend), and a tower with an inverted-pyramid top (Trianon-like)
    b.add('slab', at(-92, -880)(tower(rect(40, 40), 205, 3)));
    for (let k = 0; k < 9; k++) b.box('dark', [1.2, 26 - Math.abs(k - 4) * 4, 1.2], [-108 + k * 4, 205 + (26 - Math.abs(k - 4) * 4) / 2, -862]);
    b.add('slab', at(106, -790)(tower(tri(48), 175, 4)));
    b.add('dark', new CylinderGeometry(0.1, 26, 26, 3), compose([106, 188, -790], [Math.PI, 0.5, 0]));
    // lower towers and the city mass at their feet
    const rnd = mulberry32(5);
    for (let i = 0; i < 14; i++) {
      const x = -150 + i * 22 + rnd() * 10;
      const h = 55 + rnd() * 70;
      b.add(i % 2 ? 'low' : 'slab', at(x, -640 - rnd() * 150)(tower(rect(22 + rnd() * 16, 22 + rnd() * 10), h, 2)));
    }
    const tint = (c: string, k: number) => new Color(c).multiplyScalar(k);
    const basic = (map: ReturnType<typeof tex.towerWindows> | null, color: Color): Material =>
      new MeshBasicMaterial({ map, color, fog: false });
    const mats: Record<string, Material> = {
      cb: basic(tex.towerWindows(1, 0.1), tint('#ffffff', 0.85)),
      // the crown's sky gardens glow yellow at night
      cbCrown: basic(tex.towerWindows(2, 0.55, true), tint('#ffffff', 1.25)),
      main: basic(tex.towerWindows(3, 0.14), tint('#ffffff', 0.85)),
      mainSlab: basic(tex.towerWindows(4, 0.08), tint('#ffffff', 0.75)),
      twin: basic(tex.towerWindows(5, 0.12), tint('#ffffff', 0.8)),
      slab: basic(tex.towerWindows(6, 0.07), tint('#ffffff', 0.7)),
      low: basic(tex.towerWindows(7, 0.05), tint('#ffffff', 0.6)),
      dark: basic(null, tint('#16171a', 1)),
    };
    const sky = new MeshBasicMaterial({ map: tex.citySky(), side: BackSide, fog: false, depthWrite: false });
    return { parts: b.build(), mats, sky };
  }, []);
  return (
    <group>
      <mesh material={sky} renderOrder={-1}>
        <sphereGeometry args={[1100, 32, 16]} />
      </mesh>
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mats[key]} />
      ))}
    </group>
  );
}
