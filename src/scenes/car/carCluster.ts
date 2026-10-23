import { RED } from '../../ui/palette';
import { CanvasTexture, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';

/**
 * The Mercedes' instrument cluster, drawn here (no third-party graphic), in
 * the manner of an AMG cluster: black glass, thin chrome-grey rings, white
 * numerals in a wide grotesque, red accents and a red zone on the
 * tachometer. Left the tachometer (0–10 × 1000/min, red from 7), in the
 * middle the large speedometer (0–300 km/h) with the gear under its hub,
 * right the oil temperature; along the bottom the odometer, outside
 * temperature and the time. Printed on the car's own cluster screen.
 *
 * The model's cluster is a flat panel 30.8 × 10.4 cm behind the steering
 * wheel (`w206_gauges`), facing the driver and tilted back 15°. The graphic
 * goes on a plane laid 3 mm in front of it, so it sits in the dashboard and
 * is seen in perspective through the wheel, lit like a screen. The needles
 * are drawn on top, live: the tachometer from the engine's rpm, the
 * speedometer from the car's road speed. The two stay separate: revving on
 * the spot moves the tachometer only.
 */
const VIEW = { x: 51, y: 405, w: 1302, h: 440 };
const TACHO = { x: 339, y: 625, len: 104, per1000: 22.5 };
const SPEEDO = { x: 702, y: 625, len: 192, perKmh: 0.9 };
const START = 225; // compass degrees of zero on both dials

/** The cluster screen in the car's frame (m): centre, size, facing the driver. */
const CENTRE = new Vector3(0.373, 0.9295, 0.444);
const NORMAL = new Vector3(0, 0.26, -0.966).normalize();
const SIZE = { w: 0.308, h: 0.104 };

const FACE_FONT = "'Archivo', 'Arial Narrow', Arial, sans-serif";
const RIM = '#8d8d90';

/** Polar to canvas: compass degrees (0 up, clockwise) around a dial centre in VIEW units. */
const at = (cx: number, cy: number, deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx - VIEW.x + Math.sin(a) * r, cy - VIEW.y - Math.cos(a) * r];
};

/** One dial: the rim arc, ticks, numerals, an optional red zone; values map linearly onto the sweep. */
function dial(
  c: CanvasRenderingContext2D,
  o: { x: number; y: number; r: number; from: number; to: number; sweep: number; major: number; minor: number; label: (v: number) => string; red?: number; size: number; unit: string },
) {
  const deg = (v: number) => START + ((v - o.from) / (o.to - o.from)) * o.sweep;
  const arc = (r: number, d0: number, d1: number) => {
    c.beginPath();
    // canvas angles: 0 = +x, clockwise; compass 0 = up
    c.arc(o.x - VIEW.x, o.y - VIEW.y, r, ((d0 - 90) * Math.PI) / 180, ((d1 - 90) * Math.PI) / 180);
  };
  // the dial's glass: a faint lift towards the centre
  const g = c.createRadialGradient(o.x - VIEW.x, o.y - VIEW.y, 0, o.x - VIEW.x, o.y - VIEW.y, o.r * 1.1);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(o.x - VIEW.x, o.y - VIEW.y, o.r * 1.1, 0, Math.PI * 2);
  c.fill();
  // rim: a thin outer ring, and a fine inner one
  c.strokeStyle = RIM;
  c.lineWidth = 3;
  arc(o.r * 1.08, START - 4, START + o.sweep + 4);
  c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = '#4a4a4d';
  arc(o.r * 0.44, START, START + o.sweep);
  c.stroke();
  // red zone, as a band inside the rim
  if (o.red !== undefined) {
    c.strokeStyle = RED;
    c.lineWidth = o.r * 0.07;
    arc(o.r * 1.0, deg(o.red), deg(o.to));
    c.stroke();
  }
  // ticks
  for (let v = o.from; v <= o.to + 1e-6; v += o.minor) {
    const major = Math.abs(((v - o.from) / o.major) % 1) < 1e-6 || Math.abs((((v - o.from) / o.major) % 1) - 1) < 1e-6;
    const [x0, y0] = at(o.x, o.y, deg(v), o.r * (major ? 0.84 : 0.9));
    const [x1, y1] = at(o.x, o.y, deg(v), o.r * 0.97);
    c.strokeStyle = o.red !== undefined && v >= o.red ? '#f3c3c3' : major ? '#f1f0e9' : '#8a8a8c';
    c.lineWidth = major ? 4 : 2;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    if (major) {
      const [tx, ty] = at(o.x, o.y, deg(v), o.r * (o.size > 24 ? 0.63 : 0.68));
      c.font = `800 ${o.size}px ${FACE_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = o.red !== undefined && v >= o.red ? '#ff6b6b' : '#f1f0e9';
      c.fillText(o.label(v), tx, ty);
    }
  }
  c.font = `600 ${Math.round(o.size * 0.55)}px ${FACE_FONT}`;
  c.fillStyle = '#8f8f92';
  c.textAlign = 'center';
  c.fillText(o.unit, o.x - VIEW.x, o.y - VIEW.y - o.r * 0.26);
}

/** The faces of the cluster (everything but the needles and the gear). */
function drawFace(c: CanvasRenderingContext2D) {
  c.clearRect(0, 0, VIEW.w, VIEW.h);
  c.fillStyle = '#0b0b0c';
  c.fillRect(0, 0, VIEW.w, VIEW.h);
  // tachometer: 0–10 × 1000/min over 225° (22.5° per 1000), red from 7
  dial(c, { x: TACHO.x, y: TACHO.y, r: 120, from: 0, to: 10, sweep: 225, major: 1, minor: 0.5, label: (v) => String(v), red: 7, size: 22, unit: 'x1000/min' });
  // speedometer: 0–300 km/h over 270°
  dial(c, { x: SPEEDO.x, y: SPEEDO.y, r: 206, from: 0, to: 300, sweep: 270, major: 20, minor: 10, label: (v) => (v % 40 === 0 ? String(v) : ''), size: 26, unit: 'km/h' });
  // oil temperature, right: an arc that fills to the engine's warm 90 °C
  const OIL = { x: 1066, y: 625, r: 110 };
  const oilDeg = (v: number) => 270 + ((v - 50) / 100) * 180;
  const arc = (r: number, d0: number, d1: number) => {
    c.beginPath();
    c.arc(OIL.x - VIEW.x, OIL.y - VIEW.y, r, ((d0 - 90) * Math.PI) / 180, ((d1 - 90) * Math.PI) / 180);
  };
  c.lineCap = 'butt';
  c.strokeStyle = '#2a2a2c';
  c.lineWidth = 14;
  arc(OIL.r * 0.86, oilDeg(50), oilDeg(150));
  c.stroke();
  c.strokeStyle = '#d9d8d2';
  arc(OIL.r * 0.86, oilDeg(50), oilDeg(90));
  c.stroke();
  c.strokeStyle = RED;
  c.lineWidth = 14;
  arc(OIL.r * 0.86, oilDeg(130), oilDeg(150));
  c.stroke();
  c.strokeStyle = RIM;
  c.lineWidth = 3;
  arc(OIL.r * 1.02, oilDeg(50) - 4, oilDeg(150) + 4);
  c.stroke();
  c.font = `800 18px ${FACE_FONT}`;
  c.fillStyle = '#f1f0e9';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const v of [50, 100, 150]) {
    const [x, y] = at(OIL.x, OIL.y, oilDeg(v), OIL.r * 0.6);
    c.fillText(String(v), x, y);
  }
  c.font = `800 40px ${FACE_FONT}`;
  c.fillText('90', OIL.x - VIEW.x, OIL.y - VIEW.y + 6);
  c.font = `600 14px ${FACE_FONT}`;
  c.fillStyle = '#8f8f92';
  c.fillText('OIL °C', OIL.x - VIEW.x, OIL.y - VIEW.y + 40);
  // the bottom line: odometer, outside temperature, time; and a red hairline under it
  c.font = `600 18px 'JetBrains Mono', ui-monospace, monospace`;
  c.fillStyle = '#bdbcb7';
  c.textAlign = 'left';
  c.fillText('12 847 km', 120, VIEW.h - 26);
  c.textAlign = 'center';
  c.fillText('7 °C', SPEEDO.x - VIEW.x, VIEW.h - 26);
  c.textAlign = 'right';
  c.fillText('23:59', VIEW.w - 120, VIEW.h - 26);
  c.fillStyle = RED;
  c.fillRect(120, VIEW.h - 10, VIEW.w - 240, 2);
}

export interface Cluster {
  mesh: Mesh;
  /**
   * Draws the dials: engine rpm, road speed (km/h), the screen's brightness
   * (0 off … 1 on), the gear (0 parked, 1–4 driving) and how fresh the last
   * gear change is (1 at the change, fading to 0).
   */
  set(rpm: number, kmh: number, on: number, gear?: number, shift?: number): void;
}

export function buildCluster(): Cluster {
  const canvas = document.createElement('canvas');
  canvas.width = VIEW.w;
  canvas.height = VIEW.h;
  const ctx = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshBasicMaterial({ map: tex, color: 0x000000 });
  mat.userData.comic = false;
  const mesh = new Mesh(new PlaneGeometry(SIZE.w, SIZE.h), mat);
  mesh.name = 'cluster-screen';
  mesh.userData.ink = false;
  // facing the driver: the dial's left is the driver's left (+x in the car's frame), its top tilts back
  const right = new Vector3(-1, 0, 0);
  const up = new Vector3().crossVectors(NORMAL, right);
  mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, NORMAL));
  mesh.position.copy(CENTRE).addScaledVector(NORMAL, 0.003);

  // the dial faces, drawn once (again when the page's fonts have loaded)
  const face = document.createElement('canvas');
  face.width = VIEW.w;
  face.height = VIEW.h;
  const ready = true;
  drawFace(face.getContext('2d')!);
  document.fonts?.ready.then(() => {
    drawFace(face.getContext('2d')!);
    last = '';
  });

  const needle = (cx: number, cy: number, deg: number, len: number, hub: number) => {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const x = cx - VIEW.x;
    const y = cy - VIEW.y;
    // a tapered red needle with a short tail, on a dark hub ringed in red
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y + dy * len);
    ctx.lineTo(x - dy * 4.5 - dx * 18, y + dx * 4.5 - dy * 18);
    ctx.lineTo(x + dy * 4.5 - dx * 18, y - dx * 4.5 - dy * 18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, hub, 0, Math.PI * 2);
    ctx.fillStyle = '#1b1b1c';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = RED;
    ctx.stroke();
  };

  let last = '';
  return {
    mesh,
    set(rpm, kmh, on, gear = 0, shift = 0) {
      const key = `${Math.round(rpm / 10)}|${Math.round(kmh * 2)}|${on.toFixed(2)}|${ready}|${gear}|${shift.toFixed(2)}`;
      if (key === last) return;
      last = key;
      // the screen lights with the ignition, a little below full so it sits in the dim cabin
      mat.color.setScalar(0.9 * on);
      if (on <= 0) return;
      ctx.fillStyle = '#0b0b0c';
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.drawImage(face, 0, 0);
      needle(TACHO.x, TACHO.y, START + (TACHO.per1000 * Math.min(rpm, 10000)) / 1000, TACHO.len, 11);
      // the gear, in the speedometer under its hub (P parked, D1–D4 on the move); at a change it
      // flashes red and settles back to white
      ctx.font = `800 34px ${FACE_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = Math.max(0, Math.min(1, shift));
      ctx.fillStyle = w > 0 ? `rgb(${241 - 29 * w},${240 - 207 * w},${233 - 190 * w})` : '#f1f0e9';
      ctx.fillText(gear > 0 ? `D${gear}` : 'P', SPEEDO.x - VIEW.x, SPEEDO.y - VIEW.y + 52);
      needle(SPEEDO.x, SPEEDO.y, START + SPEEDO.perKmh * Math.min(kmh, 300), SPEEDO.len, 15);
      tex.needsUpdate = true;
    },
  };
}
