import { useTranslation } from 'react-i18next';
import { BibleBrowser } from '../BibleBrowser';
import { SlideGrid } from '../SlideGrid';

/** Bible workspace: pick book, chapter and verses on the left; the passage's slides beside. */
export function BibleMode() {
  const { t } = useTranslation();
  return (
    // Side by side; in a narrow workspace the books sit above the passage's slides.
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 @max-[720px]:flex-col">
        <section
          aria-label={t('modes.bible')}
          className="flex w-[380px] shrink-0 flex-col border-r border-[var(--hairline)] pt-3 @max-[720px]:h-[55%] @max-[720px]:w-full @max-[720px]:border-b @max-[720px]:border-r-0"
        >
          <BibleBrowser />
        </section>
        <SlideGrid />
      </div>
    </div>
  );
}
