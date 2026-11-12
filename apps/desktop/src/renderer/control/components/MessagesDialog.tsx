import { useState } from 'react';
import { MessageSquare, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId } from '@lampstand/core';
import { Button } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { useStore } from '../lib/store';
import { Dialog } from './Dialog';

/** Booth → stage message and the congregation ticker (nursery calls, parking). */
export function MessagesDialog() {
  const { t } = useTranslation();
  const live = useStore((s) => s.live);
  const [msg, setMsg] = useState('');
  const [ticker, setTicker] = useState('');
  const tickerOn = live?.program.overlays.some((o) => o.kind === 'ticker') ?? false;

  return (
    <Dialog name="messages" title={t('monitor.messagesTitle')}>
      <div className="space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cmd('stage.message', { text: msg, flash: true });
          }}
        >
          <label className="label flex items-center gap-1.5" htmlFor="stage-msg">
            <MessageSquare size={14} /> {t('monitor.stageMessage')}
          </label>
          <div className="flex gap-2">
            <input
              id="stage-msg"
              autoFocus
              className="field"
              value={msg}
              maxLength={300}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Wrap up — 5 min"
            />
            <Button type="submit" variant="primary" disabled={!msg.trim()}>
              {t('monitor.send')}
            </Button>
          </div>
          {live?.stageMessage && (
            <div className="mt-2 flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--accent-soft)] px-3 py-2 text-[13px]">
              <span className="truncate">“{live.stageMessage.text}”</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void cmd('stage.message', { text: '', flash: false })}
              >
                {t('monitor.clearMessage')}
              </Button>
            </div>
          )}
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const others = live?.program.overlays.filter((o) => o.kind !== 'ticker') ?? [];
            void cmd('live.setOverlays', {
              overlays: tickerOn
                ? others
                : [...others, { id: newId(), kind: 'ticker', text: ticker }],
            });
          }}
        >
          <label className="label flex items-center gap-1.5" htmlFor="ticker">
            <Radio size={14} /> {t('monitor.ticker')}
          </label>
          <div className="flex gap-2">
            <input
              id="ticker"
              className="field"
              value={ticker}
              maxLength={500}
              onChange={(e) => setTicker(e.target.value)}
              placeholder={t('monitor.tickerPlaceholder')}
            />
            <Button
              type="submit"
              variant={tickerOn ? 'live' : 'secondary'}
              disabled={!tickerOn && !ticker.trim()}
            >
              {tickerOn ? t('monitor.hide') : t('monitor.show')}
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
