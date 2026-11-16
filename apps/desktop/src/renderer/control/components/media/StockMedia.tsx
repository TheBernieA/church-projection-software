import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  newId,
  STOCK_BACKGROUNDS,
  STOCK_COUNTDOWN_BACKGROUNDS,
  STOCK_COUNTDOWN_MINUTES,
  type BackgroundRef,
  type StockCategory,
} from '@lampstand/core';
import { Segmented, Typography } from '@lampstand/ui';
import { setBackground } from '../../lib/actions';
import { addItemToService, toast } from '../../lib/store';
import { BackgroundTile } from '../BackgroundTile';

type View = StockCategory | 'all' | 'countdowns';
const CATEGORIES: StockCategory[] = ['worship', 'calm', 'seasons', 'abstract', 'nature'];

/**
 * Stock media (media bin › Sources): ready-made motion backgrounds by occasion, and countdowns
 * on motion backgrounds, all drawn by Lampstand itself (offline, licence-free, any resolution).
 * Click a background to show it behind the words; click a countdown to add it to the playlist.
 */
export function StockMedia() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('all');
  const backgrounds = STOCK_BACKGROUNDS.filter((b) => view === 'all' || b.category === view);
  const addCountdown = (minutes: number, ref: BackgroundRef): void => {
    addItemToService({
      id: newId(),
      kind: 'countdown',
      title: t('stock.countdownTitle'),
      target: { durationSec: minutes * 60 },
      background: ref,
    });
    toast(t('stock.countdownAdded', { count: minutes }));
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
      <div className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-[var(--divider)] bg-[var(--surface-1)] px-3">
        <Typography size={12} weight="medium" tone="primary" className="shrink-0">
          {t('bin.tabs.stock-media')}
        </Typography>
        <Segmented<View>
          label={t('stock.category')}
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: t('stock.all') },
            ...CATEGORIES.map((c) => ({ value: c, label: t(`stock.categories.${c}`) })),
            { value: 'countdowns', label: t('stock.countdowns') },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {view === 'countdowns' ? (
          STOCK_COUNTDOWN_BACKGROUNDS.map((id) => {
            const bg = STOCK_BACKGROUNDS.find((b) => b.id === id);
            if (!bg) return null;
            return (
              <section key={id} className="pb-5">
                <Typography as="h3" variant="title" className="pb-2.5">
                  {bg.name}
                </Typography>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                  {STOCK_COUNTDOWN_MINUTES.map((n) => (
                    <BackgroundTile
                      key={n}
                      name={t('stock.countdown', { count: n })}
                      bgRef={bg.ref}
                      title={t('stock.addCountdown', { count: n })}
                      onPick={() => addCountdown(n, bg.ref)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <>
            <Typography as="p" variant="caption" className="pb-3">
              {t('stock.hint')}
            </Typography>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {backgrounds.map((b) => (
                <BackgroundTile
                  key={b.id}
                  name={b.name}
                  bgRef={b.ref}
                  title={t('media.setBackground')}
                  onPick={() => void setBackground(b.ref)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
