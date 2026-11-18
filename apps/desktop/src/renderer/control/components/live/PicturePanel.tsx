import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { themeAlignOf, type StreamSettings } from '@lampstand/core';
import { Button, Segmented, Slider, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { useInputDevices } from '../../lib/inputs';
import { lowerThirdThemes } from '../../lib/slides';
import { useStore } from '../../lib/store';
import {
  BACKGROUNDS,
  choices,
  LAYOUTS,
  MIRRORS,
  NONE,
  WORDS_ALIGNS,
  WORDS_MODES,
  WORDS_SIZE,
} from '../../lib/streamOptions';
import { Select } from '../Select';
import { Section } from './consoleParts';

/** A labelled row in the picture panel. */
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
 * What the stream shows, in two parts: the picture behind (the projector's, a camera, or
 * black) and the words over it (a lower third, full screen, or none), with where the words sit
 * and how big they are. Only the choices that apply show. Everything applies at once.
 */
export function PicturePanel({ st }: { st: StreamSettings }) {
  const { t } = useTranslation();
  const cameras = useInputDevices('videoinput');
  const themes = useStore((x) => x.themes);
  const lowerThirds = useMemo(() => lowerThirdThemes(themes), [themes]);
  const pic = st.picture;
  const set = (patch: Partial<StreamSettings['picture']>): void =>
    void saveSettings({ stream: { ...st, picture: { ...pic, ...patch } } });
  const cameraOptions = [
    { value: NONE, label: t('streaming.noCamera') },
    ...(cameras ?? []).map((c) => ({ value: c.deviceId, label: c.label })),
  ];
  const camerasShown = pic.background === 'camera' || pic.background === 'layout';
  return (
    <Section title={t('console.picture')}>
      <PictureRow label={t('streaming.mirror')}>
        <Select<StreamSettings['picture']['mirror']>
          size="sm"
          aria-label={t('streaming.mirror')}
          value={pic.mirror}
          onChange={(mirror) => set({ mirror })}
          options={choices(MIRRORS, t)}
        />
      </PictureRow>
      {pic.mirror !== 'own' ? (
        <Typography as="p" size={11} tone="muted" leading="snug">
          {t(`streaming.mirrorHelp.${pic.mirror}`)}
        </Typography>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-2.5">
            <PictureRow label={t('console.behind')}>
              <Select<StreamSettings['picture']['background']>
                size="sm"
                aria-label={t('streaming.background')}
                value={pic.background}
                onChange={(background) => set({ background })}
                options={choices(BACKGROUNDS, t)}
              />
            </PictureRow>
            {pic.background === 'layout' && (
              <PictureRow label={t('streaming.layout')}>
                <Segmented<StreamSettings['picture']['layout']>
                  label={t('streaming.layout')}
                  value={pic.layout}
                  onChange={(layout) => set({ layout })}
                  options={choices(LAYOUTS, t)}
                />
              </PictureRow>
            )}
            {camerasShown && (
              <PictureRow
                label={pic.background === 'layout' ? t('streaming.cameraA') : t('streaming.camera')}
              >
                <Select<string>
                  size="sm"
                  aria-label={
                    pic.background === 'layout' ? t('streaming.cameraA') : t('streaming.camera')
                  }
                  value={pic.camera ?? NONE}
                  onChange={(id) => set({ camera: id === NONE ? null : id })}
                  options={cameraOptions}
                />
              </PictureRow>
            )}
            {pic.background === 'layout' && (
              <PictureRow label={t('streaming.cameraB')}>
                <Select<string>
                  size="sm"
                  aria-label={t('streaming.cameraB')}
                  value={pic.secondCamera ?? NONE}
                  onChange={(id) => set({ secondCamera: id === NONE ? null : id })}
                  options={cameraOptions}
                />
              </PictureRow>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-2.5">
            <PictureRow label={t('streaming.words')}>
              <Segmented<StreamSettings['picture']['words']>
                label={t('streaming.words')}
                value={pic.words}
                onChange={(words) => set({ words })}
                options={choices(WORDS_MODES, t)}
              />
            </PictureRow>
            {pic.words === 'lowerThird' && (
              <PictureRow label={t('streaming.wordsTheme')}>
                <Select<string>
                  size="sm"
                  aria-label={t('streaming.wordsTheme')}
                  value={pic.wordsTheme ?? NONE}
                  onChange={(id) => {
                    // A theme brings its own position; Position can still move it afterwards.
                    const picked = lowerThirds.find((th) => th.id === id);
                    set({
                      wordsTheme: picked ? picked.id : null,
                      ...(picked ? { wordsAlign: themeAlignOf(picked) } : {}),
                    });
                  }}
                  options={[
                    { value: NONE, label: t('streaming.wordsThemeOwn') },
                    ...lowerThirds.map((th) => ({ value: th.id, label: th.name })),
                  ]}
                />
              </PictureRow>
            )}
            {pic.words === 'lowerThird' && (
              <PictureRow label={t('streaming.wordsAlign')}>
                <Segmented<StreamSettings['picture']['wordsAlign']>
                  label={t('streaming.wordsAlign')}
                  value={pic.wordsAlign}
                  onChange={(wordsAlign) => set({ wordsAlign })}
                  options={choices(WORDS_ALIGNS, t)}
                />
              </PictureRow>
            )}
            {pic.words === 'lowerThird' && (
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
            )}
          </div>
        </>
      )}
    </Section>
  );
}
