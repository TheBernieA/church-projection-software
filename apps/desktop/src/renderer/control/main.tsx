import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '../shared/fonts';
import './styles.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LiveWindow } from './LiveWindow';
import { bootstrap, connect, refresh } from './lib/store';

// The Live console's own window loads only what the console needs.
const liveOnly = new URLSearchParams(location.search).get('view') === 'live';
connect({ lean: liveOnly });
void (liveOnly ? refresh('settings') : bootstrap());

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode>{liveOnly ? <LiveWindow /> : <App />}</StrictMode>);
