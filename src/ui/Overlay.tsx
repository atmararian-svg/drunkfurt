import { useEffect, useMemo, useRef } from 'react';
import { audio } from '../audio/AudioDirector';
import { clamp, smoothstep } from '../core/math';
import { story, useStory } from '../core/store';
import { CHAPTERS } from '../core/chapters';
import { chapterTurn, episodeRange, gateLimit, locate, scrollToProgress, timeline } from '../core/timeline';
import { builtEpisodes } from '../episodes';
import { hoverDecode } from './decode';
import { BEAT, BLOCK, KO, defend, encounter, encounterAt } from '../scenes/city/encounter';
import { drawBrushWipe, drawHits, drawIgnite, drawKnockout, drawSpeedLines } from './brush';
import { launchAt } from '../scenes/car/getaway';
import { enterSite, monitor, pick } from '../scenes/home/monitor';
import { RevPrompt } from './RevPrompt';
import { mountCombatPrompts, updateCombatPrompts } from './combatPrompt';
import { setScenePixels } from './scenePixels';
import { createTypewriter, Typewriter } from './typewriter';
import { letter, pickLetter } from '../scenes/city/letter';
import { closeLetterNow, openLetter } from './letterReveal';
import { MONOLOGUE, thoughts, thoughtsTyped, updateThoughts } from '../scenes/car/thoughts';
import { ARROW } from './fightArt';

/** The fight's coarse pixels at their strongest (CSS px per block). */
const PIXEL_PEAK = 7;

/**
 * How pixelated the street is (block size, CSS px; 1 = not at all): a pure
 * function of the progress and the encounter, so a scrub, a revisit or a reset
 * can never leave it stuck. It grows as he raises the knife (cock → gate),
 * holds through the stand-off and the fight, and resolves as the dark opens on
 * the aftermath, back to normal before the letter.
 */
function combatPixels(id: string, local: number) {
  if (id !== 'city' || local < BEAT.cock) return 1;
  let level: number;
  if (local < BEAT.gate) level = smoothstep(clamp((local - BEAT.cock) / (BEAT.gate - BEAT.cock), 0, 1));
  else if (!encounter.outcome || local < BEAT.aftermath) level = 1;
  else level = 1 - smoothstep(clamp((local - BEAT.aftermath) / 0.04, 0, 1));
  return 1 + (PIXEL_PEAK - 1) * level;
}

/** ACTION is up from the moment he raises the knife until the dark has covered the fight. */
function actionShown(id: string, local: number) {
  if (id !== 'city' || local < BEAT.cock || local >= BEAT.aftermath) return false;
  const v = encounterAt(local);
  if (!v.outcome) return true;
  return v.t < (v.outcome === 'blocked' ? BLOCK.dark : KO.dark);
}

/**
 * Ink over the whole frame at a given progress: the fight's conceal (the dark
 * spreads over the frame before the hits, drawIgnite, and recedes on the
 * aftermath) and the closing card. Moving between chapters is the chapter
 * transition's (chapterTransition.ts), not ink.
 */
function inkAt(p: number): { w: number; mode: 'close' | 'open'; kind: 'ignite' | 'brush' } {
  const { id, local } = locate(p);
  if (id === 'outro') return { w: 1, mode: 'close', kind: 'brush' };
  if (id === 'city' && encounter.outcome) {
    // the dark spreads from the decision and is complete at the outcome's `dark` (BLOCK.dark, KO.dark): the
    // fight itself happens under it; the page stays dark until the aftermath, where it recedes
    const t = encounterAt(local).t;
    const black = encounter.outcome === 'blocked' ? BLOCK.dark : KO.dark;
    const lead = encounter.outcome === 'blocked' ? BLOCK.dark : 0.45;
    if (t >= 0 && local < BEAT.aftermath) return { w: clamp((t - (black - lead)) / lead, 0, 1), mode: 'close', kind: 'ignite' };
    if (local >= BEAT.aftermath && local < BEAT.aftermath + OPEN) return { w: 1 - (local - BEAT.aftermath) / OPEN, mode: 'open', kind: 'ignite' };
  }
  return { w: 0, mode: 'open', kind: 'brush' };
}
/** How much of the city episode the conceal takes to recede on the aftermath. */
const OPEN = 0.045;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Everything on top of the canvas is printed matter: a title panel, caption
 * boxes, brush-stroke wipes between shots, the one prompt the story asks you to
 * act on, a thin episode rail and a sound switch. All of it follows the same
 * scroll progress as the camera, updated per frame through refs.
 */
export function Overlay() {
  const prompt = useStory((s) => s.prompt);
  const sound = useStory((s) => s.sound);
  const root = useRef<HTMLDivElement>(null);
  // one list for the page's life: the effects below must not re-run (and restart what they drive) on every re-render
  const episodes = useMemo(builtEpisodes, []);

  useEffect(() => {
    let raf = 0;
    const el = root.current!;
    const captions = Array.from(el.querySelectorAll<HTMLElement>('[data-caption]'));
    const capDefs = episodes.flatMap((ep) => ep.captions);
    const fill = el.querySelector<HTMLElement>('.rail-fill')!;
    const cue = el.querySelector<HTMLElement>('.cue')!;
    const outro = el.querySelector<HTMLElement>('.outro')!;
    const rail = Array.from(el.querySelectorAll<HTMLElement>('.rail li'));
    const chapterNow = (id: string) => CHAPTERS.find((c) => (c.episodes as string[]).includes(id))?.number ?? CHAPTERS.length;
    // balloons are typed in (the supplied typewriter); the thoughts in the car as well, line by line
    const typed = new Map<HTMLElement, { tw: Typewriter; on: boolean }>();
    captions.forEach((c) => {
      const p = c.querySelector<HTMLElement>('[data-type]');
      if (p) typed.set(c, { tw: createTypewriter(p, { startDelay: 250 }), on: false });
    });
    const thoughtEl = el.querySelector<HTMLElement>('.thoughts-text')!;
    const thoughtTw = createTypewriter(thoughtEl, { content: 'lines', stableHeight: false, startDelay: 500, pauseAfterType: (t) => 900 + 24 * t.length });
    const thoughtBox = el.querySelector<HTMLElement>('.thoughts')!;
    let thoughtsOn = false;
    const unmountPrompts = mountCombatPrompts(el.querySelector<HTMLCanvasElement>('.fx-action')!, el.querySelector<HTMLElement>('.fx-defend')!);
    const wipe = el.querySelector<HTMLCanvasElement>('.wipe')!;
    const hit = el.querySelector<HTMLCanvasElement>('.impact')!;
    const wctx = wipe.getContext('2d')!;
    const hctx = hit.getContext('2d')!;
    let last = '';
    // (anything left on the canvases from before this effect ran is cleared on the first frame)
    let lastHit = '\u0000';
    let idle = 0;
    const restored = () => {
      last = '';
      lastHit = '\u0000';
    };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const c of [wipe, hit]) {
        c.width = Math.round(window.innerWidth * dpr);
        c.height = Math.round(window.innerHeight * dpr);
      }
      last = '';
    };
    size();
    hit.style.opacity = '1';
    wipe.addEventListener('contextrestored', restored);
    hit.addEventListener('contextrestored', restored);
    window.addEventListener('resize', size);

    const loop = () => {
      const p = timeline.progress;
      const { id, local } = locate(p);
      captions.forEach((c, i) => {
        const when = capDefs[i].when;
        const on = c.dataset.ep === id && local >= Number(c.dataset.from) && local <= Number(c.dataset.to) && (!when || when());
        c.classList.toggle('is-on', on);
        const t = typed.get(c);
        if (t && t.on !== on) {
          t.on = on;
          // (balloons are lettered in capitals: ß is set as its capital, ẞ, which the capitals keep as it is)
          if (on) void t.tw.play((c.dataset.text ?? '').replace(/ß/g, 'ẞ')).then(() => capDefs[i].onTyped?.());
          else t.tw.stop();
        }
      });
      // the fight: ACTION and PRESS D TO DEFEND, and the street breaking into coarse pixels
      updateCombatPrompts(actionShown(id, local), story.getState().prompt === 'defend');
      setScenePixels(combatPixels(id, local));
      // the thoughts in the car, once the door has shut (car/thoughts.ts holds the story until they are done)
      const think = id === 'car' && updateThoughts();
      if (think !== thoughtsOn) {
        thoughtsOn = think;
        thoughtBox.classList.toggle('is-on', think);
        if (!think) {
          thoughtTw.stop();
          if (!thoughts.done) thoughts.started = false;
        }
      }
      if (think && !thoughts.started) {
        thoughts.started = true;
        if (thoughts.done) thoughtTw.show(MONOLOGUE);
        else void thoughtTw.play(MONOLOGUE).then(thoughtsTyped);
      }
      fill.style.transform = `scaleY(${p})`;
      cue.classList.toggle('is-on', p < 0.004);
      outro.classList.toggle('is-on', id === 'outro' && local > 0.15);
      // the rail marks the chapter you are in
      rail.forEach((li) => li.classList.toggle('is-here', Number(li.dataset.chapter) === chapterNow(id)));

      const ink = inkAt(p);
      const key = `${ink.w.toFixed(3)}${ink.mode}${ink.kind}${wipe.width}`;
      if (ink.w <= 0 && idle % 60 === 30) last = '';
      if (key !== last) {
        if (ink.kind === 'ignite') drawIgnite(wctx, wipe.width, wipe.height, clamp(ink.w, 0, 1), ink.mode);
        else drawBrushWipe(wctx, wipe.width, wipe.height, clamp(ink.w, 0, 1), ink.mode, 7);
        last = key;
      }
      // the fight frames, a function of where the fight is (its time comes from the progress):
      // defended, the page goes black and the two hits are printed into the dark;
      // knocked out, a flash, then the lights go out as you fall
      const v = id === 'city' ? encounterAt(local) : null;
      const hitT = !v || v.t < 0 || local >= BEAT.aftermath ? -1 : v.t;
      // episode 3: the rush at the end of the launch, in speed lines
      const run = id === 'car' ? launchAt(local) : null;
      const rush = run && run.rpm >= 0 ? run.rush : 0;
      const hitKey = hitT >= 0 ? `${v!.outcome}${hitT.toFixed(3)}${hit.width}` : rush > 0 ? `rush${rush.toFixed(2)}${Math.floor(run!.t * 24)}${hit.width}` : '';
      // (an empty layer is cleared again now and then: a canvas whose context was restored by the browser can come back
      // with an old picture on it, and nothing else would draw over it)
      if (hitKey === '' && ++idle % 60 === 0) lastHit = '\u0000';
      if (hitKey !== lastHit) {
        hctx.clearRect(0, 0, hit.width, hit.height);
        if (hitT >= 0 && v!.outcome === 'knockedOut') drawKnockout(hctx, hit.width, hit.height, hitT, KO.dark);
        else if (hitT >= 0) drawHits(hctx, hit.width, hit.height, hitT, BLOCK);
        else if (rush > 0) drawSpeedLines(hctx, hit.width, hit.height, rush, run!.t);
        lastHit = hitKey;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      wipe.removeEventListener('contextrestored', restored);
      hit.removeEventListener('contextrestored', restored);
      typed.forEach((t) => t.tw.stop());
      thoughtTw.stop();
      if (!thoughts.done) thoughts.started = false;
      unmountPrompts();
      setScenePixels(1);
      closeLetterNow();
    };
  }, [episodes]);

  /** The printed text decodes where the pointer passes over it (captions, title cards). */
  useEffect(() => {
    const el = root.current!;
    const detach = Array.from(el.querySelectorAll<HTMLElement>('[data-decode], [data-decode-in]')).map((t) => hoverDecode(t));
    return () => detach.forEach((d) => d());
  }, [episodes]);

  /** Click / tap / Enter: act on the prompt if one is waiting, otherwise go to the next composed beat. */
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setEnabled(story.getState().sound);
    };
    const next = (e?: MouseEvent) => {
      // a chapter transition plays by itself
      if (chapterTurn.busy) return;
      // the last scene: only a click on the big screen does anything (Enter takes you in as well)
      if (monitor.entering) return;
      if (story.getState().prompt === 'monitor') {
        // the page under the click: a project, About, All works, or the home page; Enter: the one under the pointer
        if (!e) enterSite(monitor.link);
        else {
          const at = pick(e.clientX, e.clientY);
          if (at) enterSite(at.link);
        }
        return;
      }
      if (story.getState().prompt === 'defend') {
        defend();
        return;
      }
      // after the fight: only a click on the letter does anything (Enter picks it up as well)
      if (story.getState().prompt === 'letter') {
        if (!letter.open && (!e || pickLetter(e.clientX, e.clientY))) openLetter(() => (letter.read = true));
        return;
      }
      // the invitation and the thoughts in the car play by themselves
      if (story.getState().prompt === 'invite' || story.getState().prompt === 'thought') return;
      // revving starts with D (or a press on its card), not with a click
      if (story.getState().prompt === 'rev') return;
      const { id, local } = locate(timeline.target);
      const ep = episodes.find((e) => e.id === id);
      if (!ep) return;
      const r = episodeRange(ep.id);
      const beat = ep.beats.find((b) => b > local + 0.01);
      scrollToProgress(Math.min(gateLimit(), beat === undefined ? r.end + 0.001 : r.start + beat * (r.end - r.start)));
    };
    const onKey = (e: KeyboardEvent) => {
      unlock();
      // D defends (the one keyboard handler of the story; the car listens for its own D, only to rev)
      if (e.code === 'KeyD' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && story.getState().prompt === 'defend') {
        e.preventDefault();
        defend();
        return;
      }
      if (letter.open) return;
      if (e.code === 'Enter' || (e.code === 'Space' && story.getState().prompt)) {
        e.preventDefault();
        next();
      }
    };
    const onClick = (e: MouseEvent) => {
      unlock();
      if ((e.target as HTMLElement).closest('a,button,.rev-prompt,.whiteout,.preloader,.letter-layer')) return;
      next(e);
    };
    // while the story waits at a gate, drift the page back to it so the prompt stays in reach
    let settle = 0;
    const onScroll = () => {
      window.clearTimeout(settle);
      if (!story.getState().prompt) return;
      settle = window.setTimeout(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (window.scrollY / max > gateLimit() + 0.01) scrollToProgress(gateLimit());
      }, 260);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('scroll', onScroll);
    };
  }, [episodes]);

  const toggleSound = () => {
    const on = !story.getState().sound;
    story.setState({ sound: on });
    audio.unlock();
    audio.setEnabled(on);
  };

  return (
    <div className="overlay" ref={root}>
      <canvas className="wipe" aria-hidden />

      {CHAPTERS.map((c) => (
        <div key={c.number} className="tcard" data-chapter={c.number} role="status" aria-label={`Chapter ${c.number}: ${c.title}. ${c.place}, ${c.time}`}>
          <div className="tcard-slide">
            <div className="tcard-panel">
              <div className="tcard-meta" aria-hidden>
                <span data-decode-in data-text={`DRUNKFURT / CHAPTER ${c.number}`} />
                <span data-decode-in data-text={`${c.place.toUpperCase()} / ${c.time}`} />
              </div>
              <h2 className="tcard-title" aria-hidden data-decode-in data-text={c.title.toUpperCase()} />
            </div>
          </div>
        </div>
      ))}

      {episodes.flatMap((ep) =>
        ep.captions.map((c, i) => (
          <aside
            key={`${ep.id}-${i}`}
            className={`caption caption--${c.place} caption--${c.tone ?? 'paper'}`}
            data-caption
            data-ep={ep.id}
            data-from={c.from}
            data-to={c.to}
            data-text={c.text}
          >
            {c.kicker && <span className="caption-kicker" data-decode data-text={c.kicker} />}
            {c.tone === 'speech' ? <p data-type data-text={c.text} /> : <p data-decode data-text={c.text} />}
          </aside>
        )),
      )}

      {/* the fight's prompts (Figma "Text-placement"): ACTION top left, PRESS D TO DEFEND bottom right (combatPrompt.ts) */}
      <canvas className="fx-action" aria-hidden />
      <button
        type="button"
        className="fx-defend"
        aria-hidden={prompt !== 'defend'}
        aria-label="Press D to defend"
        tabIndex={prompt === 'defend' ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          defend();
        }}
      >
        <span className="fx-row">
          <svg className="fx-arrow" viewBox={`0 0 ${ARROW.w} ${ARROW.h}`} aria-hidden>
            <path d={ARROW.d} fill="currentColor" />
          </svg>
          <span className="fx-word" data-text="PRESS" />
          <span className="fx-key">
            <span data-text="D" />
          </span>
        </span>
        <span className="fx-word" data-text="TO DEFEND" />
      </button>

      {/* the thoughts in the car: bottom centre, typed (car/thoughts.ts) */}
      <div className="thoughts" aria-live="polite">
        <div className="thoughts-text" />
      </div>

      <canvas className="impact" aria-hidden />

      <RevPrompt prompt={prompt} />

      <div className="cue">
        <span>Scroll</span>
        <i />
      </div>

      <nav className="rail" aria-label="DRUNKFURT chapters">
        <div className="rail-line">
          <div className="rail-fill" />
        </div>
        <ol>
          {CHAPTERS.map((c) => (
            <li key={c.number} className="is-built" data-chapter={c.number} title={c.title}>
              <span>{pad(c.number)}</span>
            </li>
          ))}
        </ol>
      </nav>

      <button type="button" className="sound" onClick={toggleSound} aria-pressed={sound}>
        Sound {sound ? 'on' : 'off'}
      </button>


      <section className="outro">
        <span className="title-brand">DRUNKFURT</span>
        <h2 className="title-name">To be continued</h2>
      </section>
    </div>
  );
}
