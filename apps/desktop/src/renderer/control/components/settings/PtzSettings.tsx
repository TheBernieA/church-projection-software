import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PtzConnectionSchema, type CameraSettings, type PtzPosition } from '@lampstand/core';
import { Button, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { setCameraSettings } from '../../lib/inputs';
import { DeferredInput } from '../DeferredControls';
import { Select } from '../Select';

type Protocol = 'none' | 'visca-udp' | 'visca-tcp';
const PORTS = { 'visca-udp': 52381, 'visca-tcp': 5678 } as const;

/**
 * A camera's remote control (Settings › Video): a PTZ camera's network address, so camera mode
 * moves it on its motors (VISCA over IP for Sony, BirdDog and newer PTZOptics; VISCA over TCP
 * for PTZOptics and most budget cameras). Test asks it where it points.
 */
export function PtzSettings({
  deviceId,
  settings,
}: {
  deviceId: string;
  settings: CameraSettings;
}) {
  const { t } = useTranslation();
  const ptz = settings.ptz;
  const [test, setTest] = useState<'idle' | 'asking' | 'ok' | 'none'>('idle');
  const save = (next: CameraSettings['ptz']): void => {
    setTest('idle');
    setCameraSettings(deviceId, { ptz: next });
  };
  const setProtocol = (p: Protocol): void => {
    if (p === 'none') return save(null);
    save({ protocol: p, host: ptz?.host ?? '', port: PORTS[p] });
  };
  const valid = ptz ? PtzConnectionSchema.safeParse(ptz).success : false;
  return (
    <div className="flex flex-col gap-2">
      <div className="w-56">
        <Select<Protocol>
          size="sm"
          aria-label={t('camera.ptzProtocol')}
          value={ptz?.protocol ?? 'none'}
          onChange={setProtocol}
          options={(['none', 'visca-udp', 'visca-tcp'] as const).map((p) => ({
            value: p,
            label: t(`camera.protocols.${p}`),
          }))}
        />
      </div>
      {ptz && (
        <div className="flex items-center gap-2">
          <DeferredInput
            aria-label={t('camera.ptzHost')}
            placeholder="192.168.1.40"
            value={ptz.host}
            maxLength={253}
            onCommit={(host) => setCameraSettings(deviceId, { ptz: { ...ptz, host: host.trim() } })}
            className="field !h-8 w-44"
          />
          <DeferredInput
            aria-label={t('camera.ptzPort')}
            value={String(ptz.port)}
            maxLength={5}
            onCommit={(v) => {
              const port = Number(v);
              if (Number.isInteger(port) && port > 0 && port < 65_536)
                setCameraSettings(deviceId, { ptz: { ...ptz, port } });
            }}
            className="field !h-8 w-20"
          />
          <Button
            size="xs"
            variant="secondary"
            disabled={!valid || test === 'asking'}
            onClick={() => {
              setTest('asking');
              void cmd('camera.ptz', { action: 'position', deviceId }).then(
                (p) => setTest((p as PtzPosition | null) ? 'ok' : 'none'),
                () => setTest('none'),
              );
            }}
          >
            {t('camera.test')}
          </Button>
        </div>
      )}
      {ptz && !ptz.host && (
        <Typography size={11} tone="muted">
          {t('camera.ptzHostHelp')}
        </Typography>
      )}
      {test !== 'idle' && test !== 'asking' && (
        <Typography size={11} tone={test === 'ok' ? 'secondary' : 'muted'} leading="snug">
          {t(test === 'ok' ? 'camera.testOk' : 'camera.testNone')}
        </Typography>
      )}
    </div>
  );
}
