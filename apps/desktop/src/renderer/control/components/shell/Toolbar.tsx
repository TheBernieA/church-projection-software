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
  Check,
  Settings2,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock, sceneHasContent, secondsSince, type Look } from '@lampstand/core';
import { SoonBadge, Switch, Typography, typographyClass } from '@lampstand/ui';
import i18n from '../../i18n';
import { saveSettings, setLook } from '../../lib/actions';
import { feature } from '../../lib/features';
import { useNow } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { openDialog, useStore } from '../../lib/store';
import { ToolbarButton } from './ToolbarButton';
import { type Mode } from '../../types';
import { ITEM_CLASS, MENU_CLASS } from '../menu';

/** The four everyday workspaces sit in the toolbar; Themes is Theme, and Stage is under More. */
const MAIN_MODES: { mode: Mode; icon: LucideIcon }[] = [
  { mode: 'show', icon: Play },
  { mode: 'edit', icon: Pencil },
  { mode: 'reflow', icon: Rows3 },
  { mode: 'bible', icon: BookOpen },
];
// Themes has its own toolbar button (Theme), so More only holds the Stage workspace.
const MORE_MODES: { mode: Mode; icon: LucideIcon }[] = [{ mode: 'stage', icon: SquareUser }];

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

const NO_LOOKS: Look[] = [];

/**
 * Looks: switch which layers each kind of screen shows, from saved combinations (Settings ›
 * Screens). The button lights while a Look is on. An edited Look updates on screen straight away.
 */
function LooksMenu() {
  const { t } = useTranslation();
  const looks = useStore((s) => s.settings?.looks ?? NO_LOOKS);
  const active = useStore((s) => s.live?.look ?? null);
  const loaded = useStore((s) => !!s.settings);
  // Keep the Look on screen in step with its saved version (renamed, layers changed, deleted).
  // Not before settings load: an empty list then would wrongly turn a running Look off.
  useEffect(() => {
    if (!active || !loaded) return;
    const saved = looks.find((l) => l.id === active.id);
    if (!saved) void setLook(null);
    else if (JSON.stringify(saved) !== JSON.stringify(active)) void setLook(saved);
  }, [looks, active, loaded]);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <ToolbarButton
          icon={<Layers3 size={20} />}
          label={t('toolbar.looks')}
          aria-label={t('looks.button')}
          title={active ? t('looks.on', { name: active.name }) : t('looks.button')}
          pressed={!!active}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.RadioGroup
            value={active?.id ?? 'all'}
            onValueChange={(id) => void setLook(looks.find((l) => l.id === id) ?? null)}
          >
            <DropdownMenu.RadioItem value="all" className={ITEM_CLASS}>
              <Typography className="flex w-4 justify-center">
                <DropdownMenu.ItemIndicator>
                  <Check size={14} />
                </DropdownMenu.ItemIndicator>
              </Typography>
              {t('looks.everything')}
            </DropdownMenu.RadioItem>
            {looks.map((l) => (
              <DropdownMenu.RadioItem key={l.id} value={l.id} className={ITEM_CLASS}>
                <Typography className="flex w-4 justify-center">
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
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline-strong)]" />
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => openDialog('settings', { settingsPage: 'screens' })}
          >
            <Settings2 size={15} />
            {looks.length ? t('looks.edit') : t('looks.create')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Workspaces under More, plus editors that are planned. */
function MoreMenu() {
  const { t } = useTranslation();
  const mode = useStore((s) => s.mode);
  const inMore = MORE_MODES.some((m) => m.mode === mode);
  const soon: { id: string; icon: ReactNode }[] = [{ id: 'ccli', icon: <FileBadge size={15} /> }];
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
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => openDialog('settings', { settingsPage: 'screens' })}
          >
            <SquareDashed size={15} />
            {t('masks.menu')}
          </DropdownMenu.Item>
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
          <Typography as="p" weight="semibold" className="flex items-center justify-between">
            <span>{onAir ? t('toolbar.onAir') : t('toolbar.offAir')}</span>
            <Typography tone="secondary" tabular>
              {onAir && since ? formatClock(secondsSince(since, now), { hours: 'always' }) : ''}
            </Typography>
          </Typography>
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
                  <Typography tone="muted" truncate>
                    {d.label}
                  </Typography>
                </li>
              ))
            )}
          </ul>
          <Typography
            as="p"
            tone="secondary"
            className="mt-2 flex justify-between border-t border-[var(--hairline)] pt-2"
          >
            <span>{saving ? t('toolbar.saving') : t('toolbar.saved')}</span>
            <Typography tabular>
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          </Typography>
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
      <LooksMenu />
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

      <Typography
        as="label"
        tone="secondary"
        className="flex h-[46px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[6px] px-1.5 hover:bg-[color-mix(in_srgb,var(--text-1)_7%,transparent)]"
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
      </Typography>
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
