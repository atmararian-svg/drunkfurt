import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { GeoBatch, Vec2, clipY, profileCap } from '../../core/geometry';
import { materials } from '../../materials/materials';
import { HALL, HALL_CX, HALL_OFFSETS, HALL_SPAN, RAIL_TOP, TRACKS } from './layout';

/**
 * Barrel-vaulted train shed in the spirit of the Hbf's 1888 halls: lattice
 * arch ribs springing from masonry piers, longitudinal purlins, and a glazed
 * vault. Three halls side by side give depth beyond the tracks we use.
 */
const A = HALL_SPAN / 2;
const SEGS = 36;

/** Point on the outer (or inset) arch at angle θ ∈ [0, π]. */
function arch(theta: number, inset: number, cx: number): [number, number] {
  return [cx + (A - inset) * Math.cos(theta), HALL.springY + (HALL.rise - inset) * Math.sin(theta)];
}
const depth = (theta: number) => 0.28 + 1.0 * Math.pow(Math.sin(theta), 0.6);

const ribZ: number[] = [];
for (let z = HALL.z0; z <= HALL.z1 + 0.01; z += HALL.ribSpacing) ribZ.push(z);

function buildTrussMatrices() {
  const out: Matrix4[] = [];
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const add = (a: Vector3, b: Vector3, w: number, h: number) => {
    const d = new Vector3().subVectors(b, a);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    out.push(new Matrix4().compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), q, new Vector3(w, len, h)));
  };
  for (const off of HALL_OFFSETS) {
    const cx = HALL_CX + off;
    for (const z of ribZ) {
      let prevO: Vector3 | null = null;
      let prevI: Vector3 | null = null;
      for (let i = 0; i <= SEGS; i++) {
        const th = (i / SEGS) * Math.PI;
        const [ox, oy] = arch(th, 0, cx);
        const [ix, iy] = arch(th, depth(th), cx);
        const o = new Vector3(ox, oy, z);
        const inn = new Vector3(ix, iy, z);
        // two clean chords per rib: the arch reads as a drawn double line, not a lattice
        if (prevO && prevI) {
          add(prevO, o, 0.22, 0.34);
          add(prevI, inn, 0.13, 0.22);
        }
        prevO = o;
        prevI = inn;
      }
    }
  }
  return out;
}

function arcSurface(t0: number, t1: number, segs: number, z0: number, z1: number, cx: number, inset: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const th = t0 + ((t1 - t0) * i) / segs;
    const [x, y] = arch(th, inset, cx);
    // inward-facing normal (towards the hall interior)
    const nx = -Math.cos(th) / A;
    const ny = -Math.sin(th) / HALL.rise;
    const l = Math.hypot(nx, ny);
    for (const z of [z0, z1]) {
      pos.push(x, y, z);
      nor.push(nx / l, ny / l, 0);
      uv.push((th * HALL.rise) / 3.2, z / 4.7);
    }
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function buildStatic() {
  const b = new GeoBatch();
  const zMid = (HALL.z0 + HALL.z1) / 2;
  const zLen = HALL.z1 - HALL.z0;
  const glassFrom = 0.42;
  const pierXs = new Set<number>();

  for (const off of HALL_OFFSETS) {
    const cx = HALL_CX + off;
    pierXs.add(HALL.x0 + off);
    pierXs.add(HALL.x1 + off);

    // roof skin: sheet near the springing, glazing across the vault
    b.add('roofSheet', arcSurface(0, glassFrom, 6, HALL.z0, HALL.z1, cx, -0.06));
    b.add('roofSheet', arcSurface(Math.PI - glassFrom, Math.PI, 6, HALL.z0, HALL.z1, cx, -0.06));
    b.add('roofGlass', arcSurface(glassFrom, Math.PI - glassFrom, 36, HALL.z0, HALL.z1, cx, -0.04));

    // purlins
    for (let k = 1; k < 8; k++) {
      const th = (k / 8) * Math.PI;
      const [x, y] = arch(th, 0.1, cx);
      b.box('steel', [0.16, 0.34, zLen], [x, y - 0.1, zMid], [0, 0, th - Math.PI / 2]);
    }
    // ridge walkway / lantern spine
    b.box('steel', [1.4, 0.5, zLen], [cx, HALL.springY + HALL.rise - 0.4, zMid]);

    // open-end gable apron (glazed screen down to ~11 m)
    const outline: Vec2[] = [];
    for (let i = 0; i <= 48; i++) outline.push(arch((i / 48) * Math.PI, 0, cx));
    const apron = clipY(outline, 12.5, 'above');
    b.add('roofGlass', profileCap(apron, HALL.z1 + 0.3, 1));
    b.add('roofGlass', profileCap(apron, HALL.z1 + 0.3, -1));
    b.box('steel', [apron[apron.length - 1][0] - apron[0][0], 0.6, 0.5], [cx, 12.5, HALL.z1 + 0.3]);

    // pendant lamps hanging from the vault over the track zones
    for (const z of ribZ) {
      if (z < -100) continue;
      for (const lx of [cx - 7.5, cx + 7.5]) {
        const [, top] = arch(Math.acos((lx - cx) / A), depth(Math.acos((lx - cx) / A)), cx);
        const lampY = 11.5;
        b.box('steel', [0.02, top - lampY, 0.02], [lx, (top + lampY) / 2, z + 4.7]);
        b.cylinder('fixture', 0.42, 0.22, [lx, lampY, z + 4.7], undefined, 16);
        b.cylinder('lampLensDim', 0.36, 0.02, [lx, lampY - 0.12, z + 4.7], undefined, 16);
      }
    }
  }

  // piers between halls
  for (const x of pierXs)
    for (const z of ribZ) {
      b.box('pier', [1.0, HALL.springY, 1.2], [x, HALL.springY / 2 - 0.2, z]);
      b.box('pier', [1.3, 0.35, 1.5], [x, HALL.springY - 0.1, z]);
    }

  // catenary over the three tracks of this hall
  const wireY = RAIL_TOP + 5.35;
  const messY = RAIL_TOP + 6.55;
  for (const tx of [TRACKS.a, TRACKS.b, TRACKS.c]) {
    b.box('catenary', [0.014, 0.014, zLen], [tx, wireY, zMid]);
    b.box('catenary', [0.012, 0.012, zLen], [tx, messY, zMid]);
  }
  for (const z of ribZ.filter((_, i) => i % 2 === 0)) {
    // cross-span tube carrying the catenary between the piers (every other rib)
    b.cylinder('catenary', 0.04, HALL_SPAN, [HALL_CX, messY + 0.9, z], [0, 0, Math.PI / 2], 8);
    for (const tx of [TRACKS.a, TRACKS.b, TRACKS.c])
      b.box('catenary', [0.02, 0.9, 0.02], [tx, messY + 0.45, z]);
  }
  return b.build();
}

export function Hall() {
  const m = materials();
  const truss = useMemo(buildTrussMatrices, []);
  const parts = useMemo(buildStatic, []);
  const ref = useRef<InstancedMesh>(null);
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    truss.forEach((mat, i) => mesh.setMatrixAt(i, mat));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [truss]);

  return (
    <group>
      <instancedMesh ref={ref} args={[unitBox, m.steel, truss.length]} frustumCulled={false} />
      {parts.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={m[key as keyof typeof m]}
          receiveShadow={key === 'pier'}
        />
      ))}
    </group>
  );
}
