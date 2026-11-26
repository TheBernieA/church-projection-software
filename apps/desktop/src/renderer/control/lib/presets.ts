import {
  channelProcessing,
  MAX_PRESETS,
  newId,
  presetForChannel,
  type FitNote,
  type MixerChannel,
  type PresetScope,
  type Processing,
  type ProcessingPreset,
} from '@lampstand/core';
import i18n from '../i18n';
import { q } from './api';
import { ask } from './confirm';
import { saveSettings } from './actions';
import { mixerCmd } from './mixer';
import { attempt, toast, useStore } from './store';

/**
 * The operator's processing presets (Mixer › channel window › Presets): saved from a channel,
 * applied to any channel (or sent to the desk), kept in settings, and moved between computers
 * as files. Presets hold device-neutral processing, so the same one fits Lampstand and a desk.
 */

const presetsNow = (): ProcessingPreset[] => useStore.getState().settings?.processingPresets ?? [];
const savePresets = (presets: ProcessingPreset[]): Promise<void> =>
  saveSettings({ processingPresets: presets.slice(0, MAX_PRESETS) });

/** A name not already taken ("Pulpit", "Pulpit 2"…). */
export function freeName(name: string, taken: readonly string[]): string {
  const base = name.trim().slice(0, 55) || i18n.t('presets.untitled');
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** Save processing as a new preset. */
export async function savePreset(
  name: string,
  scope: PresetScope,
  processing: Processing,
  source?: string,
): Promise<ProcessingPreset | null> {
  const all = presetsNow();
  if (all.length >= MAX_PRESETS) {
    toast(i18n.t('presets.full', { max: MAX_PRESETS }), 'warning');
    return null;
  }
  const preset: ProcessingPreset = {
    id: newId(),
    name: freeName(
      name,
      all.map((p) => p.name),
    ),
    scope,
    processing:
      scope === 'eq' ? { eqOn: processing.eqOn, filters: processing.filters } : processing,
    ...(source ? { source: source.slice(0, 80) } : {}),
  };
  await savePresets([...all, preset]);
  return preset;
}

/** Save a channel's processing (all of it, or the EQ alone) as a preset. */
export const saveChannelPreset = (c: MixerChannel, name: string, scope: PresetScope) =>
  savePreset(name, scope, channelProcessing(c, scope));

export async function renamePreset(id: string, name: string): Promise<void> {
  const all = presetsNow();
  const others = all.filter((p) => p.id !== id).map((p) => p.name);
  await savePresets(all.map((p) => (p.id === id ? { ...p, name: freeName(name, others) } : p)));
}

export async function deletePreset(p: ProcessingPreset): Promise<void> {
  if (!(await ask({ message: i18n.t('presets.deleteConfirm', { name: p.name }), tone: 'danger' })))
    return;
  await savePresets(presetsNow().filter((x) => x.id !== p.id));
}

/** Apply a preset to a Lampstand channel; returns what had to change (empty: exactly). */
export async function applyPreset(c: MixerChannel, processing: Processing): Promise<FitNote[]> {
  const { patch, notes } = presetForChannel(processing);
  await mixerCmd({ action: 'channel', id: c.id, patch });
  return notes;
}

/** Save presets to a file. */
export const exportPresets = (presets: ProcessingPreset[], name?: string) =>
  attempt(() => q('presets.export', { presets, ...(name ? { name } : {}) }), 'errors.presets');

/**
 * Import a file: Lampstand presets join the list (new ids, names kept apart), a text EQ
 * (Equalizer APO / REW) becomes an EQ preset named after the file. A short summary is shown.
 */
export async function importPresets(): Promise<void> {
  const r = await attempt(() => q('presets.import'), 'errors.presets');
  if (!r || r.kind === 'none') return;
  if (r.kind === 'unreadable') {
    toast(i18n.t('presets.unreadable', { file: r.file }), 'error');
    return;
  }
  const all = presetsNow();
  if (r.kind === 'presets') {
    const room = MAX_PRESETS - all.length;
    const taken = all.map((p) => p.name);
    const added = r.presets.slice(0, Math.max(0, room)).map((p) => {
      const name = freeName(p.name, taken);
      taken.push(name);
      return { ...p, id: newId(), name };
    });
    await savePresets([...all, ...added]);
    toast(
      i18n.t('presets.imported', { count: added.length, skipped: r.presets.length - added.length }),
      added.length ? 'info' : 'warning',
    );
    return;
  }
  const name = r.file.replace(/\.[a-z0-9]+$/i, '');
  const saved = await savePreset(name, 'eq', r.eq.processing, r.file);
  if (!saved) return;
  const extra = [
    r.eq.skipped.length ? i18n.t('presets.skippedLines', { count: r.eq.skipped.length }) : '',
    r.eq.preampDb ? i18n.t('presets.preampIgnored', { db: r.eq.preampDb }) : '',
  ]
    .filter(Boolean)
    .join(' ');
  toast(`${i18n.t('presets.importedEq', { name: saved.name })} ${extra}`.trim(), 'info');
}

/** A fit note in words (presets applied to a channel, or sent to the desk). */
export function noteText(n: FitNote): string {
  const hz = (v: number): string =>
    v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
  const t = i18n.t.bind(i18n);
  switch (n.code) {
    case 'bandDropped':
      return t('fit.bandDropped', { hz: hz(n.hz), db: n.db.toFixed(1) });
    case 'kindChanged':
      return t('fit.kindChanged', {
        hz: hz(n.hz),
        from: t(`fit.kinds.${n.from}`),
        to: t(`fit.kinds.${n.to}`),
      });
    case 'clamped':
      return t(`fit.clamped.${n.what}`, { hz: hz(n.hz) });
    case 'cutDropped':
      return t('fit.cutDropped', { which: t(`fit.kinds.${n.which}`) });
    case 'cutAsBand':
      return t('fit.cutAsBand', { which: t(`fit.kinds.${n.which}`) });
    case 'slopeChanged':
      return t('fit.slopeChanged', { which: t(`fit.kinds.${n.which}`), from: n.from, to: n.to });
    case 'gateDropped':
      return t('fit.gateDropped');
    case 'compDropped':
      return t('fit.compDropped');
    case 'compChanged':
      return t('fit.compChanged', { what: t(`fit.comp.${n.what}`) });
  }
}
