import { useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { attempt, toast, useStore } from '../../lib/store';

interface Result {
  mode: 'light' | 'balanced' | 'quality';
  encoder: string;
}

/**
 * "Check this computer": a short test encode (about 10 seconds) that finds the streaming mode
 * this computer handles with room to spare. Auto uses the answer from then on.
 */
export function CheckComputer({
  size = 'xs',
  showResult = true,
}: {
  size?: 'xs' | 'sm';
  showResult?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const last = useStore((s) => s.settings?.stream.benchmark ?? null);
  const live = useStore((s) => !!s.stream && s.stream.state !== 'idle');
  const check = async (): Promise<void> => {
    setBusy(true);
    const r = await attempt(() => cmd<Result>('stream.benchmark'), 'errors.benchmark');
    setBusy(false);
    if (r)
      toast(
        t('benchmark.done', { mode: t(`streaming.modes.${r.mode}`), encoder: r.encoder }),
        'info',
      );
  };
  return (
    <div className="flex items-center gap-2">
      <Button
        size={size}
        variant="secondary"
        icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} />}
        disabled={busy || live}
        title={live ? t('benchmark.whileLive') : t('benchmark.help')}
        onClick={() => void check()}
      >
        {busy ? t('benchmark.running') : t('benchmark.button')}
      </Button>
      {showResult && last && !busy && (
        <Typography size={11} tone="muted" truncate>
          {t('benchmark.last', { mode: t(`streaming.modes.${last.mode}`) })}
        </Typography>
      )}
    </div>
  );
}
