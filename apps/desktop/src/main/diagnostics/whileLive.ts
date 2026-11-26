import { powerSaveBlocker } from 'electron';
import type { Logger } from '../types';
import { MainProfile } from './mainProfile';
import { StallWatch } from './stallWatch';

/**
 * What runs only while a stream or recording does, switched by the stream's status:
 * - macOS mustn't nap Lampstand (App Nap throttles main's timers when the window is covered:
 *   measured in Onda, which shares this engine, as 330–350 ms stalls, each a glitch in the
 *   sound) or put the computer to sleep. Displays are kept awake separately, by the outputs.
 * - Main-process stalls of 200 ms or more are logged with their cause (StallWatch).
 * - Developers (LAMPSTAND_PROFILE_MAIN=1): a CPU profile of main per session, in the log folder.
 */
export function whileLive(log: Logger, logsDir: string): (active: boolean) => void {
  const stalls = new StallWatch(log.child('stall'));
  const profile = MainProfile.enabled() ? new MainProfile(logsDir, log.child('profile')) : null;
  let awake: number | null = null;
  return (active) => {
    if (active && awake === null) {
      awake = powerSaveBlocker.start('prevent-app-suspension');
      log.info('keeping the computer awake while live');
      stalls.start();
      void profile?.start();
    } else if (!active && awake !== null) {
      powerSaveBlocker.stop(awake);
      awake = null;
      stalls.stop();
      void profile?.stop();
    }
  };
}
