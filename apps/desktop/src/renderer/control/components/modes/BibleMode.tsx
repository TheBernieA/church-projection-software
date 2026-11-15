import { useTranslation } from 'react-i18next';
import { BibleBrowser } from '../BibleBrowser';
import { SlideGrid } from '../SlideGrid';

/** Bible workspace: pick book, chapter and verses on the left; the passage's slides beside. */
export function BibleMode() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label={t('modes.bible')}
        className="flex w-[380px] shrink-0 flex-col border-r border-[var(--hairline)] pt-3"
      >
        <BibleBrowser />
      </section>
      <SlideGrid />
    </div>
  );
}
