import { LayoutTemplate } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTimer, makeScene, timerSeconds } from '@lampstand/core';
import { SceneView } from '../SceneView';
import { SoonPanel } from '../bins/SoonPanel';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { Text } from '@lampstand/ui';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Stage workspace: a live mirror of the stage display (now, next, clock, timers, message), with
 * custom layouts coming soon.
 */
export function StageMode() {
  const { t } = useTranslation();
  const live = useStore((s) => s.live);
  const now = useNow(500);
  if (!live) return null;
  const p = live.program;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className="m-4 flex flex-col gap-3 rounded-[6px] bg-[#07080c] p-4 text-[#eceef4]"
        data-testid="stage-mirror"
      >
        <div className="flex items-center justify-between gap-4">
          <Text size={28} weight="bold" tabular>
            {clock.format(now)}
          </Text>
          <Text variant="heading" truncate className="text-[var(--accent)]">
            {p.content?.label ?? ''}
          </Text>
          <div className="flex gap-2">
            {live.timers.map((tm) => {
              const secs = timerSeconds(tm, now);
              return (
                <span
                  key={tm.id}
                  className="flex items-baseline gap-1.5 rounded-[6px] bg-white/5 px-2 py-1"
                >
                  <Text size={10} className="uppercase tracking-wider text-[#9aa1b5]">
                    {tm.name}
                  </Text>
                  <Text
                    size={18}
                    weight="bold"
                    tabular
                    className={secs < 0 ? 'text-[var(--tally-program)]' : ''}
                  >
                    {formatTimer(secs, tm.kind)}
                  </Text>
                </span>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-4">
          <div>
            <Text as="p" size={11} className="mb-1 uppercase tracking-[0.12em] text-[#e5484d]">
              {t('stage.now')}
            </Text>
            <div className="overflow-hidden rounded-[4px]">
              <SceneView
                scene={makeScene({ background: p.background, media: p.media, content: p.content })}
                label={t('stage.now')}
              />
            </div>
          </div>
          <div>
            <Text as="p" size={11} className="mb-1 uppercase tracking-[0.12em] text-[#9aa1b5]">
              {t('stage.next')}
            </Text>
            <div className="overflow-hidden rounded-[4px]">
              <SceneView
                scene={makeScene({ background: p.background, content: live.next })}
                label={t('stage.next')}
              />
            </div>
          </div>
        </div>
        {live.stageMessage && (
          <Text
            as="p"
            size={16}
            weight="bold"
            className="rounded-[6px] bg-[var(--accent)] px-3 py-2 text-center text-[var(--accent-ink)]"
          >
            {live.stageMessage.text}
          </Text>
        )}
      </div>
      <div className="flex min-h-[180px] flex-1">
        <SoonPanel ids={['stage-layouts', 'stage-app']} icon={<LayoutTemplate size={20} />} />
      </div>
    </div>
  );
}
