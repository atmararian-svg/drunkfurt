import { useEffect, useRef } from 'react';
import { clamp } from '../core/math';
import { useStory } from '../core/store';
import { EPISODE_SPANS, episodeRange, locate, scrollToProgress, timeline } from '../core/timeline';
import { PLANNED, builtEpisodes } from '../episodes';

/**
 * Everything on top of the canvas is printed matter: a title panel, caption
 * boxes, a thin episode rail, and the "to be continued" card. All of it is
 * driven by the same scroll progress as the camera, updated per frame through
 * refs rather than React state.
 */
export function Overlay() {
  const phase = useStory((s) => s.phase);
  const root = useRef<HTMLDivElement>(null);
  const episodes = builtEpisodes();

  useEffect(() => {
    let raf = 0;
    const el = root.current!;
    const captions = Array.from(el.querySelectorAll<HTMLElement>('[data-caption]'));
    const titles = Array.from(el.querySelectorAll<HTMLElement>('[data-title]'));
    const fill = el.querySelector<HTMLElement>('.rail-fill')!;
    const cue = el.querySelector<HTMLElement>('.cue')!;
    const wipe = el.querySelector<HTMLElement>('.wipe')!;
    const outro = el.querySelector<HTMLElement>('.outro')!;
    const loop = () => {
      const p = timeline.progress;
      const { id, local } = locate(p);
      for (const c of captions) {
        const on = c.dataset.ep === id && local >= Number(c.dataset.from) && local <= Number(c.dataset.to);
        c.classList.toggle('is-on', on);
      }
      for (const t of titles) t.classList.toggle('is-on', t.dataset.ep === id && local < 0.09);
      fill.style.transform = `scaleY(${p})`;
      cue.classList.toggle('is-on', p < 0.004);
      // ink wipe closes over the last stretch of an episode and opens on the next
      const edge = id === 'outro' ? 1 : clamp((local - 0.955) / 0.045, 0, 1);
      wipe.style.setProperty('--w', String(edge));
      outro.classList.toggle('is-on', id === 'outro' && local > 0.15);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Click or Enter: travel to the next composed beat. */
  useEffect(() => {
    const next = () => {
      const { id, local } = locate(timeline.target);
      const ep = episodes.find((e) => e.id === id);
      if (!ep) return;
      const r = episodeRange(ep.id);
      const beat = ep.beats.find((b) => b > local + 0.01);
      scrollToProgress(beat === undefined ? r.end + 0.001 : r.start + beat * (r.end - r.start));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') next();
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a,button')) return;
      next();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [episodes]);

  return (
    <div className="overlay" ref={root}>
      <div className={`veil ${phase === 'loading' ? 'is-on' : ''}`} />

      {episodes.map((ep) => (
        <header key={ep.id} className="title" data-title data-ep={ep.id}>
          <span className="title-kicker">DRUNKFURT · Episode {ep.number}</span>
          <h1 className="title-name">{ep.title}</h1>
          <span className="title-sub">{ep.subtitle}</span>
        </header>
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
          >
            {c.kicker && <span className="caption-kicker">{c.kicker}</span>}
            <p>{c.text}</p>
          </aside>
        )),
      )}

      <div className="cue">
        <span>Scroll</span>
        <i />
      </div>

      <nav className="rail" aria-label="DRUNKFURT episodes">
        <div className="rail-line">
          <div className="rail-fill" />
        </div>
        <ol>
          {PLANNED.map((p) => {
            const built = EPISODE_SPANS.find((_, i) => i === p.number - 1);
            return (
              <li key={p.number} className={built ? 'is-built' : ''} title={p.title}>
                <span>{String(p.number).padStart(2, '0')}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="wipe" />
      <section className="outro">
        <span className="title-kicker">DRUNKFURT · Episode 2</span>
        <h2 className="title-name">Die Stadt</h2>
        <p>Fortsetzung folgt.</p>
      </section>
    </div>
  );
}
