import {
  formatClock,
  formatTimer,
  makeScene,
  secondsSince,
  timerSeconds,
  type LiveState,
  type StageElement,
  type StageLayout,
} from '@lampstand/core';
import { el } from './dom';
import { SceneRenderer } from './sceneRenderer';

/** A lyric line with its chords, split by the caller (keeps this package free of lyrics). */
export type ChordParser = (line: string) => {
  text: string;
  chords: { chord: string; pos: number }[];
};

export interface StageViewOptions {
  mediaUrl: (id: string) => string;
  parseChords?: ChordParser;
  /** Labels for the Now / Next tags (localised by the caller). */
  labels?: { now: string; next: string };
  /** Editor preview: every element shows, even with nothing to say (with a placeholder). */
  showEmpty?: boolean;
  /** Placeholder names for empty elements in the editor. */
  names?: Partial<Record<StageElement['kind'], string>>;
}

/**
 * The stage screen's look, scoped to `.ls-stage` and sized in container units (cqh), so the
 * same layout reads the same on a projector and in the small editor preview.
 */
const STYLE = `
.ls-stage{position:absolute;inset:0;container-type:size;background:#07080c;color:#eceef4;font-family:'Inter',system-ui,sans-serif;overflow:hidden}
.ls-stage *{box-sizing:border-box}
.ls-st-el{position:absolute;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.ls-st-el[hidden]{display:none}
.ls-st-tag{font-size:2.2cqh;text-transform:uppercase;letter-spacing:.12em;color:#9aa1b5;margin-bottom:.8cqh;flex:none}
.ls-st-current .ls-st-tag{color:#e5484d}
.ls-st-screen{position:relative;flex:1;min-height:0;border:2px solid #2a2f40;background:#000}
.ls-st-current .ls-st-screen{border-color:#e5484d}
.ls-st-big{font-weight:700;font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap}
.ls-st-elapsed{color:#9aa1b5}
.ls-st-label{font-weight:600;color:#e8b04b;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.ls-st-notes{color:#c8ccd8;white-space:pre-line}
.ls-st-text{white-space:pre-line;font-weight:600}
.ls-st-timers{flex-direction:row;flex-wrap:wrap;gap:1.4cqh;align-content:flex-start}
.ls-stage .timer{display:inline-flex;align-items:baseline;gap:1cqh;padding:.6cqh 1.2cqh;border-radius:1cqh;background:rgba(255,255,255,.06)}
.ls-stage .timer-name{font-size:.5em;text-transform:uppercase;letter-spacing:.08em;color:#9aa1b5}
.ls-stage .timer-value{font-weight:700;font-variant-numeric:tabular-nums}
.ls-stage .timer.over .timer-value{color:#ef4a50}
.ls-stage .timer.paused{opacity:.6}
.ls-st-chords{padding:1cqh 1.2cqh;border-radius:1cqh;background:rgba(255,255,255,.05);font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;line-height:1.15}
.ls-stage .chord-line+.chord-line{margin-top:.6cqh}
.ls-stage .chord-row{position:relative;height:1.2em;color:#f0a73a;font-weight:700}
.ls-stage .chord-row span{position:absolute;top:0;white-space:nowrap}
.ls-stage .lyric-row{white-space:pre}
.ls-st-message{align-items:center;justify-content:center;padding:2cqh 3cqh;background:#e8b04b;color:#171a24;font-weight:800;text-align:center;border-radius:1.2cqh;z-index:2}
.ls-st-message.flash{animation:ls-st-flash 1s ease-in-out 4}
@keyframes ls-st-flash{50%{opacity:.25}}
.ls-st-empty{color:rgba(236,238,244,.35);font-weight:600;font-style:italic}
`;

/** Each element's normal text size, in % of the screen height (before its own `size`). */
const BASE: Record<StageElement['kind'], number> = {
  current: 1,
  next: 1,
  clock: 6,
  elapsed: 6,
  timers: 4.4,
  label: 3.4,
  notes: 3,
  message: 7,
  chords: 2.6,
  text: 4,
};

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

interface Built {
  el: StageElement;
  node: HTMLElement;
  /** Its text part, for elements that show words or numbers. */
  body: HTMLElement;
  scene?: SceneRenderer;
}

/**
 * Draws a stage layout (Settings › Stage layouts) from the live state: Now and Next as real
 * renders, the clock, elapsed time and timers ticking, the slide's name, notes, chords and the
 * booth message. Used by the stage window and by the layout editor's preview alike.
 */
export class StageView {
  private readonly root: HTMLElement;
  private built: Built[] = [];
  private state: LiveState | null = null;
  private layoutKey = '';
  private lastMessageAt = '';
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: StageViewOptions,
  ) {
    const doc = host.ownerDocument;
    if (!doc.getElementById('ls-stage-style')) {
      const style = doc.createElement('style');
      style.id = 'ls-stage-style';
      style.textContent = STYLE;
      doc.head.append(style);
    }
    this.root = el(doc, 'div', 'ls-stage');
    host.append(this.root);
    this.timer = setInterval(() => this.tick(), 500);
  }

  /**
   * Show a layout. Moving, resizing or retyping an element updates it in place (cheap enough
   * for every pointer move while dragging in the editor); a different set of elements rebuilds.
   */
  setLayout(layout: StageLayout): void {
    const key = JSON.stringify(layout.elements);
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const same =
      layout.elements.length === this.built.length &&
      layout.elements.every((e, i) => {
        const b = this.built[i];
        return b !== undefined && e.id === b.el.id && e.kind === b.el.kind;
      });
    if (same) {
      layout.elements.forEach((e, i) => {
        const b = this.built[i];
        if (!b) return;
        b.el = e;
        this.place(b.node, e);
        if (e.kind === 'text') b.body.textContent = e.text ?? '';
      });
      return;
    }
    for (const b of this.built) b.scene?.destroy();
    this.root.replaceChildren();
    this.built = layout.elements.map((e) => this.build(e));
    if (this.state) this.update(this.state);
  }

  /** Put an element's box where the layout says, at its text size. */
  private place(node: HTMLElement, e: StageElement): void {
    Object.assign(node.style, {
      left: `${e.x}%`,
      top: `${e.y}%`,
      width: `${e.w}%`,
      height: `${e.h}%`,
      fontSize: `${BASE[e.kind] * e.size}cqh`,
    });
  }

  update(state: LiveState): void {
    this.state = state;
    const p = state.program;
    for (const b of this.built) {
      switch (b.el.kind) {
        case 'current':
          // The stage shows content even when the room is on black/logo, and never overlays.
          b.scene?.render(
            makeScene({ background: p.background, media: p.media, content: p.content }),
            {
              instant: true,
            },
          );
          break;
        case 'next':
          b.scene?.render(makeScene({ background: p.background, content: state.next }), {
            instant: true,
          });
          break;
        case 'label':
          this.say(b, p.content?.label ?? '');
          break;
        case 'notes':
          this.say(b, p.content?.notes ?? '');
          break;
        case 'chords':
          this.drawChords(b, p.content?.chords);
          break;
        case 'message':
          this.drawMessage(b, state);
          break;
        case 'clock':
        case 'elapsed':
        case 'timers':
        case 'text':
          break; // ticking or fixed: see tick()
      }
    }
    this.tick();
  }

  destroy(): void {
    clearInterval(this.timer);
    for (const b of this.built) b.scene?.destroy();
    this.root.remove();
  }

  private build(e: StageElement): Built {
    const doc = this.host.ownerDocument;
    const node = el(doc, 'div', `ls-st-el ls-st-${e.kind}`);
    this.place(node, e);
    node.dataset.kind = e.kind;
    this.root.append(node);
    if (e.kind === 'current' || e.kind === 'next') {
      const tag = el(doc, 'div', 'ls-st-tag');
      tag.textContent =
        e.kind === 'current'
          ? (this.opts.labels?.now ?? 'Now')
          : (this.opts.labels?.next ?? 'Next');
      const screen = el(doc, 'div', 'ls-st-screen');
      node.append(tag, screen);
      return {
        el: e,
        node,
        body: tag,
        scene: new SceneRenderer(screen, { mode: 'monitor', mediaUrl: this.opts.mediaUrl }),
      };
    }
    const body = el(doc, 'div', e.kind === 'clock' || e.kind === 'elapsed' ? 'ls-st-big' : '');
    node.append(body);
    if (e.kind === 'text') body.textContent = e.text ?? '';
    return { el: e, node, body };
  }

  /** Words in an element; empty ones hide (or show their name in the editor). */
  private say(b: Built, text: string): void {
    const empty = !text;
    b.node.hidden = empty && !this.opts.showEmpty;
    b.body.classList.toggle('ls-st-empty', empty);
    b.body.textContent = empty
      ? this.opts.showEmpty
        ? (this.opts.names?.[b.el.kind] ?? '')
        : ''
      : text;
  }

  private drawMessage(b: Built, state: LiveState): void {
    const m = state.stageMessage;
    this.say(b, m?.text ?? '');
    if (m?.flash && m.sentAt !== this.lastMessageAt) {
      b.node.classList.remove('flash');
      b.node.getBoundingClientRect(); // restart the CSS animation
      b.node.classList.add('flash');
    }
    this.lastMessageAt = m?.sentAt ?? '';
  }

  /**
   * Chord chart for the band: each line as a chord row over its lyric row, in a monospace font
   * so a chord sits exactly over the syllable it's played on (positions are in `ch`).
   */
  private drawChords(b: Built, lines: string[] | undefined): void {
    const parse = this.opts.parseChords;
    if (!lines?.length || !parse) {
      b.node.hidden = !this.opts.showEmpty;
      b.body.className = 'ls-st-empty';
      b.body.textContent = this.opts.showEmpty ? (this.opts.names?.chords ?? '') : '';
      return;
    }
    b.node.hidden = false;
    const doc = this.host.ownerDocument;
    b.body.className = '';
    b.body.replaceChildren(
      ...lines.map((line) => {
        const { text, chords } = parse(line);
        const row = el(doc, 'div', 'chord-line');
        if (chords.length) {
          const top = el(doc, 'div', 'chord-row');
          for (const c of chords) {
            const s = el(doc, 'span', '', { left: `${c.pos}ch` });
            s.textContent = c.chord;
            top.append(s);
          }
          row.append(top);
        }
        const lyric = el(doc, 'div', 'lyric-row');
        lyric.textContent = text || ' ';
        row.append(lyric);
        return row;
      }),
    );
  }

  /** The moving parts: clock, time since the slide went live, and the timers. */
  private tick(): void {
    const state = this.state;
    const now = Date.now();
    for (const b of this.built) {
      if (b.el.kind === 'clock') b.body.textContent = timeOfDay.format(new Date(now));
      else if (b.el.kind === 'elapsed')
        b.body.textContent = state?.programSince
          ? formatClock(secondsSince(state.programSince))
          : '';
      else if (b.el.kind === 'timers') {
        const doc = this.host.ownerDocument;
        const timers = state?.timers ?? [];
        b.node.hidden = !timers.length && !this.opts.showEmpty;
        if (!timers.length) {
          b.body.className = 'ls-st-empty';
          b.body.textContent = this.opts.showEmpty ? (this.opts.names?.timers ?? '') : '';
          continue;
        }
        b.body.className = 'ls-st-timers';
        b.body.style.display = 'flex';
        b.body.replaceChildren(
          ...timers.map((t) => {
            const secs = timerSeconds(t, now);
            const chip = el(
              doc,
              'span',
              `timer${secs < 0 ? ' over' : ''}${t.running ? '' : ' paused'}`,
            );
            const name = el(doc, 'span', 'timer-name');
            name.textContent = t.name;
            const value = el(doc, 'span', 'timer-value');
            value.textContent = formatTimer(secs, t.kind);
            chip.append(name, value);
            return chip;
          }),
        );
      }
    }
  }
}
