import { parseChordLine } from '@lampstand/lyrics';
import { StageView } from '@lampstand/renderer';
import { fontsReady } from '../shared/fonts';
import { mediaUrl } from '../shared/mediaUrl';
import { applyScreenAdjust } from '../shared/screenAdjust';
import '../shared/outputApi.d';

/**
 * Stage display (§14.1): the stage layout chosen in the Stage workspace (Now and Next, clock,
 * timers, notes, chords, booth message…), drawn by the same view as the layout editor.
 */
const api = window.lampstandOutput;
const host = document.getElementById('stage');
if (!host) throw new Error('stage');
const view = new StageView(host, { mediaUrl, parseChords: parseChordLine });

api.onInfo((info) => {
  view.setLayout(info.stageLayout);
  // Fitted to its screen like the audience outputs (keystone, flips, colour).
  applyScreenAdjust(host, info.adjust);
});
api.onLiveState((state) => view.update(state));
void fontsReady().then(() => api.ready());
