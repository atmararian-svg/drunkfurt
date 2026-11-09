/**
 * Diagnostics for a stall seen on a real graphics card (`?diag` in the address): every WebGL call and
 * frame that takes long, the main thread's long tasks, what loaded when, and the story's own moments,
 * in a panel at the top left with a button that copies the whole report. Off without `?diag`.
 */
export const DIAG = (() => {
  try {
    return new URLSearchParams(location.search).has('diag');
  } catch {
    return false;
  }
})();

const KEY = 'drunkfurt:diag';
const t0 = performance.now();
const at = () => ((performance.now() - t0) / 1000).toFixed(2);
const events: string[] = [];
const slowCalls: { ms: number; line: string }[] = [];
const totals = new Map<string, { n: number; ms: number; max: number }>();
let worstFrame = 0;

let lastSave = 0;
export function diagNote(what: string) {
  if (!DIAG) return;
  events.push(`${at()}s ${what}`);
  if (events.length > 400) events.shift();
  // kept at once (not only every second): a tab that dies a moment later still has it
  const now = performance.now();
  if (now - lastSave > 200) {
    lastSave = now;
    try {
      localStorage.setItem(KEY, report());
    } catch {
      // (storage full or off)
    }
  }
}

function keepSlow(ms: number, line: string) {
  slowCalls.push({ ms, line });
  slowCalls.sort((a, b) => b.ms - a.ms);
  if (slowCalls.length > 40) slowCalls.length = 40;
}

/** Times every call of the WebGL methods that can make the page wait on the graphics card. */
function wrapGl() {
  const names = [
    'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'linkProgram', 'compileShader',
    'texImage2D', 'texSubImage2D', 'texImage3D', 'texStorage2D', 'compressedTexImage2D', 'generateMipmap',
    'readPixels', 'getError', 'finish', 'bufferData', 'getParameter', 'getExtension', 'clientWaitSync',
    'getUniformLocation', 'getActiveUniform', 'getAttribLocation', 'checkFramebufferStatus', 'useProgram',
    'blitFramebuffer', 'createTexture', 'deleteTexture',
  ];
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const proto = C.prototype as unknown as Record<string, unknown>;
    for (const n of names) {
      const f = proto[n];
      if (typeof f !== 'function') continue;
      // (`arguments` as it came: an overload such as texImage2D is told apart by how many there are)
      proto[n] = function (this: unknown) {
        // eslint-disable-next-line prefer-rest-params
        const args = arguments as unknown as unknown[];
        const s = performance.now();
        const r = (f as (...a: unknown[]) => unknown).apply(this, args);
        const ms = performance.now() - s;
        let t = totals.get(n);
        if (!t) totals.set(n, (t = { n: 0, ms: 0, max: 0 }));
        t.n++;
        t.ms += ms;
        if (ms > t.max) t.max = ms;
        if (ms > 30) keepSlow(ms, `${at()}s gl.${n} ${ms.toFixed(0)} ms${n.startsWith('tex') ? ` (${describeTex(args)})` : ''}`);
        return r;
      };
    }
  }
}
function describeTex(args: unknown[]) {
  const img = args.find((a) => a && typeof a === 'object' && 'width' in (a as object)) as { width?: number; height?: number } | undefined;
  if (img) return `${img.width}×${img.height}`;
  const nums = args.filter((a) => typeof a === 'number') as number[];
  return nums.slice(3, 5).join('×');
}

/** The renderer's whole frame (called around three's render by the app). */
export function diagFrame(ms: number, label: string) {
  if (!DIAG) return;
  if (ms > worstFrame) worstFrame = ms;
  if (ms > 80) keepSlow(ms, `${at()}s FRAME render ${ms.toFixed(0)} ms (${label})`);
}

let gpuName: string | null = null;

function report() {
  const tot = [...totals.entries()]
    .filter(([, t]) => t.ms > 5)
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([n, t]) => `  ${n}: ${t.n} calls, ${t.ms.toFixed(0)} ms total, max ${t.max.toFixed(0)} ms`);
  const glInfo = (gpuName ??= (() => {
    try {
      const c = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
      const e = c?.getExtension('WEBGL_debug_renderer_info');
      const r = e && c ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
      c?.getExtension('WEBGL_lose_context')?.loseContext();
      return r;
    } catch {
      return '?';
    }
  })());
  return [
    `DRUNKFURT diag, ${new Date().toISOString()}`,
    `${navigator.userAgent}`,
    `GPU: ${glInfo}; screen ${innerWidth}×${innerHeight} @${devicePixelRatio}`,
    `worst frame: ${worstFrame.toFixed(0)} ms; last saved ${at()}s`,
    '',
    'SLOWEST (s since load):',
    ...slowCalls.map((s) => '  ' + s.line),
    '',
    'GL TOTALS:',
    ...tot,
    '',
    'EVENTS:',
    ...events.map((e) => '  ' + e),
  ].join('\n');
}

export function mountDiag() {
  if (!DIAG) return;
  (window as unknown as { __diagNote?: (s: string) => void; __diagReport?: () => string }).__diagNote = diagNote;
  (window as unknown as { __diagReport?: () => string }).__diagReport = report;
  wrapGl();
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.duration > 120) keepSlow(e.duration, `${((e.startTime - t0) / 1000).toFixed(2)}s LONG TASK ${e.duration.toFixed(0)} ms`);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as PerformanceResourceTiming[]) {
        const name = e.name.split('/').pop();
        if (events.length < 400) events.push(`${((e.responseEnd - t0) / 1000).toFixed(2)}s loaded ${name} ${(e.transferSize / 1024).toFixed(0)}K in ${(e.duration / 1000).toFixed(2)}s`);
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {
    // (no observers here: the rest still reports)
  }
  window.addEventListener('error', (e) => diagNote(`ERROR ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => diagNote(`REJECTION ${String(e.reason)}`));
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:99999;width:min(560px,90vw);max-height:46vh;overflow:auto;background:rgba(0,0,0,.85);color:#9f9;font:11px/1.35 monospace;padding:8px;white-space:pre-wrap;pointer-events:auto';
  const btn = document.createElement('button');
  btn.textContent = 'COPY DIAG REPORT';
  btn.style.cssText = 'display:block;margin-bottom:6px;padding:6px 10px;background:#cd1919;color:#fff;border:0;font:700 12px monospace;cursor:pointer';
  btn.onclick = async () => {
    const text = report();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'COPIED: paste it to Claude';
    } catch {
      const w = window.open('', '_blank');
      w?.document.write(`<pre>${text.replace(/</g, '&lt;')}</pre>`);
    }
  };
  const body = document.createElement('div');
  panel.append(btn);
  // the report of the run before (kept in the browser every second: it survives a crashed tab)
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(KEY);
  } catch {
    previous = null;
  }
  if (previous) {
    const prev = document.createElement('button');
    prev.textContent = 'COPY PREVIOUS RUN (after a crash)';
    prev.style.cssText = btn.style.cssText + ';background:#3931e2;margin-top:4px';
    prev.onclick = async () => {
      try {
        await navigator.clipboard.writeText(previous!);
        prev.textContent = 'COPIED: paste it to Claude';
      } catch {
        const w = window.open('', '_blank');
        w?.document.write(`<pre>${previous!.replace(/</g, '&lt;')}</pre>`);
      }
    };
    panel.append(prev);
  }
  panel.append(body);
  // where the story is and what it holds, every 2 s (memory, the graphics card's objects)
  window.setInterval(() => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const st = (window as unknown as { __diagState?: () => string }).__diagState?.() ?? '';
    diagNote(`state ${st}${mem ? ` | js heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB of ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)}` : ''} | dom ${document.getElementsByTagName('*').length}`);
  }, 2000);
  window.setInterval(() => {
    try {
      localStorage.setItem(KEY, report());
    } catch {
      // (storage full or off)
    }
  }, 1000);
  const add = () => document.body.append(panel);
  if (document.body) add();
  else window.addEventListener('DOMContentLoaded', add);
  window.setInterval(() => {
    body.textContent = `worst frame ${worstFrame.toFixed(0)} ms\n` + slowCalls.slice(0, 10).map((s) => s.line).join('\n');
  }, 1000);
}
