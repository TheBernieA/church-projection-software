import * as RD from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { useAsk } from '../lib/confirm';
import { OVERLAY_CLASS } from './Dialog';

/** Where {@link ask}'s questions show: a small dialog over everything, Esc or Cancel for no. */
export function ConfirmHost() {
  const { t } = useTranslation();
  const q = useAsk();
  return (
    <RD.Root open={!!q} onOpenChange={(open) => !open && q?.answer(false)}>
      <RD.Portal>
        <RD.Overlay className={`${OVERLAY_CLASS} !z-[60]`} />
        <RD.Content
          aria-describedby="confirm-message"
          // Esc answers no here; it never also reaches the show (where Esc clears the screens).
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            q?.answer(false);
          }}
          className="fixed left-1/2 top-[22vh] z-[61] w-[min(420px,92vw)] -translate-x-1/2 rounded-[var(--radius-xl)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-3),var(--highlight-top)] data-[state=open]:animate-[ls-dialog_160ms_var(--ease-out)]"
        >
          <RD.Title className="sr-only">{t('confirm.title')}</RD.Title>
          <Typography
            as="p"
            id="confirm-message"
            size={14}
            leading="snug"
            tone="primary"
            className="max-h-[50vh] overflow-y-auto whitespace-pre-line"
          >
            {q?.message}
          </Typography>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => q?.answer(false)}>
              {t('confirm.cancel')}
            </Button>
            <Button
              autoFocus
              variant={q?.tone === 'live' ? 'live' : q?.tone === 'danger' ? 'danger' : 'primary'}
              className={
                q?.tone === 'danger' ? 'shadow-[inset_0_0_0_1px_var(--tally-program)]' : ''
              }
              onClick={() => q?.answer(true)}
            >
              {q?.confirm ?? t('confirm.ok')}
            </Button>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
