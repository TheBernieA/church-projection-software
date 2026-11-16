import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  BookOpen,
  Circle,
  Clapperboard,
  Ellipsis,
  Flame,
  Images,
  Keyboard,
  Layers3,
  Palette,
  Pencil,
  Play,
  Radio,
  Rows3,
  Search,
  Settings,
  SquareDashed,
  SquareUser,
  Type,
  FileBadge,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock, sceneHasContent, secondsSince } from '@lampstand/core';
import { SoonBadge, Switch, Typography, typographyClass } from '@lampstand/ui';
import i18n from '../../i18n';
import { saveSettings } from '../../lib/actions';
import { feature } from '../../lib/features';
import { useNow } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { openDialog, useStore } from '../../lib/store';
import { ToolbarButton } from './ToolbarButton';
import { type Mode } from '../../types';

/** The four everyday workspaces sit in the toolbar; Themes is Theme, and Stage is under More. */
const MAIN_MODES: { mode: Mode; icon: LucideIcon }[] = [
  { mode: 'show', icon: Play },
  { mode: 'edit', icon: Pencil },
  { mode: 'reflow', icon: Rows3 },
  { mode: 'bible', icon: BookOpen },
];
// Themes has its own toolbar button (Theme), so More only holds the Stage workspace.
const MORE_MODES: { mode: Mode; icon: LucideIcon }[] = [{ mode: 'stage', icon: SquareUser }];

const MENU_CLASS =
  'z-[60] min-w-[220px] rounded-[8px] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-3)] outline-none focus-visible:!shadow-[var(--shadow-3)] data-[state=open]:animate-[ls-pop_120ms_ease-out]';
const ITEM_CLASS = `flex cursor-pointer items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 outline-none data-[disabled]:cursor-default data-[disabled]:text-[var(--text-3)] data-[highlighted]:bg-[var(--select)] data-[highlighted]:text-white ${typographyClass({ size: 13 })}`;

/** Tooltip for a planned item: what it will do (from the feature catalogue). */
const soonTitle = (id: string): string => {
  const f = feature(id);
  return `${i18n.t('soon.tooltip', { name: f.name })}. ${f.description}`;
};

/** A small status light on a toolbar icon. */
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--toolbar)]"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

/** Workspaces under More, plus editors that are planned. */
function MoreMenu() {
  const { t } = useTranslation();
  const mode = useStore((s) => s.mode);
  const inMore = MORE_MODES.some((m) => m.mode === mode);
  const soon: { id: string; icon: ReactNode }[] = [
    { id: 'masks', icon: <SquareDashed size={15} /> },
    { id: 'ccli', icon: <FileBadge size={15} /> },
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <ToolbarButton
          icon={<Ellipsis size={20} />}
          label={inMore ? t(`modes.${mode}`) : t('toolbar.more')}
          pressed={inMore}
          aria-label={t('toolbar.more')}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
          {MORE_MODES.map(({ mode: m, icon: Icon }) => (
            <DropdownMenu.Item
              key={m}
              className={ITEM_CLASS}
              onSelect={() => useStore.setState({ mode: m })}
            >
              <Icon size={15} />
              {t(`modes.${m}`)}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => openDialog('shortcuts')}>
            <Keyboard size={15} />
            {t('toolbar.shortcuts')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline-strong)]" />
          {soon.map((s) => (
            <DropdownMenu.Item key={s.id} disabled className={ITEM_CLASS} title={soonTitle(s.id)}>
              {s.icon}
              <span className="flex-1">{feature(s.id).name}</span>
              <SoonBadge label={t('soon.badge')} />
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Status: what's on air, which screens are connected, whether changes are saved, the time. */
function StatusMenu() {
  const { t } = useTranslation();
  const onAir = useStore((s) => !!s.live && sceneHasContent(s.live.program));
  const since = useStore((s) => s.live?.programSince ?? null);
  const saving = useStore((s) => s.saving);
  const displays = useStore((s) => s.displays);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const now = useNow(1000, onAir);
  const outputs = displays.filter((d) => d.role !== 'none');
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <ToolbarButton
          icon={<Activity size={20} />}
          label={t('toolbar.status')}
          badge={<Dot color={onAir ? 'var(--tally-program)' : 'var(--tally-preview)'} />}
          aria-label={`${t('toolbar.status')}: ${onAir ? t('toolbar.onAir') : t('toolbar.offAir')}`}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={`${MENU_CLASS} w-[260px] p-3 ${typographyClass({ size: 12 })}`}
        >
          <p className="flex items-center justify-between font-semibold">
            <span>{onAir ? t('toolbar.onAir') : t('toolbar.offAir')}</span>
            <span className="tnum text-[var(--text-2)]">
              {onAir && since ? formatClock(secondsSince(since, now), { hours: 'always' }) : ''}
            </span>
          </p>
          <Typography as="p" variant="overline" className="mt-2">
            {t('toolbar.outputs')}
          </Typography>
          <ul className="mt-1 space-y-1">
            {windowMode ? (
              <li>{t('toolbar.window')}</li>
            ) : outputs.length === 0 ? (
              <li className="text-[var(--warning)]">{t('outputs.none')}</li>
            ) : (
              outputs.map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span>{t(`outputs.role.${d.role}`)}</span>
                  <span className="truncate text-[var(--text-3)]">{d.label}</span>
                </li>
              ))
            )}
          </ul>
          <p className="mt-2 flex justify-between border-t border-[var(--hairline)] pt-2 text-[var(--text-2)]">
            <span>{saving ? t('toolbar.saving') : t('toolbar.saved')}</span>
            <span className="tnum">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Toolbar in the operator-console layout: tools on the left (search, text, theme), the
 * workspaces, then show tools on the right (media, looks, live, screens, settings, status).
 * Every item is an icon over a short label.
 */
export function Toolbar() {
  const { t } = useTranslation();
  const textBarOpen = useStore((s) => s.textBarOpen);
  const mode = useStore((s) => s.mode);
  const binOpen = useStore((s) => s.binOpen);
  const clickGoesLive = useStore((s) => s.settings?.clickGoesLive ?? true);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const hasMain = useStore((s) => s.displays.some((d) => d.role === 'main'));
  const hasStage = useStore((s) => s.displays.some((d) => d.role === 'stage'));
  const keys = effectiveShortcuts();
  const audienceOn = windowMode || hasMain;
  const green = 'var(--tally-preview)';
  const red = 'var(--tally-program)';

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-1 bg-[var(--toolbar)] px-2">
      <div
        aria-hidden
        className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#ffd28a] via-[#f0a73a] to-[#c27414] text-[#1c1306]"
      >
        <Flame size={18} strokeWidth={2.25} />
      </div>
      {/* Undo and redo live in the Edit menu and on ⌘Z / ⌘⇧Z. */}

      <ToolbarButton
        icon={<Search size={20} />}
        label={t('toolbar.search')}
        aria-label={t('top.search')}
        title={`${t('top.search')} (${displayCombo(keys.quickBar)})`}
        onClick={() => openDialog('quick')}
      />
      <ToolbarButton
        icon={<Type size={20} />}
        label={t('toolbar.text')}
        aria-label={t('textBar.label')}
        title={t('textBar.help')}
        pressed={textBarOpen}
        onClick={() => useStore.setState({ textBarOpen: !textBarOpen })}
      />
      <ToolbarButton
        icon={<Palette size={20} />}
        label={t('toolbar.theme')}
        aria-label={t('toolbar.theme')}
        pressed={mode === 'themes'}
        onClick={() => useStore.setState({ mode: 'themes' })}
      />

      <span
        aria-hidden
        className="mx-1.5 h-8 w-px bg-[color-mix(in_srgb,var(--text-1)_10%,transparent)]"
      />

      <nav aria-label={t('modes.label')} className="flex items-center gap-1">
        {MAIN_MODES.map(({ mode: m, icon: Icon }) => (
          <ToolbarButton
            key={m}
            icon={<Icon size={20} />}
            label={t(`modes.${m}`)}
            pressed={mode === m}
            onClick={() => useStore.setState({ mode: m })}
          />
        ))}
        <MoreMenu />
      </nav>

      <span className="flex-1" />

      <ToolbarButton
        icon={<Images size={20} />}
        label={t('toolbar.media')}
        pressed={binOpen}
        onClick={() => useStore.setState({ binOpen: !binOpen })}
      />
      <ToolbarButton
        icon={<Layers3 size={20} />}
        label={t('toolbar.looks')}
        soon
        title={soonTitle('looks')}
      />
      <ToolbarButton
        icon={<Radio size={20} />}
        label={t('toolbar.live')}
        soon
        // Live covers both planned capture features: recording and streaming.
        title={`${soonTitle('record')}\n${soonTitle('stream')}`}
      />

      <span
        aria-hidden
        className="mx-1.5 h-8 w-px bg-[color-mix(in_srgb,var(--text-1)_10%,transparent)]"
      />

      {/* Screens: lit green when connected, red when there's nowhere to show. */}
      <ToolbarButton
        icon={<Circle size={20} />}
        label={t('toolbar.audience')}
        badge={<Dot color={audienceOn ? green : red} />}
        title={t('top.outputs')}
        aria-label={`${t('toolbar.audience')}: ${audienceOn ? (windowMode ? t('toolbar.window') : t('toolbar.assigned')) : t('outputs.none')}`}
        onClick={() => openDialog('outputs')}
      />
      <ToolbarButton
        icon={<Clapperboard size={20} />}
        label={t('toolbar.stage')}
        badge={<Dot color={hasStage ? green : 'var(--text-3)'} />}
        aria-label={`${t('toolbar.stage')}: ${hasStage ? t('toolbar.assigned') : t('toolbar.notAssigned')}`}
        onClick={() => openDialog('outputs')}
      />

      <span
        aria-hidden
        className="mx-1.5 h-8 w-px bg-[color-mix(in_srgb,var(--text-1)_10%,transparent)]"
      />

      <label
        className="flex h-[46px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[6px] px-1.5 text-[var(--text-2)] hover:bg-[color-mix(in_srgb,var(--text-1)_7%,transparent)]"
        title={t('top.previewFirstHelp')}
      >
        <span className="flex h-[22px] items-center">
          <Switch
            label={t('top.previewFirst')}
            checked={!clickGoesLive}
            onChange={(on) => void saveSettings({ clickGoesLive: !on })}
          />
        </span>
        <Typography size={11} leading="none">
          {t('toolbar.preview')}
        </Typography>
      </label>
      <ToolbarButton
        icon={<Settings size={20} />}
        label={t('toolbar.settings')}
        title={t('top.settings')}
        onClick={() => openDialog('settings')}
      />
      <StatusMenu />
    </header>
  );
}
