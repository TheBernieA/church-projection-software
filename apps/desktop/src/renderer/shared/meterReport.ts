import type { MeterReport } from '@lampstand/ipc-contract';
import type { MixerLevels } from '@lampstand/renderer';

/** A reading as the report carries it: silence (−∞) as null, the rest kept in range. */
const lu = (v: number): number | null =>
  Number.isFinite(v) ? Math.max(-200, Math.min(20, Math.round(v * 10) / 10)) : null;
const db = (v: number): number => (Number.isFinite(v) ? Math.max(-100, Math.min(0, v)) : -100);

/** A mixer's levels as the meter report the Mixer reads (sent between windows). */
export function meterReport(bus: MeterReport['bus'], l: MixerLevels): MeterReport {
  const dyn: NonNullable<MeterReport['dyn']> = {};
  for (const [id, [comp, duck]] of Object.entries(l.dyn)) dyn[id] = [db(comp), db(duck)];
  return {
    bus,
    channels: l.channels,
    level: l.bus,
    sides: l.sides,
    dyn,
    loudness: l.loudness && {
      momentary: lu(l.loudness.momentary),
      shortTerm: lu(l.loudness.shortTerm),
      integrated: lu(l.loudness.integrated),
    },
    spectrum: l.spectrum,
  };
}
