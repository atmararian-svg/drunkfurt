import { CanvasTexture, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import { mulberry32 } from '../../core/math';

/**
 * What the small screens of the monitor wall show, and their mood: each one
 * on its own slow, irregular schedule of dimming, glowing and now and then
 * going dark, like a bank of feeds nobody is watching. Pictures are drawn
 * once on canvases (no assets); per frame only a colour scalar changes per
 * screen, so it costs nothing and never touches React.
 *
 * All grey, printed like the rest of the page; the only colour is the tiny
 * yellow REC dot on the camera feeds.
 */
const W = 320;
const H = 224;

function canvas(draw: (c: CanvasRenderingContext2D, r: () => number) => void, seed: number) {
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const c = el.getContext('2d')!;
  draw(c, mulberry32(seed));
  // scan lines over everything
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const grey = (v: number) => `rgb(${v},${v},${v})`;

/** A fixed camera on a corridor: a vanishing point, a door, the time code and REC. */
function feed(n: number) {
  return canvas((c, r) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, grey(38));
    g.addColorStop(1, grey(92));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const vx = W * (0.35 + r() * 0.3);
    const vy = H * (0.38 + r() * 0.1);
    c.strokeStyle = grey(150);
    c.lineWidth = 2;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(vx, vy);
      c.stroke();
    }
    c.fillStyle = grey(20);
    c.fillRect(vx - 26, vy - 30, 52, 50);
    c.fillStyle = grey(120);
    c.fillRect(vx + 40 + r() * 30, vy - 10, 16, 60);
    c.font = '600 15px monospace';
    c.fillStyle = grey(225);
    c.fillText(`CAM ${String(n).padStart(2, '0')}`, 12, 24);
    c.fillText(`00:${String(28 + n).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`, W - 104, H - 14);
    c.fillStyle = '#e6c23a';
    c.beginPath();
    c.arc(W - 22, 20, 5, 0, Math.PI * 2);
    c.fill();
  }, 11 + n);
}

/** Lines of log text. */
function log(seed: number) {
  return canvas((c, r) => {
    c.fillStyle = grey(16);
    c.fillRect(0, 0, W, H);
    c.font = '13px monospace';
    for (let y = 22; y < H; y += 17) {
      c.fillStyle = grey(r() < 0.15 ? 235 : 150);
      let s = '';
      const n = 6 + Math.floor(r() * 22);
      for (let i = 0; i < n; i++) s += r() < 0.18 ? ' ' : String.fromCharCode(48 + Math.floor(r() * 42));
      c.fillText(`> ${s}`, 10, y);
    }
  }, seed);
}

/** A trace on a grid. */
function scope(seed: number) {
  return canvas((c, r) => {
    c.fillStyle = grey(14);
    c.fillRect(0, 0, W, H);
    c.strokeStyle = grey(52);
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    c.strokeStyle = grey(215);
    c.lineWidth = 2;
    c.beginPath();
    const f = 2 + r() * 4;
    for (let x = 0; x <= W; x += 3) {
      const y = H / 2 + Math.sin((x / W) * Math.PI * 2 * f) * 40 * (0.6 + r() * 0.5);
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }, seed);
}

/** A floor plan with a few marked rooms. */
function plan(seed: number) {
  return canvas((c, r) => {
    c.fillStyle = grey(24);
    c.fillRect(0, 0, W, H);
    c.strokeStyle = grey(190);
    c.lineWidth = 2;
    c.strokeRect(14, 14, W - 28, H - 28);
    for (let i = 0; i < 7; i++) {
      const x = 14 + r() * (W - 60);
      const y = 14 + r() * (H - 60);
      c.strokeRect(x, y, 30 + r() * 80, 24 + r() * 60);
    }
    c.fillStyle = grey(240);
    c.fillRect(W * (0.3 + r() * 0.4), H * (0.3 + r() * 0.4), 8, 8);
  }, seed);
}

/**
 * About the author, as one more terminal on the wall: in the log screens'
 * type, steady and bright enough to read from the chair, at twice the other
 * screens' resolution so the small type stays sharp. Redrawn once the page's
 * mono face has loaded.
 */
export const ABOUT_TEXT = [
  'My name is Arian.',
  'An Award-Winning Senior UI/UX Designer working with studios around the World.',
  'I have six (6+) years of experience in interface / web design and I fr love what I’m doing!',
  'I have 30+ major projects under my belt and have shown you my favorites in my portfolio.',
];
function about() {
  const k = 2;
  const el = document.createElement('canvas');
  el.width = W * k;
  el.height = H * k;
  const c = el.getContext('2d')!;
  const draw = () => {
    c.fillStyle = grey(14);
    c.fillRect(0, 0, el.width, el.height);
    const left = 28;
    const max = el.width - left * 2;
    let y = 46;
    ABOUT_TEXT.forEach((para, i) => {
      c.font = `${i === 0 ? 800 : 600} ${i === 0 ? 26 : 21}px 'JetBrains Mono', ui-monospace, monospace`;
      c.fillStyle = i === 0 ? '#e6c23a' : grey(222);
      // wrapped by words, each paragraph a prompt line and its continuation indented
      const words = para.split(' ');
      let line = '';
      const lines: string[] = [];
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (c.measureText(`> ${next}`).width > max && line) {
          lines.push(line);
          line = w;
        } else line = next;
      }
      lines.push(line);
      lines.forEach((l, j) => {
        c.fillText(`${j === 0 ? '> ' : '  '}${l}`, left, y);
        y += i === 0 ? 34 : 28;
      });
      y += 12;
    });
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < el.height; yy += 4) c.fillRect(0, yy, el.width, 2);
  };
  draw();
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.ready.then(() => {
    draw();
    t.needsUpdate = true;
  });
  return t;
}

/** Snow: no signal. */
function noise(seed: number) {
  return canvas((c, r) => {
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2) {
        c.fillStyle = grey(30 + Math.floor(r() * 150));
        c.fillRect(x, y, 2, 2);
      }
  }, seed);
}

export interface WallScreens {
  materials: MeshBasicMaterial[];
  /** Advance the screens' moods (seconds since the last frame). */
  update(dt: number, now: number): void;
  dispose(): void;
}

/**
 * One material per screen, each with its own picture and its own schedule;
 * the screen at `aboutAt` shows the text about the author, steady (no moods).
 */
export function buildWallScreens(count: number, aboutAt = -1): WallScreens {
  const pics: Texture[] = [feed(1), feed(2), feed(3), feed(4), log(5), log(6), scope(7), scope(8), plan(9), noise(10)];
  const aboutPic = about();
  // the log screens scroll their text slowly
  const scrolling = pics.slice(4, 6);
  scrolling.forEach((t) => {
    t.wrapT = RepeatWrapping;
  });
  const r = mulberry32(404);
  const materials: MeshBasicMaterial[] = [];
  const mood: { level: number; target: number; next: number; rate: number; flicker: number }[] = [];
  for (let i = 0; i < count; i++) {
    const pick = pics[Math.floor(r() * pics.length)];
    const m = new MeshBasicMaterial({ map: i === aboutAt ? aboutPic : pick, toneMapped: false });
    m.userData.comic = false;
    const level = 0.15 + r() * 0.45;
    m.color.setScalar(level);
    materials.push(m);
    mood.push({ level, target: level, next: r() * 4, rate: 0.35 + r() * 0.6, flicker: 0 });
  }
  let clock = 0;
  return {
    materials,
    update(dt, now) {
      clock += dt;
      for (let i = 0; i < count; i++) {
        if (i === aboutAt) {
          materials[i].color.setScalar(0.92);
          continue;
        }
        const s = mood[i];
        if (clock >= s.next) {
          // a new mood: mostly a dim glow, sometimes bright, sometimes nearly dark
          const roll = r();
          s.target = roll < 0.18 ? 0.03 + r() * 0.04 : roll < 0.78 ? 0.2 + r() * 0.3 : 0.6 + r() * 0.2;
          s.rate = 0.25 + r() * 0.7;
          s.next = clock + 2.5 + r() * 8;
          // now and then it catches: a short stutter as it changes
          if (r() < 0.22) s.flicker = 0.35 + r() * 0.4;
        }
        s.level += (s.target - s.level) * (1 - Math.exp(-s.rate * dt));
        let v = s.level;
        if (s.flicker > 0) {
          s.flicker -= dt;
          v *= Math.sin(now * 0.047 + i) > 0 ? 1 : 0.45;
        }
        materials[i].color.setScalar(v);
      }
      for (const t of scrolling) t.offset.y = (clock * 0.02) % 1;
    },
    dispose() {
      pics.forEach((t) => t.dispose());
      aboutPic.dispose();
      materials.forEach((m) => m.dispose());
    },
  };
}
