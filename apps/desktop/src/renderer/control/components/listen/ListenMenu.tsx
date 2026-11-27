import { useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Mic, MicOff, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@lampstand/ui';
import type { DetectionMode } from '@lampstand/detection';
import { saveSettings } from '../../lib/actions';
import {
  isListening,
  setDetectionMode,
  startListening,
  stopListening,
  useListen,
  watchModels,
} from '../../lib/listen/listening';
import { openDialog, useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { ToolbarButton } from '../shell/ToolbarButton';

export const DETECTION_MODES: DetectionMode[] = ['off', 'suggest', 'approve', 'auto'];

/** The status light on the Listen button. */
export function listenColor(status: string): string | null {
  if (status === 'listening') return 'var(--tally-preview)';
  if (status === 'loading' || status === 'starting') return 'var(--accent)';
  if (status === 'error') return 'var(--tally-program)';
  return null;
}

/**
 * The toolbar's Listen: turn listening on or off, and choose what it does with scripture it
 * hears (Off, Suggest, Approve, Auto) and whether spoken commands work.
 */
export function ListenMenu() {
  const { t } = useTranslation();
  const status = useListen((s) => s.status);
  const mode = useStore((s) => s.live?.detection.mode ?? 'off');
  const voice = useStore((s) => s.settings?.listening.voiceCommands ?? false);
  const listening = useStore((s) => s.settings?.listening);
  useEffect(() => watchModels(), []);
  const on = status !== 'off' && status !== 'error';
  const color = listenColor(status);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <ToolbarButton
          icon={on ? <Mic size={20} /> : <MicOff size={20} />}
          label={t('listen.button')}
          aria-label={t(`listen.status.${status}`)}
          title={t(`listen.status.${status}`)}
          pressed={on}
          badge={
            color ? (
              <span
                aria-hidden
                className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--toolbar)]"
                style={{ background: color }}
              />
            ) : undefined
          }
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={`${MENU_CLASS} w-[260px]`}>
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => void (on ? stopListening() : startListening())}
          >
            {on ? <MicOff size={14} /> : <Mic size={14} />}
            {on ? t('listen.stop') : t('listen.start')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5">
            <Typography variant="overline">{t('listen.mode.label')}</Typography>
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={mode}
            onValueChange={(m) => {
              void setDetectionMode(m as DetectionMode);
              // Choosing what to do with scripture means "listen": no separate step to miss.
              if (m !== 'off' && !isListening()) void startListening();
            }}
          >
            {DETECTION_MODES.map((m) => (
              <DropdownMenu.RadioItem key={m} value={m} className={`${ITEM_CLASS} items-start`}>
                <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </span>
                <span className="min-w-0">
                  <span className="block">{t(`listen.mode.${m}`)}</span>
                  <Typography size={11} tone="inherit" className="block opacity-70">
                    {t(`listen.modeHelp.${m}`)}
                  </Typography>
                </span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.CheckboxItem
            className={`${ITEM_CLASS} items-start`}
            checked={voice}
            onCheckedChange={(v) => {
              if (listening) void saveSettings({ listening: { ...listening, voiceCommands: v } });
              if (v && !isListening()) void startListening();
            }}
          >
            <span className="mt-0.5 flex w-4 shrink-0 justify-center">
              <DropdownMenu.ItemIndicator>
                <Check size={14} />
              </DropdownMenu.ItemIndicator>
            </span>
            <span className="min-w-0">
              <span className="block">{t('listen.voiceCommands')}</span>
              <Typography size={11} tone="inherit" className="block opacity-70">
                {listening?.wakeWord
                  ? t('listen.voiceHelpWake', { word: listening.wakeWord })
                  : t('listen.voiceHelp')}
              </Typography>
            </span>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => openDialog('settings', { settingsPage: 'assistant' })}
          >
            <Settings2 size={14} />
            {t('listen.settings')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
