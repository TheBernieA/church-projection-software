import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackgroundRef, Theme } from '@lampstand/core';
import { Button, Segmented } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { attempt, closeDialog, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import {} from './MediaPanel';
import { Select, Swatch } from './Select';
import { SceneView } from './SceneView';
import { ThemeEffects } from './ThemeEffects';
import { Checkbox, ColorInput, Field, NumberInput } from './form';
import { sampleScene } from './ThemesPanel';
import { BUILT_IN_BACKGROUNDS, BUNDLED_FONTS } from '../constants';
import { swatchCss } from '../lib/utils';

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
          <Field label={t('theme.name')} htmlFor="th-name">
            <input
              id="th-name"
              className="field"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field label={t('theme.font')} htmlFor="th-font">
            <Select
              id="th-font"
              value={draft.text.fontFamily}
              onChange={(fontFamily) => setText({ fontFamily })}
              options={BUNDLED_FONTS.map((f) => ({
                value: f.family,
                label: f.family,
                description: t(`theme.fontKinds.${f.category}`),
                labelStyle: { fontFamily: `"${f.family}"`, fontSize: 14 },
              }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('theme.size')} htmlFor="th-size">
              <NumberInput
                id="th-size"
                min={20}
                max={200}
                value={draft.autoFit.maxSize}
                onChange={(size) =>
                  set({
                    autoFit: { ...draft.autoFit, maxSize: size || 60 },
                    text: { ...draft.text, fontSize: size || 60 },
                  })
                }
              />
            </Field>
            <Field label={t('theme.color')} htmlFor="th-color">
              <ColorInput
                id="th-color"
                value={draft.text.color}
                onChange={(color) => setText({ color })}
              />
            </Field>
          </div>
          <Field label={t('theme.align')} group>
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
          </Field>
          <Field label={t('theme.layout')} group>
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
          </Field>
          <Field label={t('theme.background')} htmlFor="th-bg">
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
                  ...(b.ref.kind === 'generated' ? { description: t('media.motionOne') } : {}),
                  leading: <Swatch background={swatchCss(b.ref)} />,
                })),
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('theme.transition')} htmlFor="th-tr">
              <Select
                id="th-tr"
                value={draft.transition.kind}
                onChange={(kind) => set({ transition: { ...draft.transition, kind } })}
                options={(['cut', 'fade', 'dissolve', 'slide', 'zoom', 'blur'] as const).map(
                  (k) => ({ value: k, label: t(`theme.transitions.${k}`) }),
                )}
              />
            </Field>
            <Field label={t('theme.duration')} htmlFor="th-dur">
              <NumberInput
                id="th-dur"
                min={0}
                max={3000}
                step={50}
                value={draft.transition.durationMs}
                onChange={(durationMs) => set({ transition: { ...draft.transition, durationMs } })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Checkbox
              label={t('theme.box')}
              checked={!!draft.text.backgroundBox}
              onChange={(on) =>
                setText({
                  backgroundBox: on
                    ? { color: 'rgba(10,12,20,0.72)', padding: 28, radius: 10 }
                    : undefined,
                })
              }
            />
            <Checkbox
              label={t('theme.verseNumbers')}
              checked={draft.showVerseNumbers}
              onChange={(showVerseNumbers) => set({ showVerseNumbers })}
            />
            <Checkbox
              label={t('theme.redLetters')}
              checked={draft.redLetters}
              onChange={(redLetters) => set({ redLetters })}
            />
          </div>
          <ThemeEffects
            draft={draft}
            setText={setText}
            setAdjust={(p) => set({ backgroundAdjust: { ...draft.backgroundAdjust, ...p } })}
          />
          <Field label={t('theme.refPosition')} group>
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
          </Field>
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
