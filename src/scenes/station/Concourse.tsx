import { useMemo } from 'react';
import { Color, DoubleSide, MeshBasicMaterial, PlaneGeometry, ShapeGeometry, Shape } from 'three';
import { GeoBatch, Vec2, clipY, compose } from '../../core/geometry';
import { materials } from '../../materials/materials';
import { bigDepartureBoard, gableGlazing, shopfronts, stationNameSign } from '../../materials/textures';
import { CONCOURSE, HALL, HALL_CX, HALL_OFFSETS, HALL_SPAN } from './layout';

const A = HALL_SPAN / 2;
const BAND_Y0 = 7.2;
const BAND_Y1 = 9.6;

function gableShape(cx: number) {
  const pts: Vec2[] = [];
  for (let i = 0; i <= 48; i++) {
    const th = (i / 48) * Math.PI;
    pts.push([cx + A * Math.cos(th), HALL.springY + HALL.rise * Math.sin(th)]);
  }
  const clipped = clipY(pts, BAND_Y1, 'above');
  const s = new Shape();
  clipped.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new ShapeGeometry(s);
  // planar UVs across the gable
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const top = HALL.springY + HALL.rise;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) - (cx - A)) / (2 * A), (pos.getY(i) - BAND_Y1) / (top - BAND_Y1));
  return g;
}

/**
 * The head of the terminus: a transverse concourse in front of the station
 * building, with shopfronts, a glazed gable and the main departure board.
 * It is the brightest area in the scene and anchors the vanishing point.
 */
export function Concourse() {
  const m = materials();
  const zEnd = CONCOURSE.z1;
  const mats = useMemo(
    () => ({
      gable: new MeshBasicMaterial({ map: gableGlazing(), color: new Color(1, 1, 1).multiplyScalar(0.55), side: DoubleSide }),
      shops: new MeshBasicMaterial({ map: shopfronts(), color: new Color(1, 1, 1).multiplyScalar(1.6) }),
      board: new MeshBasicMaterial({ map: bigDepartureBoard(), color: new Color(1, 1, 1).multiplyScalar(1.1) }),
      name: new MeshBasicMaterial({ map: stationNameSign(), color: new Color(1, 1, 1).multiplyScalar(0.9) }),
    }),
    [],
  );
  const parts = useMemo(() => {
    const b = new GeoBatch();
    const xMin = HALL.x0 + HALL_OFFSETS[0];
    const xMax = HALL.x1 + HALL_OFFSETS[2];
    const floor = new PlaneGeometry(xMax - xMin, CONCOURSE.z0 - zEnd);
    b.add('concourseFloor', floor, compose([(xMin + xMax) / 2, 0.001, (CONCOURSE.z0 + zEnd) / 2], [-Math.PI / 2, 0, 0]));
    for (const off of HALL_OFFSETS) {
      const cx = HALL_CX + off;
      // stone band between shopfronts and gable glazing
      b.box('pier', [HALL_SPAN, BAND_Y1 - BAND_Y0, 0.8], [cx, (BAND_Y0 + BAND_Y1) / 2, zEnd]);
      b.box('steel', [HALL_SPAN, 0.25, 1.0], [cx, BAND_Y1, zEnd + 0.1]);
      // shopfront wall
      b.box('concrete', [HALL_SPAN, BAND_Y0, 0.4], [cx, BAND_Y0 / 2, zEnd - 0.3]);
    }
    // board structure
    b.box('signDark', [9.4, 2.6, 0.3], [HALL_CX, 7.2, -114]);
    b.box('steel', [0.05, 4.5, 0.05], [HALL_CX - 4, 10.7, -114]);
    b.box('steel', [0.05, 4.5, 0.05], [HALL_CX + 4, 10.7, -114]);
    return b.build();
  }, [zEnd]);
  const gables = useMemo(() => HALL_OFFSETS.map((off) => gableShape(HALL_CX + off)), []);

  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={m[key as keyof typeof m]} receiveShadow />
      ))}
      {gables.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.gable} position={[0, 0, zEnd + 0.05]} />
      ))}
      {HALL_OFFSETS.map((off) => (
        <mesh key={off} position={[HALL_CX + off, 3.3, zEnd - 0.08 + 0.3]} material={mats.shops}>
          <planeGeometry args={[HALL_SPAN - 1.2, 6.2]} />
        </mesh>
      ))}
      <mesh position={[HALL_CX, 8.4, zEnd + 0.41]} material={mats.name}>
        <planeGeometry args={[9.5, 1.48]} />
      </mesh>
      <mesh position={[HALL_CX, 7.2, -114 + 0.16]} material={mats.board}>
        <planeGeometry args={[9.2, 2.3]} />
      </mesh>
    </group>
  );
}
