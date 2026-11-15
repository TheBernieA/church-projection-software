import {
  formatClock,
  formatTimer,
  makeScene,
  secondsSince,
  timerSeconds,
  type LiveState,
  type LiveTimer,
} from '@lampstand/core';
import { parseChordLine } from '@lampstand/lyrics';
import { SceneRenderer } from '@lampstand/renderer';
import { fontsReady } from '../shared/fonts';
import { mediaUrl } from '../shared/media-url';
import '../shared/output-api.d';

/** Stage display (§14.1): current + next slide, clock, elapsed timer, notes, booth message. */
const api = window.lampstandOutput;
const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(id);
  return e;
};
const current = new SceneRenderer($('current'), { mode: 'monitor', mediaUrl });
const next = new SceneRenderer($('next'), { mode: 'monitor', mediaUrl });
let since: string | null = null;
let timers: LiveTimer[] = [];
let lastMessageAt = '';

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
function tick(): void {
  $('clock').textContent = timeOfDay.format(new Date());
  $('elapsed').textContent = since ? formatClock(secondsSince(since)) : '';
  drawTimers();
}

/** Started timers (Timers bin), each "Name 04:59"; red once a countdown overruns. */
function drawTimers(): void {
  const now = Date.now();
  $('timers').replaceChildren(
    ...timers.map((t) => {
      const secs = timerSeconds(t, now);
      const chip = document.createElement('span');
      chip.className = `timer${secs < 0 ? ' over' : ''}${t.running ? '' : ' paused'}`;
      const name = document.createElement('span');
      name.className = 'timer-name';
      name.textContent = t.name;
      const value = document.createElement('span');
      value.className = 'timer-value';
      value.textContent = formatTimer(secs, t.kind);
      chip.append(name, value);
      return chip;
    }),
  );
}
setInterval(tick, 500);
tick();

function draw(state: LiveState): void {
  // The stage shows content even when the room is on black/logo, and never overlays.
  const p = state.program;
  current.render(makeScene({ background: p.background, media: p.media, content: p.content }), {
    instant: true,
  });
  next.render(makeScene({ background: p.background, content: state.next }), { instant: true });
  since = state.programSince;
  timers = state.timers;
  drawTimers();
  $('label').textContent = state.program.content?.label ?? '';
  $('notes').textContent = state.program.content?.notes ?? '';
  drawChords(state.program.content?.chords);
  const msg = $('message');
  if (state.stageMessage) {
    msg.hidden = false;
    msg.textContent = state.stageMessage.text;
    if (state.stageMessage.flash && state.stageMessage.sentAt !== lastMessageAt) {
      msg.classList.remove('flash');
      msg.getBoundingClientRect(); // restart the CSS animation
      msg.classList.add('flash');
    }
    lastMessageAt = state.stageMessage.sentAt;
  } else msg.hidden = true;
}

/**
 * Chord chart for the band: each line as a chord row over its lyric row, in a monospace font
 * so a chord sits exactly over the syllable it's played on (positions are in `ch`).
 */
function drawChords(lines: string[] | undefined): void {
  const box = $('chords');
  box.hidden = !lines?.length;
  box.replaceChildren(
    ...(lines ?? []).map((line) => {
      const { text, chords } = parseChordLine(line);
      const row = document.createElement('div');
      row.className = 'chord-line';
      if (chords.length) {
        const top = document.createElement('div');
        top.className = 'chord-row';
        for (const c of chords) {
          const s = document.createElement('span');
          s.textContent = c.chord;
          s.style.left = `${c.pos}ch`;
          top.append(s);
        }
        row.append(top);
      }
      const lyric = document.createElement('div');
      lyric.className = 'lyric-row';
      lyric.textContent = text || ' ';
      row.append(lyric);
      return row;
    }),
  );
}

api.onInfo(() => undefined);
api.onLiveState(draw);
void fontsReady().then(() => api.ready());
