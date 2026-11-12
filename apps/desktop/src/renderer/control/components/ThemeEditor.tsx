import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackgroundRef, Theme } from '@lampstand/core';
import { Button, Segmented } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { attempt, closeDialog, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import { BUILT_IN_BACKGROUNDS, swatchCss } from './MediaPanel';
import { Select, Swatch } from './Select';
import { SceneView } from './SceneView';
import { sampleScene } from './ThemesPanel';

const FONTS = [
  'Inter',
  'Montserrat',
  'Lora',
  'Source Serif 4',
  'Playfair Display',
  'Bebas Neue',
  'Atkinson Hyperlegible',
];
const SAMPLES = {
  short: 'Jesus wept.',
  long: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
  chorus:
    'Praise God, from whom all blessings flow\nPraise Him, all creatures here below\nPraise Him above, ye heavenly host\nPraise Father, Son, and Holy Ghost',
};

/** Theme editor with live preview on real content (§13): short, long and 4-line samples. */
export function ThemeEditor() {
  const open = useStore((s) => s.dialog === 'theme');
  const id = useStore((s) => s.editingThemeId);
  const theme = useStore((s) => s.themes.find((x) => x.id === id));
  // Theme may arrive a moment after "duplicate" — mount the editor once it exists.
  return open && theme ? <ThemeEditorBody key={theme.id} initial={theme} /> : null;
}

function ThemeEditorBody({ initial }: { initial: Theme }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Theme>(initial);
  const set = (p: Partial<Theme>): void => setDraft({ ...draft, ...p });
  const setText = (p: Partial<Theme['text']>): void => set({ text: { ...draft.text, ...p } });
  const save = async (): Promise<void> => {
    if ((await attempt(() => cmd('theme.save', { entity: draft }), 'errors.save')) !== undefined)
      closeDialog();
  };
  const bgName =
    BUILT_IN_BACKGROUNDS.find((b) => JSON.stringify(b.ref) === JSON.stringify(draft.background))
      ?.name ?? (draft.background.kind === 'none' ? 'none' : 'custom');

  return (
    <Dialog
      name="theme"
      wide
      title={t('theme.title')}
      footer={
        <>
          <Button onClick={() => closeDialog()}>{t('song.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('theme.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[300px_1fr] gap-5">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="th-name">
              {t('theme.name')}
            </label>
            <input
              id="th-name"
              className="field"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="th-font">
              {t('theme.font')}
            </label>
            <Select
              id="th-font"
              value={draft.text.fontFamily}
              onChange={(fontFamily) => setText({ fontFamily })}
              options={FONTS.map((f) => ({
                value: f,
                label: f,
                labelStyle: { fontFamily: `"${f}"`, fontSize: 14 },
              }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="th-size">
                {t('theme.size')}
              </label>
              <input
                id="th-size"
                type="number"
                min={20}
                max={200}
                className="field"
                value={draft.autoFit.maxSize}
                onChange={(e) =>
                  set({
                    autoFit: { ...draft.autoFit, maxSize: Number(e.target.value) || 60 },
                    text: { ...draft.text, fontSize: Number(e.target.value) || 60 },
                  })
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="th-color">
                {t('theme.color')}
              </label>
              <input
                id="th-color"
                type="color"
                className="field p-1"
                value={draft.text.color.startsWith('#') ? draft.text.color.slice(0, 7) : '#ffffff'}
                onChange={(e) => setText({ color: e.target.value })}
              />
            </div>
          </div>
          <div>
            <span className="label">{t('theme.align')}</span>
            <Segmented
              label={t('theme.align')}
              value={draft.text.align}
              onChange={(align) => setText({ align })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </div>
          <div>
            <span className="label">{t('theme.layout')}</span>
            <Segmented
              label={t('theme.layout')}
              value={
                draft.layout === 'split' || draft.layout === 'custom' ? 'center' : draft.layout
              }
              onChange={(layout) => set({ layout })}
              options={[
                { value: 'center', label: 'Center' },
                { value: 'top', label: 'Top' },
                { value: 'lower-third', label: 'Lower third' },
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="th-bg">
              {t('theme.background')}
            </label>
            <Select
              id="th-bg"
              value={bgName}
              onChange={(name) => {
                if (name === 'custom') return;
                const b = BUILT_IN_BACKGROUNDS.find((x) => x.name === name);
                const none: BackgroundRef = { kind: 'none' };
                set({ background: b ? b.ref : none });
              }}
              options={[
                {
                  value: 'none',
                  label: t('theme.bgNone'),
                  description: t('theme.bgNoneHelp'),
                  leading: (
                    <Swatch background="repeating-conic-gradient(#3a3f4d 0% 25%, #2a2e39 0% 50%) 50% / 10px 10px" />
                  ),
                },
                ...(bgName === 'custom'
                  ? [
                      {
                        value: 'custom',
                        label: t('theme.bgCustom'),
                        leading: <Swatch background={swatchCss(draft.background)} />,
                      },
                    ]
                  : []),
                ...BUILT_IN_BACKGROUNDS.map((b) => ({
                  value: b.name,
                  label: b.name,
                  leading: <Swatch background={swatchCss(b.ref)} />,
                })),
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="th-tr">
                {t('theme.transition')}
              </label>
              <Select
                id="th-tr"
                value={draft.transition.kind}
                onChange={(kind) => set({ transition: { ...draft.transition, kind } })}
                options={(['cut', 'fade', 'dissolve', 'slide', 'zoom', 'blur'] as const).map(
                  (k) => ({ value: k, label: t(`theme.transitions.${k}`) }),
                )}
              />
            </div>
            <div>
              <label className="label" htmlFor="th-dur">
                {t('theme.duration')}
              </label>
              <input
                id="th-dur"
                type="number"
                min={0}
                max={3000}
                step={50}
                className="field"
                value={draft.transition.durationMs}
                onChange={(e) =>
                  set({
                    transition: { ...draft.transition, durationMs: Number(e.target.value) || 0 },
                  })
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!draft.text.shadow}
                onChange={(e) =>
                  setText({
                    shadow: e.target.checked
                      ? { x: 0, y: 4, blur: 18, color: 'rgba(0,0,0,0.55)' }
                      : undefined,
                  })
                }
              />
              {t('theme.shadow')}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!draft.text.backgroundBox}
                onChange={(e) =>
                  setText({
                    backgroundBox: e.target.checked
                      ? { color: 'rgba(10,12,20,0.72)', padding: 28, radius: 10 }
                      : undefined,
                  })
                }
              />
              {t('theme.box')}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.showVerseNumbers}
                onChange={(e) => set({ showVerseNumbers: e.target.checked })}
              />
              {t('theme.verseNumbers')}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.redLetters}
                onChange={(e) => set({ redLetters: e.target.checked })}
              />
              {t('theme.redLetters')}
            </label>
          </div>
          <div>
            <span className="label">{t('theme.refPosition')}</span>
            <Segmented
              label={t('theme.refPosition')}
              value={draft.referencePosition}
              onChange={(referencePosition) => set({ referencePosition })}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'none', label: 'Hidden' },
              ]}
            />
          </div>
        </div>
        <div className="space-y-3">
          {(Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]).map((k) => (
            <div key={k}>
              <span className="label">{t(`theme.sample.${k}`)}</span>
              <SceneView
                scene={sampleScene(
                  draft,
                  SAMPLES[k],
                  k === 'chorus' ? undefined : 'John 3:16–17 KJV',
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
