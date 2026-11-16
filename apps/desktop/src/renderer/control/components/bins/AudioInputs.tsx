import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import {
  useDeviceStream,
  useInputDevices,
  useLevelMeter,
  type InputDevice,
} from '../../lib/inputs';
import { pct, useDraft } from '../../lib/slider';
import { attempt, useStore } from '../../lib/store';

const send = (input: unknown): void =>
  void attempt(() => cmd('live.audioInput', { input }), 'errors.input');

/** One input: its level meter, a switch to put it through the room, and its volume. */
function InputRow({ device }: { device: InputDevice }) {
  const { t } = useTranslation();
  const { track, bar } = useLevelMeter(useDeviceStream('audioinput', device.deviceId));
  const cue = useStore((s) =>
    s.live?.audioInput?.deviceId === device.deviceId ? s.live.audioInput : null,
  );
  const volume = useDraft(cue?.volume, (v) => cue && send({ ...cue, volume: v }));
  const vol = volume.draft ?? cue?.volume ?? 1;
  return (
    <li className="flex flex-col gap-1.5 rounded-[8px] bg-[var(--surface-0)] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex items-center gap-2">
        <Mic size={14} className={cue ? 'text-[var(--tally-program)]' : 'text-[var(--text-3)]'} />
        <Typography size={12} weight="medium" truncate className="min-w-0 flex-1">
          {device.label}
        </Typography>
        <Switch
          label={t('inputs.liveAudio', { name: device.label })}
          checked={!!cue}
          onChange={(on) =>
            send(on ? { deviceId: device.deviceId, label: device.label, volume: 1 } : null)
          }
        />
      </div>
      <div
        ref={track}
        role="meter"
        aria-label={t('inputs.level', { name: device.label })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-1)_12%,transparent)]"
      >
        <div
          ref={bar}
          className="h-full rounded-full bg-[linear-gradient(90deg,#3fb950,#3fb950_70%,#e3b341_85%,#f85149)] transition-[width] duration-75"
          style={{ width: '0%' }}
        />
      </div>
      {cue && (
        <input
          type="range"
          aria-label={t('inputs.volume', { name: device.label })}
          min={0}
          max={1}
          step={0.05}
          value={vol}
          {...volume.props}
          style={pct(vol, 1)}
          className="ls-range w-full"
        />
      )}
    </li>
  );
}

/**
 * Audio inputs (Audio tab): microphones and mixer feeds, each with a level meter. Switch one on
 * to play it through the room (from the main output, or this computer with no output).
 */
export function AudioInputs() {
  const { t } = useTranslation();
  const devices = useInputDevices('audioinput');
  return (
    <section aria-label={t('inputs.audioTitle')} className="flex flex-col gap-1.5 px-2.5 pb-2.5">
      <Typography as="h3" variant="overline" className="px-0.5 pt-1">
        {t('inputs.audioTitle')}
      </Typography>
      {devices && devices.length === 0 ? (
        <Typography as="p" variant="caption" leading="snug" className="px-0.5">
          {t('inputs.noMics')}
        </Typography>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(devices ?? []).map((d) => (
            <InputRow key={d.deviceId} device={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
