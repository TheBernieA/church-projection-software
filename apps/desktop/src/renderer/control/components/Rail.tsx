import {
  BookOpen,
  Flame,
  Images,
  Keyboard,
  ListMusic,
  MonitorUp,
  Music,
  Palette,
  Settings,
  Wallpaper,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openDialog, useStore, type LibraryTab } from '../lib/store';

const LIBRARY: { tab: LibraryTab; icon: LucideIcon }[] = [
  { tab: 'bible', icon: BookOpen },
  { tab: 'songs', icon: Music },
  { tab: 'hymns', icon: ListMusic },
  { tab: 'media', icon: Images },
  { tab: 'backgrounds', icon: Wallpaper },
  { tab: 'themes', icon: Palette },
];

function RailButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`group relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-[9px] h-5 w-[3px] rounded-r bg-[var(--accent)]"
        />
      )}
      <Icon size={20} strokeWidth={1.75} />
      <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-[var(--surface-4)] px-2 py-1 text-[12px] font-medium text-[var(--text-1)] opacity-0 shadow-[var(--shadow-2)] transition-opacity group-hover:opacity-100 group-aria-pressed:!opacity-0">
        {label}
      </span>
    </button>
  );
}

/** Left icon rail: library sections toggle the drawer; app-level tools at the bottom. */
export function Rail() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.libraryTab);
  return (
    <nav
      aria-label={t('library.title')}
      className="flex w-[60px] shrink-0 flex-col items-center gap-1 py-3"
    >
      <div
        aria-hidden
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#f6cf7e] via-[#e8b04b] to-[#b8761a] text-[#1b1608] shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset,0_6px_18px_rgba(232,176,75,0.35)]"
      >
        <Flame size={19} strokeWidth={2.25} fill="rgba(27,22,8,0.18)" />
      </div>
      {LIBRARY.map(({ tab: x, icon }) => (
        <RailButton
          key={x}
          label={t(`library.tabs.${x}`)}
          icon={icon}
          active={tab === x}
          onClick={() => useStore.setState({ libraryTab: tab === x ? null : x })}
        />
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton
          label={t('top.outputs')}
          icon={MonitorUp}
          onClick={() => openDialog('outputs')}
        />
        <RailButton
          label={t('top.shortcuts')}
          icon={Keyboard}
          onClick={() => openDialog('shortcuts')}
        />
        <RailButton
          label={t('top.settings')}
          icon={Settings}
          onClick={() => openDialog('settings')}
        />
      </div>
    </nav>
  );
}
