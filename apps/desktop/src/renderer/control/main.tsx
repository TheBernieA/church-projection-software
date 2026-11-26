import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '../shared/fonts';
import './styles.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CamerasWindow } from './CamerasWindow';
import { LiveWindow } from './LiveWindow';
import { MultiviewWindow } from './MultiviewWindow';
import { bootstrap, connect, refresh, type RepoKind } from './lib/store';

/**
 * The control page, or one of its panels in a window of its own (`?view=live` for the Live
 * console, `?view=multiview`, `?view=cameras`), which loads only what it shows.
 */
const view = new URLSearchParams(location.search).get('view');
const PANELS: Record<string, { needs: readonly RepoKind[]; page: () => React.JSX.Element }> = {
  live: { needs: ['settings'], page: () => <LiveWindow /> },
  cameras: { needs: ['settings', 'themes'], page: () => <CamerasWindow /> },
  multiview: {
    needs: ['settings', 'themes', 'displays', 'media'],
    page: () => <MultiviewWindow />,
  },
};
const panel = view ? PANELS[view] : undefined;
connect(panel ? { only: panel.needs } : {});
if (panel) for (const kind of panel.needs) void refresh(kind);
else void bootstrap();

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode>{panel ? panel.page() : <App />}</StrictMode>);
