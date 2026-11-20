import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AppWindow, Check, Grid3x3, LayoutTemplate, Monitor, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  resolveStageLayout,
  STAGE_PRESETS,
  type OutputRole,
  type StageLayout,
} from '@lampstand/core';

const NO_LAYOUTS: StageLayout[] = [];
import { Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { cmd } from '../../lib/api';
import { attempt, openDialog, refresh, useStore } from '../../lib/store';
import { EMPTY_LIST } from '../../constants';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';
import { ask } from '../../lib/confirm';

/** Give a display a role (or take it away); warns before covering the operator's own screen. */
export async function assignDisplay(
  displayId: string,
  role: OutputRole,
  isControl: boolean,
  warn: string,
): Promise<void> {
  if (isControl && role !== 'none' && !(await ask(warn))) return;
  await attempt(async () => {
    await cmd('display.assign', { displayId, role });
    await refresh('displays');
  });
}

/** A ticked item that stays open (so several screens can be switched in one go). */
function Toggle({
  checked,
  disabled,
  icon,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  hint?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <DropdownMenu.CheckboxItem
      className={ITEM_CLASS}
      checked={checked}
      disabled={disabled}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={onChange}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <Typography truncate>{label}</Typography>
        {hint && (
          <Typography size={11} tone="muted" truncate>
            {hint}
          </Typography>
        )}
      </span>
      <Typography className="flex w-3.5 justify-center">
        <DropdownMenu.ItemIndicator>
          <Check size={14} />
        </DropdownMenu.ItemIndicator>
      </Typography>
    </DropdownMenu.CheckboxItem>
  );
}

/**
 * The toolbar's Audience or Stage button: a menu for that kind of screen. Tick which displays
 * show it (and, for the audience, a window for rehearsal), check it with a test pattern or
 * edit the stage layout, or open the full output settings.
 */
export function ScreensMenu({ role, trigger }: { role: 'main' | 'stage'; trigger: ReactNode }) {
  const { t } = useTranslation();
  const displays = useStore((s) => s.displays);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const patterns = useStore((s) => s.live?.testPatterns ?? EMPTY_LIST);
  const layouts = useStore((s) => s.settings?.stageLayouts ?? NO_LAYOUTS);
  const chosen = useStore((s) => s.settings?.stageLayoutId ?? null);
  const layoutId = resolveStageLayout(layouts, chosen).id;
  const mine = displays.filter((d) => d.role === role);
  // The outputs a test pattern goes to: each audience display, or the rehearsal window.
  const outputs = [
    ...mine.map((d) => `display-${d.id}`),
    ...(role === 'main' && windowMode ? ['window-main'] : []),
  ];
  const patternOn = outputs.length > 0 && outputs.every((o) => patterns.includes(o));
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && void refresh('displays')}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${MENU_CLASS} min-w-[260px]`}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t(`screensMenu.${role}.title`)}
          </DropdownMenu.Label>
          {displays.map((d) => (
            <Toggle
              key={d.id}
              icon={<Monitor size={14} />}
              label={d.label}
              hint={
                d.role === role || d.role === 'none'
                  ? `${d.width}×${d.height}${d.isControl ? ` · ${t('outputs.control')}` : ''}`
                  : t('screensMenu.nowShowing', { role: t(`outputs.role.${d.role}`) })
              }
              checked={d.role === role}
              onChange={(on) =>
                void assignDisplay(d.id, on ? role : 'none', d.isControl, t('outputs.warnControl'))
              }
            />
          ))}
          {role === 'main' && (
            <Toggle
              icon={<AppWindow size={14} />}
              label={t('screensMenu.window')}
              hint={t('screensMenu.windowHint')}
              checked={windowMode}
              onChange={(on) => void saveSettings({ windowMode: on })}
            />
          )}
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          {role === 'main' ? (
            <Toggle
              icon={<Grid3x3 size={14} />}
              label={t('outputs.testPattern')}
              disabled={outputs.length === 0}
              checked={patternOn}
              onChange={(on) => {
                for (const outputId of outputs) void cmd('live.testPattern', { outputId, on });
              }}
            />
          ) : (
            <>
              <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                {t('stageLayouts.switch')}
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={layoutId}
                onValueChange={(id) => void saveSettings({ stageLayoutId: id })}
              >
                {[...STAGE_PRESETS, ...layouts].map((l) => (
                  <DropdownMenu.RadioItem
                    key={l.id}
                    value={l.id}
                    className={ITEM_CLASS}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Typography className="flex w-3.5 justify-center">
                      <DropdownMenu.ItemIndicator>
                        <Check size={14} />
                      </DropdownMenu.ItemIndicator>
                    </Typography>
                    <Typography truncate className="flex-1">
                      {l.name}
                    </Typography>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
            </>
          )}
          {role === 'stage' && (
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => useStore.setState({ mode: 'stage' })}
            >
              <LayoutTemplate size={14} />
              {t('screensMenu.editStage')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => openDialog('outputs')}>
            <Settings2 size={14} />
            {t('screensMenu.settings')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
