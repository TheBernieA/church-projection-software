import type { StreamSettings } from '@lampstand/core';
import { saveSettings } from './actions';
import { useStore } from './store';

type Picture = StreamSettings['picture'];

/** The stream shows the screens: the projector's picture with its words, full screen. */
export const showsScreens = (p: Picture): boolean =>
  p.mirror === 'own' && p.background === 'program' && p.words === 'full';

const same = (a: Picture, b: Picture): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The screens are on the stream because of Send to stream (and nothing has changed the stream's
 * picture since).
 */
export function useTakeoverOn(): boolean {
  return useStore((s) => {
    const t = s.streamTakeover;
    const pic = s.settings?.stream.picture;
    return !!t && !!pic && same(t.sent, pic);
  });
}

/**
 * Send to stream: put what the screens show on the stream (the camera scene, say, gives way to
 * the slide); again, the stream's picture goes back as it was. Choosing another scene meanwhile
 * ends it (that scene stays).
 */
export function toggleTakeover(): void {
  const s = useStore.getState();
  const st = s.settings?.stream;
  if (!st) return;
  const t = s.streamTakeover;
  if (t && same(t.sent, st.picture)) {
    useStore.setState({ streamTakeover: null });
    void saveSettings({ stream: { ...st, picture: t.previous } });
    return;
  }
  const sent: Picture = { ...st.picture, mirror: 'own', background: 'program', words: 'full' };
  useStore.setState({ streamTakeover: { previous: st.picture, sent } });
  void saveSettings({ stream: { ...st, picture: sent } });
}
