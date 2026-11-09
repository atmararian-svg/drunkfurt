import { useEffect, useMemo, useRef } from 'react';
import { audio } from '../audio/AudioDirector';
import { clamp, smoothstep } from '../core/math';
import { story, useStory } from '../core/store';
import { CHAPTERS } from '../core/chapters';
import { chapterTurn, episodeRange, gateLimit, locate, scrollToProgress, timeline } from '../core/timeline';
import { builtEpisodes } from '../episodes';
import { decodeAll, hoverDecode, splitChars } from './decode';
import { BEAT, BLOCK, KO, defend, encounterAt } from '../scenes/city/encounter';
import { drawBrushWipe, drawHits, drawKnockout, drawSpeedLines } from './brush';
import { launchAt } from '../scenes/car/getaway';
import { aboutClick, enterSite, monitor, pick } from '../scenes/home/monitor';
import { RevPrompt } from './RevPrompt';
import { mountCombatPrompts, updateCombatPrompts } from './combatPrompt';
import { setScenePixels } from './scenePixels';
import { ICON_MUTED, ICON_SOUND, LOGO_SVG } from './headerArt';
import { mountTextBoxes } from './textBoxes';
import { TOUCH } from './touch';
import { createTypewriter, Typewriter } from './typewriter';
import { letter, letterSpot, pickLetter, skipInvitation } from '../scenes/city/letter';
import { closeLetterNow, openLetter } from './letterReveal';
import { mountChapterTuner, tunerAway, tunerBackdrop, updateTuner } from './chapterTuner';
import { MONOLOGUE, skipThoughts, thoughts, thoughtsTyped, updateThoughts } from '../scenes/car/thoughts';
import { MONOLOGUE_LINES } from '../audio/voices';
import { PressPrompt } from './PressPrompt';

/** Once you defend: the street breaks into coarse pixels, blurs and darkens, which hides the fight (block px, blur 0 … 1, dark 0 … 1). */
const HIDE = { block: 26, blur: 0.85, dark: 0.8 };
/** Defended: the fight under it still reads, as shapes moving behind frosted glass. */
const VEIL = { block: 9, blur: 0.6, dark: 0.3 };

/**
 * How the street looks around the fight: block size (CSS px; 1 = not
 * pixelated), blur and darkness, as pure functions of the progress and the
 * encounter, so a scrub, a revisit or a reset can never leave it stuck.
 * Nothing happens while he only approaches or threatens: it starts when you
 * press D. Defended, once ACTION has gone (BLOCK.veil) the street breaks into
 * pixels and blurs, by BLOCK.blurred, before the first blow: the fight goes on
 * under it, seen through it (VEIL); a knockout goes dark (HIDE). On the
 * aftermath all of it resolves, back to the plain picture before the letter.
 */
function combatLook(id: string, local: number) {
  const none = { block: 1, blur: 0, dark: 0 };
  if (id !== 'city' || local < BEAT.gate) return none;
  const v = encounterAt(local);
  if (!v.outcome) return none;
  const [from, full, look] = v.outcome === 'blocked' ? [BLOCK.veil, BLOCK.blurred, VEIL] : [0, KO.dark, HIDE];
  const hide = local < BEAT.aftermath ? smoothstep(clamp((v.t - from) / (full - from), 0, 1)) : 1;
  const out = local < BEAT.aftermath ? 1 : 1 - smoothstep(clamp((local - BEAT.aftermath) / 0.045, 0, 1));
  const k = hide * out;
  return { block: 1 + (look.block - 1) * k, blur: look.blur * k, dark: look.dark * k };
}

/** ACTION is up from the moment he raises the knife until you act: it leaves first, before the pixels and the hits. */
function actionShown(id: string, local: number) {
  if (id !== 'city' || local < BEAT.cock || local >= BEAT.aftermath) return false;
  const v = encounterAt(local);
  if (!v.outcome) return true;
  return v.outcome === 'knockedOut' && v.t < KO.dark;
}

/**
 * Ink over the whole frame at a given progress: the closing card. The fight is
 * hidden by the street's own pixels (combatLook), and moving between chapters
 * is the chapter transition's (chapterTransition.ts), not ink.
 */
function inkAt(p: number): { w: number; mode: 'close' | 'open' } {
  return locate(p).id === 'outro' ? { w: 1, mode: 'close' } : { w: 0, mode: 'open' };
}

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
  const soundText = useRef<HTMLSpanElement>(null);
  useEffect(() => mountChapterTuner(), []);
  // one list for the page's life: the effects below must not re-run (and restart what they drive) on every re-render
  const episodes = useMemo(builtEpisodes, []);

  useEffect(() => {
    let raf = 0;
    const el = root.current!;
    const captions = Array.from(el.querySelectorAll<HTMLElement>('[data-caption]'));
    // speech is typed in at the bottom of the page (the captions here); his thoughts and the system's tips
    // go to the two text boxes (textBoxes.ts)
    const allDefs = episodes.flatMap((ep) => ep.captions.map((c, i) => ({ c, ep: ep.id, key: `${ep.id}-${i}` })));
    const capDefs = allDefs.filter((d) => d.c.tone === 'speech').map((d) => d.c);
    const boxDefs = allDefs.filter((d) => d.c.tone !== 'speech');
    const boxes = mountTextBoxes(el);
    const outro = el.querySelector<HTMLElement>('.outro')!;
    // balloons are typed in (the supplied typewriter); the thoughts in the car as well, line by line
    const typed = new Map<HTMLElement, { tw: Typewriter; on: boolean }>();
    captions.forEach((c) => {
      const p = c.querySelector<HTMLElement>('[data-type]');
      if (p) typed.set(c, { tw: createTypewriter(p, { startDelay: 250 }), on: false });
    });
    // (balloons are lettered in capitals: ß is set as its capital, ẞ, which the capitals keep as it is)
    // (the last two words of each line are held together, so a narrower page never leaves one word alone on a line)
    const spoken = (text: string) => text.replace(/ß/g, 'ẞ').replace(/ (\S+)$/gm, '\u00a0$1');
    const thoughtEl = el.querySelector<HTMLElement>('.thoughts-text')!;
    // typed as he says it: each line typed quickly enough to keep up with his voice (the longest, 97
    // characters, in the 4 s he takes over it), wiped at once, and the next begun as his voice reaches it
    // (MONOLOGUE_LINES); the last stands until he has said it. Without the voice, the old reading pace.
    const MONO = { type: 36, del: 8, afterDelete: 60 };
    const thoughtTw = createTypewriter(thoughtEl, {
      content: 'lines',
      stableHeight: false,
      startDelay: 500,
      typeSpeed: MONO.type,
      deleteSpeed: MONO.del,
      pauseAfterDelete: MONO.afterDelete,
      pauseAfterType: (t) => {
        const i = monologueLines.indexOf(t);
        if (!monologueAt || i < 0) return 900 + 24 * t.length;
        const elapsed = performance.now() - monologueAt;
        if (i + 1 >= MONOLOGUE_LINES.length) return Math.max(250, audio.sayingLeft() + 300);
        // the wipe and the pause after it come before the next line: the next starts on the voice's cue
        const wipe = t.length * MONO.del + MONO.afterDelete;
        return Math.max(120, MONOLOGUE_LINES[i + 1] * 1000 - elapsed - wipe);
      },
    });
    const thoughtBox = el.querySelector<HTMLElement>('.thoughts')!;
    let thoughtsOn = false;
    /** The thought last shown fresh (for saying its line as it comes up), and those already said this pass. */
    let lastThought: string | null = null;
    const said = new Set<string>();
    /** When the car's thoughts were last started being said (for the typing to keep pace with the voice). */
    let monologueAt = 0;
    const monologueLines = MONOLOGUE.split('\n');
    // SKIP DIALOGUE (bottom right, or D): while the invitation is said, or the thoughts in the car are typed
    const skipBtn = el.querySelector<HTMLButtonElement>('.skip')!;
    const skippable = () => {
      const ask = story.getState().prompt;
      return (ask === 'invite' && letter.read && !letter.invited) || (ask === 'thought' && !thoughts.done);
    };
    const skip = () => {
      if (!skippable()) return;
      // (skipped: his voice stops with the words)
      audio.hush();
      if (story.getState().prompt === 'thought') {
        thoughtTw.stop();
        skipThoughts();
      } else {
        // the words still being typed are shown whole at once (the address in them is worth keeping)
        captions.forEach((c) => {
          const t = typed.get(c);
          if (t?.on && t.tw.typing) t.tw.show(spoken(c.dataset.text ?? ''));
        });
        skipInvitation();
      }
    };
    const skipKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyD' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !skippable()) return;
      e.preventDefault();
      skip();
    };
    skipBtn.addEventListener('click', skip);
    window.addEventListener('keydown', skipKey);
    const unmountPrompts = mountCombatPrompts(el.querySelector<HTMLCanvasElement>('.fx-action')!, {
      defend: el.querySelector<HTMLElement>('.fx-press--defend')!,
      rev: el.querySelector<HTMLElement>('.fx-press--rev')!,
    });
    const wipe = el.querySelector<HTMLCanvasElement>('.wipe')!;
    const hit = el.querySelector<HTMLCanvasElement>('.impact')!;
    const wctx = wipe.getContext('2d')!;
    const hctx = hit.getContext('2d')!;
    let last = '';
    // (anything left on the canvases from before this effect ran is cleared on the first frame)
    let lastHit = '\u0000';
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
        // (while a chapter turns, the captions leave before the page is copied: chapterTransition.ts)
        const on = !chapterTurn.busy && c.dataset.ep === id && local >= Number(c.dataset.from) && local <= Number(c.dataset.to) && (!when || when());
        c.classList.toggle('is-on', on);
        const t = typed.get(c);
        if (t && t.on !== on) {
          t.on = on;
          const voice = capDefs[i].voice;
          if (on) {
            // his recorded line with it, started as the typing starts (after its start delay)
            if (voice) window.setTimeout(() => t.on && audio.speak(voice), 250);
            void t.tw.play(spoken(c.dataset.text ?? '')).then(() => capDefs[i].onTyped?.());
          } else {
            t.tw.stop();
            if (voice && audio.saying() === voice) audio.hush();
          }
        }
      });
      // the fight: ACTION and PRESS D TO DEFEND, and the street breaking into coarse pixels (blurred and dark once you defend)
      // (the same ACTION and panel system asks for D in the car, to rev)
      const ask = story.getState().prompt;
      // his thoughts and the system's tips: the first that holds here of each; both keep out of the way while the
      // page asks you to act, the letter is open, a chapter turns, or the page is handed over to the site
      const holds = (d: (typeof boxDefs)[number]) => d.ep === id && local >= d.c.from && local <= d.c.to && (!d.c.when || d.c.when());
      // (a thought whose recorded line is still being said stays up until it is said, unless another comes)
      const fresh = boxDefs.find((d) => d.c.tone !== 'tip' && holds(d));
      const saying = audio.saying();
      const thought = fresh ?? boxDefs.find((d) => d.ep === id && !!d.c.voice && d.c.voice === saying);
      // his line, said as his thought comes up (each time it comes up afresh)
      const thoughtKey = fresh?.key ?? null;
      // (once per pass through a chapter: scrolling back and forth shows the thought again, but it is not said
      // again; a chapter turn starts a fresh pass)
      if (chapterTurn.busy) said.clear();
      if (thoughtKey !== lastThought) {
        lastThought = thoughtKey;
        if (fresh?.c.voice && !chapterTurn.busy && !said.has(fresh.key)) {
          said.add(fresh.key);
          audio.speak(fresh.c.voice);
        }
      }
      // a line from a chapter no longer on screen (a turn, a jump back) is not said on into another
      if (saying && saying !== '15' && saying !== 'letter' && !allDefs.some((d) => d.ep === id && d.c.voice === saying)) audio.hush();
      const tipDef = boxDefs.find((d) => d.c.tone === 'tip' && holds(d));
      const html = document.documentElement.classList;
      const busy =
        actionShown(id, local) || ask === 'defend' || ask === 'rev' || letter.open || chapterTurn.busy || monitor.entering || html.contains('is-preloading') || html.contains('site-handoff');
      boxes.update(
        thought ? { key: thought.key, text: thought.c.text, kicker: thought.c.kicker } : null,
        tipDef ? { key: tipDef.key, text: tipDef.c.text, plain: tipDef.c.plain } : null,
        busy,
      );
      updateCombatPrompts(actionShown(id, local) || ask === 'rev', ask === 'defend' ? 'defend' : ask === 'rev' ? 'rev' : null);
      const look = combatLook(id, local);
      // the header's words and mark make way while the story asks you to act and the fight plays (the sound switch stays)
      const fighting = actionShown(id, local) || ask === 'defend' || ask === 'rev' || look.block > 1.01;
      if (headRef.current && headRef.current.classList.contains('is-away') !== fighting) headRef.current.classList.toggle('is-away', fighting);
      // the chapter tuner open: the page behind it dims and breaks into pixels (the scene, and the printed matter over it)
      // (on a phone the selector slides away down while the story asks you to act: ACTION, a tap, the letter, the screen)
      tunerAway(actionShown(id, local) || ask === 'defend' || ask === 'rev' || ask === 'letter' || ask === 'monitor' || letter.open);
      updateTuner();
      const tk = tunerBackdrop();
      setScenePixels(Math.max(look.block, 1 + 7 * tk), Math.max(look.blur, 0.35 * tk), Math.max(look.dark, 0.45 * tk));
      // (the printed matter's pixels only once they are at least 2 px: before that it only darkens, so nothing snaps on)
      el.style.filter = tk > 0.005 ? `${tk > 0.12 ? 'url(#df-pixelate) ' : ''}brightness(${(1 - 0.55 * tk).toFixed(3)})` : '';
      // the thoughts in the car, once the door has shut (car/thoughts.ts holds the story until they are done)
      const think = id === 'car' && updateThoughts();
      if (think !== thoughtsOn) {
        thoughtsOn = think;
        thoughtBox.classList.toggle('is-on', think);
        if (!think) {
          thoughtTw.stop();
          if (!thoughts.done) thoughts.started = false;
          if (audio.saying() === '15') audio.hush();
        }
      }
      if (think && !thoughts.started) {
        thoughts.started = true;
        if (thoughts.done) thoughtTw.show(MONOLOGUE);
        else {
          // said as typed: the voice starts with the first line (after the typing's start delay)
          monologueAt = 0;
          window.setTimeout(() => {
            if (!thoughtsOn || thoughts.done) return;
            audio.speak('15');
            monologueAt = performance.now();
          }, 500);
          void thoughtTw.play(MONOLOGUE).then(() => thoughtsTyped(() => thoughtTw.erase()));
        }
      }
      const canSkip = skippable();
      if (skipBtn.classList.contains('is-on') !== canSkip) {
        skipBtn.classList.toggle('is-on', canSkip);
        skipBtn.tabIndex = canSkip ? 0 : -1;
      }
      outro.classList.toggle('is-on', id === 'outro' && local > 0.15);

      const ink = inkAt(p);
      const key = `${ink.w.toFixed(3)}${ink.mode}${wipe.width}`;
      if (key !== last) {
        drawBrushWipe(wctx, wipe.width, wipe.height, clamp(ink.w, 0, 1), ink.mode, 7);
        last = key;
        wipe.style.visibility = ink.w > 0.001 ? 'visible' : 'hidden';
      }
      // the fight frames, a function of where the fight is (its time comes from the progress):
      // defended, the page goes black and the two hits are printed into the dark;
      // knocked out, a flash, then the lights go out as you fall
      const v = id === 'city' ? encounterAt(local) : null;
      // (BAM and POW leave as the blur clears, over the aftermath's first frames: back into blocks, fading)
      const HIT_LEAVE = 0.03;
      const hitLeave = v?.outcome === 'blocked' ? clamp((local - BEAT.aftermath) / HIT_LEAVE, 0, 1) : 0;
      const hitT = !v || v.t < 0 || (local >= BEAT.aftermath && (v.outcome !== 'blocked' || hitLeave >= 1)) ? -1 : v.t;
      // episode 3: the rush at the end of the launch, in speed lines
      const run = id === 'car' ? launchAt(local) : null;
      const rush = run && run.rpm >= 0 ? run.rush : 0;
      const hitKey = hitT >= 0 ? `${v!.outcome}${hitT.toFixed(3)}${hitLeave.toFixed(3)}${hit.width}` : rush > 0 ? `rush${rush.toFixed(2)}${Math.floor(run!.t * 24)}${hit.width}` : '';
      if (hitKey !== lastHit) {
        hctx.clearRect(0, 0, hit.width, hit.height);
        if (hitT >= 0 && v!.outcome === 'knockedOut') drawKnockout(hctx, hit.width, hit.height, hitT, KO.dark);
        else if (hitT >= 0) drawHits(hctx, hit.width, hit.height, hitT, BLOCK, hitLeave);
        else if (rush > 0) drawSpeedLines(hctx, hit.width, hit.height, rush, run!.t);
        lastHit = hitKey;
        // nothing to show: the layer is taken off the page as well as cleared, so no earlier picture on it can stay up
        hit.style.visibility = hitKey ? 'visible' : 'hidden';
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
      skipBtn.removeEventListener('click', skip);
      boxes.dispose();
      window.removeEventListener('keydown', skipKey);
      unmountPrompts();
      setScenePixels(1);
      el.style.filter = '';
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
        // the screen about the author: read it, or stop reading
        if (aboutClick(e?.clientX, e?.clientY)) return;
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
        if (!letter.open && (!e || pickLetter(e.clientX, e.clientY))) openLetter(() => (letter.read = true), letterSpot());
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
      // S switches the sound (the header's switch says so: [S]), anywhere in the story
      if (e.code === 'KeyS' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleSoundRef.current();
        return;
      }
      // D defends (the one keyboard handler of the story; the car listens for its own D, only to rev)
      if (e.code === 'KeyD' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && story.getState().prompt === 'defend') {
        e.preventDefault();
        defend();
        return;
      }
      if (letter.open) return;
      // Enter on the chapter tuner's stations is theirs
      if ((e.target as HTMLElement | null)?.closest?.('.tuner')) return;
      if (e.code === 'Enter' || (e.code === 'Space' && story.getState().prompt)) {
        e.preventDefault();
        next();
      }
    };
    const onClick = (e: MouseEvent) => {
      unlock();
      if ((e.target as HTMLElement).closest('a,button,.fx-press,.whiteout,.preloader,.letter-layer')) return;
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

  // the switch's label, split for decoding; a new label decodes in
  const soundShown = useRef('');
  const toggleSoundRef = useRef(() => undefined as void);
  const headRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = soundText.current!;
    // (the label says what a click does: SOUND OFF while it plays, SOUND ON while it is off)
    const text = `SOUND ${sound ? 'OFF' : 'ON'}`;
    if (!soundShown.current) splitChars(el);
    else void decodeAll(el, 380);
    soundShown.current = text;
  }, [sound]);

  const toggleSound = () => {
    const on = !story.getState().sound;
    story.setState({ sound: on });
    audio.unlock();
    audio.setEnabled(on);
  };
  toggleSoundRef.current = toggleSound;

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
        ep.captions.filter((c) => c.tone === 'speech').map((c, i) => (
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
      <PressPrompt
        kind="defend"
        action="TO DEFEND"
        on={prompt === 'defend'}
        label="Press D to defend"
        onClick={(e) => {
          e.stopPropagation();
          defend();
        }}
      />

      {/* the thoughts in the car: bottom centre, typed (car/thoughts.ts) */}
      <div className="thoughts" aria-live="polite">
        <div className="thoughts-text" />
      </div>

      <canvas className="impact" aria-hidden />

      <RevPrompt prompt={prompt} />

      <button type="button" className="skip" tabIndex={-1} aria-label="Skip dialogue">
        {TOUCH ? (
          'TAP TO SKIP'
        ) : (
          <>
            <span className="skip-key">[D]</span> SKIP DIALOGUE
          </>
        )}
      </button>

      {/* the chapter tuner (chapterTuner.ts) is its own element on the page, so the dimming of the page behind it leaves it alone */}

      {/* the header (Figma "Drunkfurt-header"): a line on the left, the logo in the middle, the sound switch on the right */}
      <header className="site-head" ref={headRef}>
        <p className="head-line">
          They need a hero,
          <br />
          and I’m here to save them.
        </p>
        <span className="head-logo" role="img" aria-label="DRUNKFURT" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        {/*
          the sound switch: [S] and what a click does, and a square with the sound's state; the pointer on it
          slides the label right and the square round to the left (theperformancelab.ca's buttons), the label
          decoding; a click (or S) switches the sound and the label decodes into the other word
        */}
        <button
          type="button"
          className="snd-btn"
          onClick={toggleSound}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'touch') void decodeAll(soundText.current!, 420);
          }}
          aria-pressed={sound}
          aria-label={`Sound ${sound ? 'on' : 'off'}`}
          aria-keyshortcuts="S"
        >
          <span className="snd-label">
            <span className="snd-key" aria-hidden>
              [S]
            </span>
            <span ref={soundText} data-text={`SOUND ${sound ? 'OFF' : 'ON'}`} aria-hidden />
          </span>
          <span className="snd-sq snd-sq--right" aria-hidden>
            <span className="snd-face" dangerouslySetInnerHTML={{ __html: sound ? ICON_SOUND : ICON_MUTED }} />
          </span>
          <span className="snd-sq snd-sq--left" aria-hidden>
            <span className="snd-face" dangerouslySetInnerHTML={{ __html: sound ? ICON_SOUND : ICON_MUTED }} />
          </span>
        </button>
      </header>


      <section className="outro">
        <span className="title-brand">DRUNKFURT</span>
        <h2 className="title-name">To be continued</h2>
      </section>
    </div>
  );
}
