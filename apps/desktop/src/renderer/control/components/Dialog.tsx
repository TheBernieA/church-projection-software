import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { closeDialog, useStore } from '../lib/store';
import { type DialogName } from '../types';
import { typographyClass } from '@lampstand/ui';

/**
 * Dimmed backdrop shared by every modal surface (dialogs, quick bar). Solid, no backdrop blur:
 * blurring the animated monitors behind it cost a repaint every frame.
 */
export const OVERLAY_CLASS =
  'fixed inset-0 z-40 bg-[rgba(5,6,10,0.66)] data-[state=open]:animate-[ls-fade_160ms_var(--ease-out)]';

/** Accessible dialog bound to the store's `dialog` slot. */
export function Dialog({
  name,
  title,
  children,
  wide,
  footer,
  bare,
}: {
  name: Exclude<DialogName, null>;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  /** Children own the whole surface (e.g. a two-pane settings window): fixed height, no padding. */
  bare?: boolean;
}) {
  const { t } = useTranslation();
  const open = useStore((s) => s.dialog === name);
  return (
    <RD.Root open={open} onOpenChange={(o) => !o && closeDialog()}>
      <RD.Portal>
        <RD.Overlay className={OVERLAY_CLASS} />
        <RD.Content
          aria-describedby={undefined}
          className={`fixed left-1/2 top-[7vh] z-50 flex max-h-[86vh] -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-1)] shadow-[var(--shadow-3),var(--highlight-top)] data-[state=open]:animate-[ls-dialog_180ms_var(--ease-out)] ${wide ? 'w-[min(1240px,96vw)]' : 'w-[min(580px,94vw)]'} ${bare ? 'top-[5vh] h-[min(820px,90vh)] max-h-[90vh]' : ''}`}
        >
          {bare ? (
            <>
              <RD.Title className="sr-only">{title}</RD.Title>
              <RD.Close
                className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
                aria-label={t('common.close')}
              >
                <X size={17} />
              </RD.Close>
              <div className="flex min-h-0 flex-1">{children}</div>
            </>
          ) : (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-5">
                <RD.Title
                  className={`tracking-[-0.01em] ${typographyClass({ size: 16, weight: 'semibold' })}`}
                >
                  {title}
                </RD.Title>
                <RD.Close
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
                  aria-label={t('common.close')}
                >
                  <X size={17} />
                </RD.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
              {footer && (
                <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-[var(--hairline)] bg-[var(--surface-0)]/40 px-5">
                  {footer}
                </div>
              )}
            </>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
