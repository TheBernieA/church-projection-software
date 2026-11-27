import { useTranslation } from 'react-i18next';
import { themeAligned, themeAlignOf, type InputTransition } from '@lampstand/core';
import { Button, Typography } from '@lampstand/ui';
import { saveSettings, setLowerThird, toggleMask } from '../../lib/actions';
import { remembered } from '../../lib/prefs';
import { LT_ALIGN_KEY, LT_THEME_KEY } from '../../lib/screenScenes';
import { lowerThirdThemes } from '../../lib/slides';
import { streamLowerThirdOn, withStreamLowerThird } from '../../lib/streamOptions';
import { useStore } from '../../lib/store';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { auto, cut, useSwitchTarget } from '../../lib/switcher';
import { Select } from '../Select';
import { TakeTo, TRANSITION_KINDS, TransitionLength, useCanTake } from '../media/SwitcherBar';

/** The screens' lower third on or off, with the theme and position last chosen in the Live column. */
function toggleScreensLowerThird(on: boolean): void {
  const s = useStore.getState();
  if (!on) {
    void setLowerThird(null);
    return;
  }
  const choices = lowerThirdThemes(s.themes);
  const id = remembered(LT_THEME_KEY);
  const theme = choices.find((th) => th.id === id) ?? choices[0];
  if (!theme) return;
  const a = remembered(LT_ALIGN_KEY);
  const align = a === 'left' || a === 'center' || a === 'right' ? a : themeAlignOf(theme);
  void setLowerThird(themeAligned(theme, align));
}

/**
 * Taking a camera live (Cameras, right of the bar): where it goes, FADE (Auto, with the
 * transition) and CUT, the transition's kind and length, and the two things a volunteer reaches
 * for next: BLACK (the audience screens to black) and LOWER THIRDS.
 */
export function TakePanel() {
  const { t } = useTranslation();
  const canTake = useCanTake();
  const settings = useStore((s) => s.settings?.switcher);
  const black = useStore((s) => !!s.live?.program.masks.black);
  const to = useSwitchTarget((s) => s.to);
  const stream = useStore((s) => s.settings?.stream);
  const onScreens = useStore((s) => !!s.live?.lowerThird);
  const hasThemes = useStore((s) => lowerThirdThemes(s.themes).length > 0);
  // The stream's lower third is its own switch (Live column); it can't while mirroring a screen.
  const streamOwn = stream?.picture.mirror === 'own';
  const onStream = stream ? streamLowerThirdOn(stream.picture) : false;
  // Lower thirds go where Take live points, like the cameras: the screens, the stream, or both.
  const toScreens = to !== 'stream';
  const toStream = to !== 'screens' && streamOwn;
  const lowerThird =
    (!toScreens || onScreens) && (!toStream || onStream) && (toScreens || toStream);
  const canLowerThird = (toScreens && hasThemes) || toStream;
  const setLowerThirds = (on: boolean): void => {
    if (toScreens && hasThemes) toggleScreensLowerThird(on);
    if (toStream)
      void saveSettings({
        stream: { ...stream, picture: withStreamLowerThird(stream.picture, on) },
      });
  };
  const lowerThirdTitle = !canLowerThird
    ? to === 'stream'
      ? t('console.lowerThirdMirror')
      : t('cameraMode.noLowerThirds')
    : t(`cameraMode.lowerThirdsTo.${to}`);
  useStore((s) => s.settings?.shortcuts);
  if (!settings) return null;
  const keys = effectiveShortcuts();
  const transition = settings.transition;
  const setTransition = (patch: Partial<InputTransition>): void =>
    void saveSettings({ switcher: { ...settings, transition: { ...transition, ...patch } } });
  const big =
    'flex !h-[64px] flex-1 flex-col !items-center !justify-center !gap-0.5 rounded-[var(--radius-lg)]';
  const toggle = (on: boolean, onTone: string): string =>
    `flex h-[46px] flex-1 flex-col items-center justify-center gap-0 rounded-[var(--radius-lg)] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40 ${on ? onTone : 'bg-[var(--surface-3)] text-[var(--text-1)] hover:bg-[var(--surface-4)]'}`;
  return (
    <div className="flex flex-col gap-2">
      <TakeTo compact />
      <div className="flex gap-2">
        <Button
          variant="live"
          disabled={!canTake}
          onClick={() => void auto()}
          title={t('shortcuts.action.switcherAuto')}
          className={big}
        >
          <Typography size={18} weight="bold" tone="inherit" caps>
            {t(`switcher.kinds.${transition.kind === 'cut' ? 'fade' : transition.kind}`)}
          </Typography>
          <Typography size={10} tone="inherit" className="opacity-80">
            {t('switcher.seconds', { s: transition.durationMs / 1000 })} ·{' '}
            {displayCombo(keys.switcherAuto)}
          </Typography>
        </Button>
        <Button
          variant="secondary"
          disabled={!canTake}
          onClick={() => void cut()}
          title={t('shortcuts.action.switcherCut')}
          className={big}
        >
          <Typography size={18} weight="bold" tone="inherit" caps>
            {t('switcher.cut')}
          </Typography>
          <Typography size={10} tone="inherit" className="opacity-70">
            {displayCombo(keys.switcherCut)}
          </Typography>
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant="bare"
          aria-pressed={black}
          title={t('cameraMode.blackHelp')}
          onClick={() => void toggleMask('black')}
          className={toggle(black, 'bg-[var(--tally-program)] text-white')}
        >
          <Typography size={12} weight="bold" tone="inherit" caps>
            {t('cameraMode.black')}
          </Typography>
          <Typography size={10} tone="inherit" caps className="opacity-70">
            {black ? t('cameraMode.on') : t('cameraMode.off')}
          </Typography>
        </Button>
        <Button
          variant="bare"
          aria-pressed={lowerThird}
          disabled={!canLowerThird}
          title={lowerThirdTitle}
          onClick={() => setLowerThirds(!lowerThird)}
          className={toggle(lowerThird, 'bg-[var(--accent)] text-[var(--accent-ink)]')}
        >
          <Typography size={12} weight="bold" tone="inherit" caps>
            {t('cameraMode.lowerThirds')}
          </Typography>
          <Typography size={10} tone="inherit" caps className="opacity-70">
            {lowerThird ? t('cameraMode.on') : t('cameraMode.off')}
          </Typography>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select<InputTransition['kind']>
          size="sm"
          aria-label={t('switcher.transition')}
          value={transition.kind}
          onChange={(kind) => setTransition({ kind })}
          options={TRANSITION_KINDS.map((k) => ({ value: k, label: t(`switcher.kinds.${k}`) }))}
        />
        <TransitionLength
          value={transition.durationMs}
          onChange={(durationMs) => setTransition({ durationMs })}
        />
      </div>
    </div>
  );
}
