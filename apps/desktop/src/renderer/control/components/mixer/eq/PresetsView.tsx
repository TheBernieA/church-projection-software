import { useState } from 'react';
import { Download, Pencil, Plus, Send, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  PRESET_IDS,
  PRESET_SCOPES,
  type FitNote,
  type MixerChannel,
  type PresetScope,
  type ProcessingPreset,
} from '@lampstand/core';
import { Button, IconButton, Segmented, Typography } from '@lampstand/ui';
import { EMPTY_LIST } from '../../../constants';
import { sendToDesk } from '../../../lib/desk';
import { mixerCmd } from '../../../lib/mixer';
import {
  applyPreset,
  deletePreset,
  exportPresets,
  importPresets,
  noteText,
  renamePreset,
  saveChannelPreset,
} from '../../../lib/presets';
import { useStore } from '../../../lib/store';
import { DeferredInput } from '../../DeferredControls';
import { ProcessingCurve } from './ProcessingCurve';

/** What happened when a preset was applied, shown until the next one. */
function Notes({ notes, onClose }: { notes: FitNote[]; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[rgba(232,176,75,0.1)] px-3 py-2">
      <div className="flex items-center justify-between">
        <Typography size={11} weight="semibold" tone="primary">
          {t('presets.notApplied')}
        </Typography>
        <Button size="inline" variant="link" onClick={onClose}>
          {t('presets.ok')}
        </Button>
      </div>
      {notes.map((n, i) => (
        <Typography key={i} size={11} tone="secondary" leading="snug">
          • {noteText(n)}
        </Typography>
      ))}
    </div>
  );
}

/** One of the operator's presets: its curve, name, what it holds, and what can be done with it. */
function PresetRow({
  c,
  preset,
  onApplied,
  deskReady,
}: {
  c: MixerChannel;
  preset: ProcessingPreset;
  onApplied: (notes: FitNote[]) => void;
  deskReady: boolean;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  return (
    <li className="group flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--surface-2)]">
      <ProcessingCurve processing={preset.processing} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {renaming ? (
          <DeferredInput
            autoFocus
            aria-label={t('presets.rename')}
            value={preset.name}
            maxLength={60}
            onCommit={(v) => {
              if (v.trim()) void renamePreset(preset.id, v);
              setRenaming(false);
            }}
            onBlur={() => setRenaming(false)}
            className="field !h-7"
          />
        ) : (
          <Typography size={12} weight="semibold" tone="primary" truncate>
            {preset.name}
          </Typography>
        )}
        <Typography size={10} tone="muted" truncate>
          {t(`presets.scopes.${preset.scope}`)}
          {preset.source ? ` · ${preset.source}` : ''}
        </Typography>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100">
        <Button
          size="2xs"
          variant="subtle"
          disabled={c.locked}
          onClick={() => void applyPreset(c, preset.processing).then(onApplied)}
        >
          {t('presets.apply')}
        </Button>
        {deskReady && c.deskChannel && (
          <IconButton
            size="xs"
            aria-label={t('presets.sendToDesk', { channel: c.deskChannel })}
            onClick={() =>
              c.deskChannel && void sendToDesk(c.deskChannel, preset.processing, preset.name)
            }
          >
            <Send size={13} />
          </IconButton>
        )}
        <IconButton size="xs" aria-label={t('presets.rename')} onClick={() => setRenaming(true)}>
          <Pencil size={13} />
        </IconButton>
        <IconButton
          size="xs"
          aria-label={t('presets.exportOne', { name: preset.name })}
          onClick={() => void exportPresets([preset], preset.name)}
        >
          <Download size={13} />
        </IconButton>
        <IconButton
          size="xs"
          variant="danger"
          aria-label={t('presets.delete', { name: preset.name })}
          onClick={() => void deletePreset(preset)}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
    </li>
  );
}

/**
 * Presets (channel window): save this channel's processing (all of it, or the EQ alone), apply
 * the built-in starting points or the operator's own, and move presets between computers as
 * files (Lampstand presets, or an Equalizer APO / REW text EQ).
 */
export function PresetsView({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const presets = useStore(
    (s) => s.settings?.processingPresets ?? (EMPTY_LIST as ProcessingPreset[]),
  );
  const deskReady = useStore((s) => !!s.settings?.desk.enabled && !!s.settings.desk.host);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<PresetScope>('all');
  const [notes, setNotes] = useState<FitNote[]>([]);
  const save = (): void => {
    void saveChannelPreset(c, name || c.name, scope).then((p) => p && setName(''));
  };
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-3 overflow-hidden">
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <section
          aria-label={t('presets.saveTitle')}
          className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
        >
          <Typography size={12} weight="semibold" tone="primary">
            {t('presets.saveTitle')}
          </Typography>
          <input
            aria-label={t('presets.name')}
            placeholder={c.name}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') save();
            }}
            className="field !h-8"
          />
          <Segmented<PresetScope>
            label={t('presets.scope')}
            value={scope}
            onChange={setScope}
            options={PRESET_SCOPES.map((s) => ({ value: s, label: t(`presets.scopes.${s}`) }))}
          />
          <Typography size={11} tone="muted" leading="snug">
            {t(`presets.scopeHelp.${scope}`)}
          </Typography>
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={save}>
            {t('presets.save')}
          </Button>
        </section>
        <section
          aria-label={t('presets.builtIn')}
          className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
        >
          <Typography size={12} weight="semibold" tone="primary">
            {t('presets.builtIn')}
          </Typography>
          {PRESET_IDS.map((p) => (
            <div key={p} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <Typography size={12} tone="primary">
                  {t(`mixer.presets.${p}`)}
                </Typography>
                <Typography size={10} tone="muted" truncate>
                  {t(`mixer.presets.${p}Help`)}
                </Typography>
              </div>
              <Button
                size="2xs"
                variant="subtle"
                disabled={c.locked}
                onClick={() => void mixerCmd({ action: 'preset', id: c.id, preset: p })}
              >
                {t('presets.apply')}
              </Button>
            </div>
          ))}
        </section>
      </div>
      <section
        aria-label={t('presets.mine')}
        className="flex min-h-0 flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
      >
        <div className="flex items-center gap-2">
          <Typography size={12} weight="semibold" tone="primary" className="flex-1">
            {t('presets.mine')} · {presets.length}
          </Typography>
          <Button
            size="2xs"
            variant="subtle"
            icon={<Upload size={12} />}
            onClick={() => void importPresets()}
          >
            {t('presets.import')}
          </Button>
          <Button
            size="2xs"
            variant="subtle"
            icon={<Download size={12} />}
            disabled={!presets.length}
            onClick={() => void exportPresets(presets)}
          >
            {t('presets.exportAll')}
          </Button>
        </div>
        {notes.length > 0 && <Notes notes={notes} onClose={() => setNotes([])} />}
        {presets.length === 0 ? (
          <Typography size={12} tone="muted" leading="snug" className="py-6 text-center">
            {t('presets.empty')}
          </Typography>
        ) : (
          <ul className="flex min-h-0 flex-col overflow-y-auto">
            {presets.map((p) => (
              <PresetRow key={p.id} c={c} preset={p} onApplied={setNotes} deskReady={deskReady} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
