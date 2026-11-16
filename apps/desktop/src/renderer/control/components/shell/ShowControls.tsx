import {
  AudioLines,
  MessageSquareText,
  Podium,
  Sparkle,
  Timer,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoonBadge, Button } from '@lampstand/ui';
import { feature } from '../../lib/features';
import { useStore } from '../../lib/store';
import { AudioBin } from '../bins/AudioBin';
import { MessagesBin, StageMessage } from '../bins/MessagesBin';
import { PropsBin } from '../bins/PropsBin';
import { SoonPanel } from '../bins/SoonPanel';
import { TimersBin } from '../bins/TimersBin';
import { type ControlsTab } from '../../types';

type Tab = ControlsTab;

const TABS: { tab: Tab; icon: LucideIcon; soon?: string[] }[] = [
  { tab: 'audio', icon: AudioLines },
  { tab: 'stage', icon: Podium },
  { tab: 'timers', icon: Timer },
  { tab: 'messages', icon: MessageSquareText },
  { tab: 'props', icon: Sparkle },
  { tab: 'macros', icon: Workflow, soon: ['macros', 'slide-actions', 'timeline'] },
];

/**
 * Show controls, under the output monitor: icon tabs for audio, the stage message, timers,
 * messages and props (macros and audio are planned). The panel below runs the selected one.
 */
export function ShowControls() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.controlsTab);
  const current = TABS.find((x) => x.tab === tab) ?? TABS[2];
  return (
    <section aria-label={t('showControls.label')} className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        className="flex h-9 shrink-0 border-b border-[var(--divider)] bg-[var(--surface-1)]"
      >
        {TABS.map(({ tab: x, icon: Icon, soon }) => {
          const on = x === tab;
          const name = t(`showControls.${x}`);
          const tip = soon
            ? `${t('soon.tooltip', { name })}. ${feature(soon[0] ?? '').description}`
            : name;
          return (
            <Button
              variant="bare"
              key={x}
              role="tab"
              aria-selected={on}
              aria-pressed={on}
              aria-label={name}
              title={tip}
              onClick={() => useStore.setState({ controlsTab: x })}
              className={`relative flex flex-1 cursor-pointer items-center justify-center transition-colors ${
                on
                  ? 'bg-[var(--select)] text-white'
                  : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon size={16} />
              {soon && (
                <span className="pointer-events-none absolute right-0.5 top-0.5 scale-[0.7]">
                  <SoonBadge label={t('soon.badge')} />
                </span>
              )}
            </Button>
          );
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {current?.soon ? (
          <SoonPanel ids={current.soon} icon={<current.icon size={20} />} />
        ) : tab === 'audio' ? (
          <AudioBin />
        ) : tab === 'stage' ? (
          <div className="p-2.5">
            <StageMessage />
          </div>
        ) : tab === 'messages' ? (
          <MessagesBin />
        ) : tab === 'props' ? (
          <PropsBin />
        ) : (
          <TimersBin />
        )}
      </div>
    </section>
  );
}
