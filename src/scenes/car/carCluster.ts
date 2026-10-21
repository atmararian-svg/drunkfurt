import { CanvasTexture, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import clusterSvg from '../../assets/cluster.svg?raw';

/**
 * The Mercedes' instrument cluster: the supplied dial illustration, adapted
 * by tools/cluster_svg.py (centre panel removed, the speedometer rebuilt as
 * 0–300 km/h, AMG colours), printed on the car's own cluster screen.
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

  // the dial faces, decoded once (an SVG as a data URL: no request, allowed by a strict content policy)
  const face = new Image();
  let ready = false;
  face.onload = () => {
    ready = true;
    last = '';
  };
  face.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(clusterSvg)))}`;

  const needle = (cx: number, cy: number, deg: number, len: number, hub: number) => {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const x = cx - VIEW.x;
    const y = cy - VIEW.y;
    // a tapered red needle with a short tail, on a dark hub ringed in red
    ctx.fillStyle = '#d4212b';
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
    ctx.strokeStyle = '#d4212b';
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
      if (ready) ctx.drawImage(face, 0, 0, VIEW.w, VIEW.h);
      needle(TACHO.x, TACHO.y, START + (TACHO.per1000 * Math.min(rpm, 10000)) / 1000, TACHO.len, 11);
      // the gear, in the speedometer under its hub (P parked, D1–D4 on the move); at a change it
      // flashes red and settles back to white
      ctx.font = '600 34px Arial, Helvetica, sans-serif';
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
