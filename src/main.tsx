import { Component, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { mountDitherCursor } from './ui/ditherCursor';
import { showStub, stubReason } from './ui/stub';
import { mountDiag } from './ui/diag';
import { GAME } from './game/mode';
import { showErrorPage } from './ui/errorPage';

/** Anything that throws inside the page: the error page in its place (ui/errorPage.ts). */
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[page]', err);
    showErrorPage(String((err as Error)?.message ?? err));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// the game build: the page does not scroll (the walk moves the story), the pointer is the look
if (GAME) document.documentElement.classList.add('game');

// (?diag: what makes the page wait, in a panel: ui/diag.ts)
mountDiag();

// (?error: the error page on its own, to see it)
if (new URLSearchParams(location.search).has('error')) {
  if (document.body) showErrorPage('preview');
  else window.addEventListener('DOMContentLoaded', () => showErrorPage('preview'));
}

// where the story cannot run as it should (no WebGL; a phone or tablet), a page of its own in its
// place (with no WebGL, none of the 3D is loaded)
const reason = stubReason();
if (reason) showStub(reason);
// on a phone, chapter 3's room behind its page: only to be looked at (App's backdrop)
if (reason === 'desktop')
  void import('./App').then(({ App, setBackdrop }) => {
    setBackdrop(true);
    createRoot(document.getElementById('root')!).render(<App />);
  });
else if (!reason)
  void import('./App').then(({ App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <PageBoundary>
          <App />
        </PageBoundary>
      </StrictMode>,
    );
    // the dither trail under the pointer (not on touch; not in the game, where the pointer is the look)
    if (!GAME) mountDitherCursor();
  });
