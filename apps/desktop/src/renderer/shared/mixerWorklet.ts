import { setMixerWorklet } from '@lampstand/renderer';
import mixerWorkletUrl from './mixer.worklet.js?url&no-inline';

/**
 * Give the mixer its gate and loudness processors. Each page with a mixer calls this once,
 * before making one (a mixer made without it works, with no gate or loudness reading).
 */
export const installMixerWorklet = (): void => setMixerWorklet(mixerWorkletUrl);
