import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { openDialog } from '../../lib/store';

/** The assistant has no key yet: what it is, and where to add one. */
export function KeyNeeded() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <Typography
        as="span"
        tone="secondary"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-3)]"
      >
        <KeyRound size={20} />
      </Typography>
      <Typography as="p" size={14} weight="semibold" tone="primary">
        {t('assistant.keyNeededTitle')}
      </Typography>
      <Typography as="p" variant="caption" leading="relaxed" className="max-w-[44ch]">
        {t('assistant.keyNeeded')}
      </Typography>
      <Button
        variant="primary"
        onClick={() => openDialog('settings', { settingsPage: 'assistant' })}
      >
        {t('assistant.openSettings')}
      </Button>
    </div>
  );
}
