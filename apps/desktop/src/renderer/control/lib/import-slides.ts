import { newId, type ServiceItem, type TextSlide } from '@lampstand/core';
import i18n from '../i18n';
import { q } from './api';
import { CANVAS } from './objects';
import { renderPdfPages } from './pdf';
import { addItemToService, attempt, toast } from './store';

type Presentation = Extract<ServiceItem, { kind: 'presentation' }>;

/**
 * "Import slides": a PowerPoint deck becomes editable text slides (titles, text, notes); a PDF
 * becomes one picture per page, each placed full-screen on a slide. Keynote users export to
 * PDF or PowerPoint first.
 */
export async function importSlides(): Promise<void> {
  const r = await attempt(() => q('slides.import'), 'errors.import');
  if (!r || r.kind === 'none') return;

  if (r.kind === 'pptx') {
    const slides: TextSlide[] = r.slides.map((s) => {
      const slide: TextSlide = { id: newId(), body: s.body };
      if (s.title) slide.title = s.title;
      if (s.notes) slide.notes = s.notes;
      return slide;
    });
    if (!slides.length) return toast(i18n.t('import.empty'), 'warning');
    addItemToService({
      id: newId(),
      kind: 'presentation',
      title: r.title,
      slides,
    } satisfies Presentation);
    toast(i18n.t('import.done', { count: slides.length }));
    if (r.slidesWithPictures)
      toast(i18n.t('import.picturesSkipped', { count: r.slidesWithPictures }), 'warning');
    return;
  }

  toast(i18n.t('import.pdfStarted'));
  const pages = await attempt(() => renderPdfPages(r.data), 'errors.import');
  if (!pages?.length) return;
  const slides: TextSlide[] = [];
  for (const [i, data] of pages.entries()) {
    const media = await attempt(
      () => q('media.importBytes', { name: `${r.title} ${i + 1}`, data }),
      'errors.import',
    );
    if (!media) continue;
    slides.push({
      id: newId(),
      body: '',
      title: i18n.t('import.page', { n: i + 1 }),
      objects: [
        {
          id: newId(),
          kind: 'image',
          x: 0,
          y: 0,
          w: CANVAS.width,
          h: CANVAS.height,
          mediaId: media.id,
          fit: 'contain',
        },
      ],
    });
  }
  if (!slides.length) return toast(i18n.t('import.empty'), 'warning');
  addItemToService({
    id: newId(),
    kind: 'presentation',
    title: r.title,
    slides,
  } satisfies Presentation);
  toast(i18n.t('import.done', { count: slides.length }));
}
