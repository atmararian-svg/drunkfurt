import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { showStub, stubReason } from './ui/stub';

// where the story cannot run as it should (no WebGL; a phone or tablet), a page of its own in its
// place, and none of the 3D is loaded
const reason = stubReason();
if (reason) showStub(reason);
else
  void import('./App').then(({ App }) =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
