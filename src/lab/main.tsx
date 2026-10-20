import { createRoot } from 'react-dom/client';
import { Lab } from './Lab';

// Dev-only inspection page (lab.html): not part of the production build.
createRoot(document.getElementById('root')!).render(<Lab />);
