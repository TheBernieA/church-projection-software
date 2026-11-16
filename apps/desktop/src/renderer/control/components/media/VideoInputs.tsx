import { useEffect, useRef } from 'react';
import { Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { useDeviceStream, useInputDevices, type InputDevice } from '../../lib/inputs';
import { attempt, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';

/** One camera: a live preview; click puts it on screen (click again takes it off). */
function InputTile({ device }: { device: InputDevice }) {
  const { t } = useTranslation();
  const stream = useDeviceStream('videoinput', device.deviceId);
  const video = useRef<HTMLVideoElement>(null);
  const live = useStore((s) => s.live?.program.input?.deviceId === device.deviceId);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  const toggle = (): void =>
    void attempt(
      () =>
        cmd('live.setInput', {
          input: live ? null : { deviceId: device.deviceId, label: device.label, fit: 'cover' },
        }),
      'errors.input',
    );
  return (
    <li>
      <Button
        variant="bare"
        aria-label={
          live
            ? t('inputs.takeOff', { name: device.label })
            : t('inputs.show', { name: device.label })
        }
        aria-pressed={live}
        onClick={toggle}
        className="group/tile block w-full text-left focus-visible:outline-none"
      >
        <div
          className={`relative aspect-video w-full overflow-hidden rounded-[6px] bg-black transition-shadow ${
            live
              ? 'shadow-[0_0_0_2px_var(--tally-program)]'
              : 'shadow-[var(--shadow-1)] group-hover/tile:shadow-[var(--shadow-2)]'
          }`}
        >
          <video ref={video} autoPlay muted playsInline className="h-full w-full object-cover" />
          {!stream && (
            <Typography
              as="div"
              tone="muted"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Video size={22} />
            </Typography>
          )}
          {live && (
            <Typography
              size={10}
              weight="bold"
              tone="white"
              caps
              className="absolute bottom-1.5 right-1.5 rounded-[3px] bg-[var(--tally-program)] px-1 py-px"
            >
              {t('mediaBin.live')}
            </Typography>
          )}
        </div>
        <Typography size={12} tone="secondary" truncate className="mt-1.5 block">
          {device.label}
        </Typography>
      </Button>
    </li>
  );
}

/**
 * Video inputs (media bin › Sources): every camera and capture card the computer sees, live.
 * Click one to put it on screen full size, under the slide's words (for camera shots with
 * lyrics); a video or Clear media takes it off.
 */
export function VideoInputs() {
  const { t } = useTranslation();
  const devices = useInputDevices('videoinput');
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--divider)] bg-[var(--surface-1)] px-3">
        <Typography size={12} weight="medium" tone="primary">
          {t('bin.tabs.video-input')}
        </Typography>
        <Typography size={11} tone="muted" className="ml-2">
          {t('inputs.videoHint')}
        </Typography>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {devices && devices.length === 0 ? (
          <EmptyState icon={<Video size={26} />} title={t('inputs.noCameras')} />
        ) : (
          <ul
            className="grid gap-x-3 gap-y-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {(devices ?? []).map((d) => (
              <InputTile key={d.deviceId} device={d} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
