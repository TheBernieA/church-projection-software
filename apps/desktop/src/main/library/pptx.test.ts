import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parsePptx } from './pptx';

const sp = (text: string, ph?: string): string =>
  `<p:sp><p:nvSpPr><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody>${text
    .split('\n')
    .map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`)
    .join('')}</p:txBody></p:sp>`;
const slide = (...shapes: string[]): string =>
  `<?xml version="1.0"?><p:sld><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`;

/** A minimal .pptx: two slides (listed in reverse file order), notes on one, a picture on one. */
export function samplePptx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'ppt/presentation.xml': strToU8(
      '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId2" Type="http://x/slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="http://x/slide" Target="slides/slide1.xml"/></Relationships>',
    ),
    'ppt/slides/slide1.xml': strToU8(
      slide(
        sp('Welcome &amp; hello', 'ctrTitle'),
        sp('Grace Church\nSunday 10am'),
        sp('3', 'sldNum'),
      ),
    ),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Type="http://x/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    ),
    'ppt/notesSlides/notesSlide1.xml': strToU8(slide(sp('Smile and welcome everyone', 'body'))),
    'ppt/slides/slide2.xml': strToU8(
      slide(sp('Announcements', 'title'), sp('Coffee after the service')) + '<p:pic/>',
    ),
    'ppt/media/image1.png': new Uint8Array(2048), // skipped: never unpacked
  });
}

describe('PowerPoint import', () => {
  it('reads slides in presentation order with titles, body text and notes', async () => {
    const deck = await parsePptx(samplePptx());
    expect(deck.slides).toEqual([
      {
        title: 'Welcome & hello',
        body: 'Grace Church\nSunday 10am',
        notes: 'Smile and welcome everyone',
      },
      { title: 'Announcements', body: 'Coffee after the service', notes: '' },
    ]);
    expect(deck.slidesWithPictures).toBe(1);
  });

  it('rejects files that are not presentations', async () => {
    await expect(parsePptx(zipSync({ 'readme.txt': strToU8('hi') }))).rejects.toThrow(
      /not a PowerPoint/,
    );
  });
});
