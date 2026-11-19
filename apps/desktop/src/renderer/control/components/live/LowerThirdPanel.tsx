import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StreamSettings } from '@lampstand/core';
import { Button, Segmented, Slider, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { lowerThirdThemes } from '../../lib/slides';
import { useStore } from '../../lib/store';
import {
  choices,
  NONE,
  pickWordsTheme,
  WORDS_ALIGNS,
  WORDS_SIZE,
  wordsThemeOptions,
} from '../../lib/streamOptions';
import { Select } from '../Select';
import { Section } from './consoleParts';

/** A labelled row in the lower-third panel. */
function PictureRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3">
      <Typography size={12} tone="secondary">
        {label}
      </Typography>
      {children}
    </div>
  );
}

/**
 * How the stream's lower third looks: its theme, where it sits and how big. The scenes choose
 * what the stream shows; this appears only while the one on air has a lower third.
 */
export function LowerThirdPanel({ st }: { st: StreamSettings }) {
  const { t } = useTranslation();
  const themes = useStore((x) => x.themes);
  const lowerThirds = useMemo(() => lowerThirdThemes(themes), [themes]);
  const pic = st.picture;
  if (pic.mirror !== 'own' || pic.words !== 'lowerThird') return null;
  const set = (patch: Partial<StreamSettings['picture']>): void =>
    void saveSettings({ stream: { ...st, picture: { ...pic, ...patch } } });
  return (
    <Section title={t('console.lowerThird')}>
      <PictureRow label={t('streaming.wordsTheme')}>
        <Select<string>
          size="sm"
          aria-label={t('streaming.wordsTheme')}
          value={pic.wordsTheme ?? NONE}
          onChange={(id) => set(pickWordsTheme(id, lowerThirds))}
          options={wordsThemeOptions(lowerThirds, t)}
        />
      </PictureRow>
      <PictureRow label={t('streaming.wordsAlign')}>
        <Segmented<StreamSettings['picture']['wordsAlign']>
          label={t('streaming.wordsAlign')}
          value={pic.wordsAlign}
          onChange={(wordsAlign) => set({ wordsAlign })}
          options={choices(WORDS_ALIGNS, t)}
        />
      </PictureRow>
      <PictureRow label={t('streaming.wordsSize')}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            size="xs"
            variant={pic.wordsAuto ? 'primary' : 'subtle'}
            aria-pressed={pic.wordsAuto}
            title={t('streaming.wordsAutoHelp')}
            onClick={() => set({ wordsAuto: !pic.wordsAuto })}
          >
            {t('streaming.wordsAuto')}
          </Button>
          {pic.wordsAuto ? (
            <Typography size={11} tone="muted" leading="snug" className="min-w-0">
              {pic.wordsTheme ? t('streaming.wordsAutoTheme') : t('streaming.wordsAutoOn')}
            </Typography>
          ) : (
            <Slider
              aria-label={t('streaming.wordsSize')}
              {...WORDS_SIZE}
              value={pic.wordsSize}
              format={(v) => `${v}%`}
              onChange={(e) => set({ wordsSize: Number(e.target.value) })}
              className="min-w-0 flex-1"
            />
          )}
        </div>
      </PictureRow>
    </Section>
  );
}
