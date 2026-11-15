/**
 * Render PDF pages to PNG images with pdf.js, in the control window (it has a canvas; main
 * doesn't). Loaded on demand so it never slows down startup. The worker is bundled with the
 * app, so the strict CSP (`'self'`) holds, and eval is turned off.
 */
const MAX_PAGES = 200;

export async function renderPdfPages(
  data: Uint8Array,
  opts: { width?: number; onPage?: (n: number, total: number) => void } = {},
): Promise<Uint8Array<ArrayBuffer>[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const total = Math.min(doc.numPages, MAX_PAGES);
  const width = opts.width ?? 1920;
  const pages: Uint8Array<ArrayBuffer>[] = [];
  try {
    for (let n = 1; n <= total; n++) {
      opts.onPage?.(n, total);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) pages.push(new Uint8Array(await blob.arrayBuffer()));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
