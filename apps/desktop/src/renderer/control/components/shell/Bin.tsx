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
import { useStore, type BinTab } from '../../lib/store';
import { BackgroundsPanel, MediaPanel } from '../MediaPanel';
import { MessagesBin } from '../bins/MessagesBin';
import { PropsBin } from '../bins/PropsBin';
import { SoonPanel } from '../bins/SoonPanel';
import { TimersBin } from '../bins/TimersBin';
import { PaneTab } from './PaneHeader';

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
  return (
    <section
      aria-label={t('bin.label')}
      className="flex shrink-0 flex-col overflow-hidden"
      style={{ height: open ? height : undefined }}
    >
      <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--hairline)] px-2">
        {TABS.map(({ tab: x, icon: Icon, soon }) => (
          <PaneTab
            key={x}
            active={tab === x}
            onClick={() => useStore.setState({ binTab: x, binOpen: true })}
            icon={<Icon size={13} />}
          >
            {t(`bin.tabs.${x}`)}
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
