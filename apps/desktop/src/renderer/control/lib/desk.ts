import {
  deskProfiles,
  deskWrites,
  type DeskProfile,
  type FitNote,
  type Processing,
} from '@lampstand/core';
import { create } from 'zustand';
import i18n from '../i18n';
import { q } from './api';
import { ask } from './confirm';
import { noteText } from './presets';
import { attempt, toast, useStore } from './store';

/**
 * The sound desk from the control window: read a desk channel's processing, send processing to
 * it (after showing what will change), and put back what it had (undo). The desk's profile comes
 * from settings; fitting and messages are core's (`deskWrites`), the network is main's.
 */

/** The profile chosen in Settings › Audio › Sound desk (null: none, or it was removed). */
export function deskProfileNow(): DeskProfile | null {
  const s = useStore.getState().settings;
  if (!s) return null;
  return deskProfiles(s.deskProfiles).find((p) => p.id === s.desk.profile) ?? null;
}

/** What a desk channel had before the last send, to put back. */
export const useDeskUndo = create<{ channel: number; previous: Processing; at: number } | null>()(
  () => null,
);

/** A desk channel's processing and name (null if the desk didn't answer: a notice says why). */
export const readDesk = (channel: number) =>
  attempt(() => q('desk.read', { channel }), 'errors.desk');

/**
 * Send processing to a desk channel, after showing what will change on it (and anything that
 * doesn't fit the desk). Returns true when sent.
 */
export async function sendToDesk(
  channel: number,
  processing: Processing,
  what: string,
): Promise<boolean> {
  const profile = deskProfileNow();
  if (!profile) {
    toast(i18n.t('desk.noProfile'), 'warning');
    return false;
  }
  const { notes } = deskWrites(profile, channel, processing);
  const lines = notes.map((n) => `• ${noteText(n)}`).join('\n');
  const ok = await ask({
    message: `${i18n.t('desk.sendConfirm', { what, channel, desk: profile.name })}${lines ? `\n\n${i18n.t('desk.changes')}\n${lines}` : ''}`,
    confirm: i18n.t('desk.send'),
  });
  if (!ok) return false;
  const r = await attempt(() => q('desk.write', { channel, processing }), 'errors.desk');
  if (!r) return false;
  if (r.previous) useDeskUndo.setState({ channel, previous: r.previous, at: Date.now() }, true);
  toast(i18n.t('desk.sent', { channel }), 'info');
  return true;
}

/** Put the last-changed desk channel back as it was. */
export async function undoDeskSend(): Promise<void> {
  const u = useDeskUndo.getState();
  if (!u) return;
  const r = await attempt(
    () => q('desk.write', { channel: u.channel, processing: u.previous }),
    'errors.desk',
  );
  if (!r) return;
  useDeskUndo.setState(null, true);
  toast(i18n.t('desk.undone', { channel: u.channel }), 'info');
}

/** Notes as one line each (for a notice under a send or an apply). */
export const notesText = (notes: FitNote[]): string[] => notes.map(noteText);

// Development: a hot update would leave a second copy of this store that only part of the page
// uses (the rest, listeners wired to main among them, keeps the old one), so reload the page
// instead. Main, and a stream in progress, carry on.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
