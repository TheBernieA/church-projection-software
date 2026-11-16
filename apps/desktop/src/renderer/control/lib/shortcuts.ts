import { clearLayer, goLive, step, toggleMask } from './actions';
import { api, cmd } from './api';
import { openDialog, redo, undo, useStore } from './store';
import { DEFAULT_SHORTCUTS } from '../constants';
import { type ShortcutAction } from '../types';

/** Secondary keys that always work (broadcast muscle memory). */
const ALIASES: Partial<Record<string, ShortcutAction>> = {
  Enter: 'goLive',
  ArrowDown: 'next',
  PageDown: 'next',
  ArrowUp: 'previous',
  PageUp: 'previous',
};

export const isMac = (): boolean => window.lampstand.platform === 'darwin';

/** Normalize a KeyboardEvent into a combo string like "Mod+Shift+Z". */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  const mod = isMac() ? e.metaKey : e.ctrlKey;
  if (mod) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  let key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (e.altKey && e.code.startsWith('Key')) key = e.code.slice(3);
  if (key === '?') return mod ? 'Mod+?' : '?';
  if (e.shiftKey && key.length > 1) parts.push('Shift');
  else if (e.shiftKey && /^[A-Z]$/.test(key) && mod) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function displayCombo(combo: string): string {
  return combo
    .replace('Mod', isMac() ? '⌘' : 'Ctrl')
    .replace('Alt', isMac() ? '⌥' : 'Alt')
    .replace('Shift', '⇧')
    .replace('Arrow', '')
    .replace(/\+/g, isMac() ? '' : '+');
}

export function effectiveShortcuts(): Record<ShortcutAction, string> {
  const overrides = useStore.getState().settings?.shortcuts ?? {};
  const out = { ...DEFAULT_SHORTCUTS };
  for (const [k, v] of Object.entries(overrides)) if (k in out) out[k as ShortcutAction] = v;
  return out;
}

const RUN: Record<ShortcutAction, () => void> = {
  goLive: () => void goLive('shortcut'),
  next: () => void step(1),
  previous: () => void step(-1),
  clearContent: () => void clearLayer('content'),
  clearMedia: () => void clearLayer('media'),
  clearBackground: () => void clearLayer('background'),
  clearOverlays: () => void clearLayer('overlays'),
  clearAll: () => void clearLayer('all'),
  black: () => void toggleMask('black'),
  logo: () => void toggleMask('logo'),
  freeze: () => void toggleMask('freeze'),
  panic: () => {
    // Esc closes whatever is open first (a dialog, a menu, a dropdown); only then is it panic.
    if (useStore.getState().dialog || popupOpen()) return;
    void clearLayer('panic');
  },
  quickBar: () => openDialog('quick'),
  undo: () => void undo(),
  redo: () => void redo(),
  cheatSheet: () => openDialog('shortcuts'),
  perfHud: () =>
    useStore.setState({ dialog: useStore.getState().dialog === 'perf' ? null : 'perf' }),
  mediaToggle: () => {
    if (useStore.getState().live?.program.media?.kind === 'video')
      void cmd('live.media', { action: 'toggle' }, 'shortcut');
  },
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Global keyboard handler. Single keys never fire while typing in a field. */
/** A Radix dialog, menu or dropdown list is open (it will take Esc for itself). */
function popupOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-radix-popper-content-wrapper]',
  );
}

export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat && !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const combo = comboFromEvent(e);
    const map = effectiveShortcuts();
    let action = (Object.keys(map) as ShortcutAction[]).find((a) => map[a] === combo);
    if (!action) action = ALIASES[combo];
    if (!action) return;
    const hasModifier = combo.includes('Mod');
    if (isTyping(e.target) && !hasModifier && !/^F\d+$/.test(combo)) return;
    // In a text field, ⌘Z / ⌘⇧Z undo the typing (native), not the service plan.
    if (isTyping(e.target) && (action === 'undo' || action === 'redo')) return;
    const dialogOpen = useStore.getState().dialog && useStore.getState().dialog !== 'perf';
    // While a dialog is open only global modifier/function shortcuts work (layer clears stay available).
    if (dialogOpen && !hasModifier && !/^F\d+$/.test(combo)) return;
    if (dialogOpen && (action === 'undo' || action === 'redo')) return;
    // A menu or dropdown is open: plain keys (Esc, Space, arrows) are for it, not the show.
    if (!hasModifier && !/^F\d+$/.test(combo) && popupOpen()) return;
    e.preventDefault();
    RUN[action]();
  };
  // Capture phase: this runs before a dialog or menu handles the same key and closes itself,
  // so "Esc to close Settings" is never also "Esc: clear the screen".
  window.addEventListener('keydown', onKey, true);
  // Edit › Undo / Redo in the menu bar: the same rules as the keys.
  // (The menu itself undoes typing in a focused field, natively.)
  const offMenu = api.onMenu((action) => {
    if (isTyping(document.activeElement)) return;
    const dialogOpen = useStore.getState().dialog && useStore.getState().dialog !== 'perf';
    if (!dialogOpen) void (action === 'undo' ? undo() : redo());
  });
  return () => {
    window.removeEventListener('keydown', onKey, true);
    offMenu();
  };
}
