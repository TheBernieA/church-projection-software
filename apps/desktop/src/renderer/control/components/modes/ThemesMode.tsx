import { useTranslation } from 'react-i18next';
import { ThemesPanel } from '../ThemesPanel';

/** Themes workspace: the theme gallery, full size. */
export function ThemesMode() {
  const { t } = useTranslation();
  return (
    <section aria-label={t('modes.themes')} className="flex min-h-0 flex-1 flex-col pt-3">
      <ThemesPanel />
    </section>
  );
}
