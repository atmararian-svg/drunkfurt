import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { mountDitherCursor } from './ui/ditherCursor';
import { showStub, stubReason } from './ui/stub';
import { mountDiag } from './ui/diag';
import { GAME } from './game/mode';

// the game build: the page does not scroll (the walk moves the story), the pointer is the look
if (GAME) document.documentElement.classList.add('game');

// (?diag: what makes the page wait, in a panel: ui/diag.ts)
mountDiag();

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
        <App />
      </StrictMode>,
    );
    // the dither trail under the pointer (not on touch; not in the game, where the pointer is the look)
    if (!GAME) mountDitherCursor();
  });
