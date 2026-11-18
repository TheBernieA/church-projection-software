import { makeScene, type Scene, type ServiceItem } from '@lampstand/core';
import { type PresentableSlide } from '../types';

/**
 * A slide's thumbnail scene. `wordsOnly`: leave the background out (it's the item's, shown as
 * its own tile), so the words sit on a transparent backdrop.
 */
export function thumbScene(slide: PresentableSlide, wordsOnly = false): Scene {
  const a = slide.action;
  if (a.kind === 'content') {
    const v = slide.countdownVideo;
    return makeScene({
      background: wordsOnly ? null : a.background,
      content: v?.hideTimer ? null : a.content,
      // A countdown video: its first frame, under the numbers.
      media: v
        ? {
            mediaId: v.mediaId,
            kind: 'video',
            loop: false,
            muted: true,
            fit: 'cover',
            playing: false,
            position: 0,
            volume: 1,
          }
        : null,
    });
  }
  if (a.kind === 'media') return makeScene({ media: a.media });
  if (a.kind === 'web') return makeScene({ web: a.web });
  return makeScene({ background: a.background });
}

/** Items whose slides can be edited in the Edit workspace (Quick Edit, right-click). */
export function editable(item: ServiceItem): boolean {
  return (
    item.kind === 'song' ||
    item.kind === 'presentation' ||
    item.kind === 'announcements' ||
    item.kind === 'countdown'
  );
}
