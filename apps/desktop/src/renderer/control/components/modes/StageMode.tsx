import { useEffect, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTimer, makeScene, timerSeconds } from '@lampstand/core';
import { SceneView } from '../SceneView';
import { SoonPanel } from '../bins/SoonPanel';
import { useStore } from '../../lib/store';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Stage workspace: a live mirror of the stage display (now, next, clock, timers, message), with
 * custom layouts coming soon.
 */
export function StageMode() {
  const { t } = useTranslation();
  const live = useStore((s) => s.live);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (!live) return null;
  const p = live.program;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className="m-4 flex flex-col gap-3 rounded-[6px] bg-[#07080c] p-4 text-[#eceef4]"
        data-testid="stage-mirror"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="tnum text-[28px] font-bold">{clock.format(now)}</span>
          <span className="truncate text-[16px] font-semibold text-[var(--accent)]">
            {p.content?.label ?? ''}
          </span>
          <div className="flex gap-2">
            {live.timers.map((tm) => {
              const secs = timerSeconds(tm, now);
              return (
                <span
                  key={tm.id}
                  className="flex items-baseline gap-1.5 rounded-[6px] bg-white/5 px-2 py-1"
                >
                  <span className="text-[10px] uppercase tracking-wider text-[#9aa1b5]">
                    {tm.name}
                  </span>
                  <span
                    className={`tnum text-[18px] font-bold ${secs < 0 ? 'text-[var(--tally-program)]' : ''}`}
                  >
                    {formatTimer(secs, tm.kind)}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-4">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-[#e5484d]">
              {t('stage.now')}
            </p>
            <div className="overflow-hidden rounded-[4px]">
              <SceneView
                scene={makeScene({ background: p.background, media: p.media, content: p.content })}
                label={t('stage.now')}
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-[#9aa1b5]">
              {t('stage.next')}
            </p>
            <div className="overflow-hidden rounded-[4px]">
              <SceneView
                scene={makeScene({ background: p.background, content: live.next })}
                label={t('stage.next')}
              />
            </div>
          </div>
        </div>
        {live.stageMessage && (
          <p className="rounded-[6px] bg-[var(--accent)] px-3 py-2 text-center text-[16px] font-bold text-[var(--accent-ink)]">
            {live.stageMessage.text}
          </p>
        )}
      </div>
      <div className="flex min-h-[180px] flex-1">
        <SoonPanel ids={['stage-layouts']} icon={<LayoutTemplate size={20} />} />
      </div>
    </div>
  );
}
