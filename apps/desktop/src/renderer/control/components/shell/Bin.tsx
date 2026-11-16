import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Images,
  MessageSquareText,
  Sparkle,
  Timer,
  Video,
  Wallpaper,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, SoonBadge } from '@lampstand/ui';
import { useStore } from '../../lib/store';
import { BackgroundsPanel, MediaPanel } from '../MediaPanel';
import { MessagesBin } from '../bins/MessagesBin';
import { PropsBin } from '../bins/PropsBin';
import { SoonPanel } from '../bins/SoonPanel';
import { TimersBin } from '../bins/TimersBin';
import { PaneTab } from './PaneHeader';
import { type BinTab } from '../../types';

const TABS: { tab: BinTab; icon: LucideIcon; soon?: string[] }[] = [
  { tab: 'media', icon: Images },
  { tab: 'backgrounds', icon: Wallpaper },
  { tab: 'props', icon: Sparkle },
  { tab: 'messages', icon: MessageSquareText },
  { tab: 'timers', icon: Timer },
  { tab: 'audio', icon: AudioLines, soon: ['audio-bin', 'audio-input'] },
  { tab: 'video-input', icon: Video, soon: ['video-input'] },
  { tab: 'macros', icon: Workflow, soon: ['macros', 'slide-actions', 'timeline'] },
];

/** Bottom bin: media, backgrounds, props, messages, timers (and the tools coming soon). */
export function Bin({ height }: { height: number }) {
  const { t } = useTranslation();
  const tab = useStore((s) => s.binTab);
  const open = useStore((s) => s.binOpen);
  const current = TABS.find((x) => x.tab === tab) ?? { tab: 'media' as const, icon: Images };
  // How many things each bin holds (primitives, so ticking live state doesn't re-render).
  const mediaCount = useStore(
    (s) => s.media.filter((m) => !m.isBackground && m.kind !== 'audio').length,
  );
  const propCount = useStore((s) => s.settings?.props.length ?? 0);
  const messageCount = useStore((s) => s.settings?.messages.length ?? 0);
  const timerCount = useStore((s) => s.settings?.timers.length ?? 0);
  const counts: Partial<Record<BinTab, number>> = {
    media: mediaCount,
    props: propCount,
    messages: messageCount,
    timers: timerCount,
  };
  return (
    <section
      aria-label={t('bin.label')}
      className="flex shrink-0 flex-col overflow-hidden"
      style={{ height: open ? height : undefined }}
    >
      <div className="no-scrollbar flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--hairline)] px-2">
        {TABS.map(({ tab: x, icon: Icon, soon }) => (
          <PaneTab
            key={x}
            active={tab === x}
            onClick={() => useStore.setState({ binTab: x, binOpen: true })}
            icon={<Icon size={13} />}
          >
            {t(`bin.tabs.${x}`)}
            {/* Hidden from the accessible name: the tab is still just "Props". */}
            {!soon && !!counts[x] && (
              <span aria-hidden className="tnum text-[11px] text-[var(--text-3)]">
                {counts[x]}
              </span>
            )}
            {soon && <SoonBadge label={t('soon.badge')} />}
          </PaneTab>
        ))}
        <IconButton
          size="xs"
          className="ml-auto"
          aria-label={open ? t('bin.collapse') : t('bin.expand')}
          onClick={() => useStore.setState({ binOpen: !open })}
        >
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </IconButton>
      </div>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col">
          {current.soon ? (
            <SoonPanel ids={current.soon} icon={<current.icon size={20} />} />
          ) : tab === 'media' ? (
            <MediaPanel />
          ) : tab === 'backgrounds' ? (
            <BackgroundsPanel />
          ) : tab === 'props' ? (
            <PropsBin />
          ) : tab === 'messages' ? (
            <MessagesBin />
          ) : (
            <TimersBin />
          )}
        </div>
      )}
    </section>
  );
}
