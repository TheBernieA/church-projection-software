import { useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  Ellipsis,
  FlipHorizontal2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings2,
  Video,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Typography } from '@lampstand/ui';
import {
  rescanDevices,
  useCameraSettingsVersion,
  CAMERA_FITS,
  CAMERA_RESOLUTIONS,
  DEFAULT_CAMERA,
  showCamera,
  updateCamera,
  useCameraSettings,
  useDeviceStream,
  useInputDevices,
  type CameraSettings,
  type InputDevice,
} from '../../lib/inputs';
import { openDialog, useStore } from '../../lib/store';
import { CameraAccess } from './CameraAccess';
import { CameraSwitcher } from './CameraSwitcher';
import { SwitcherBar } from './SwitcherBar';
import { clickSource, take } from '../../lib/switcher';
import { EmptyState } from '../EmptyState';
import { REVEAL } from '../cards';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';

/** A radio group in the camera menu (Fill/Fit, resolution). */
function RadioSection<T extends string>({
  label,
  value,
  options,
  name,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  name: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <>
      <DropdownMenu.Label className={MENU_LABEL_CLASS}>{label}</DropdownMenu.Label>
      <DropdownMenu.RadioGroup
        value={value}
        onValueChange={(v) => {
          const picked = options.find((o) => o === v);
          if (picked) onChange(picked);
        }}
      >
        {options.map((o) => (
          <DropdownMenu.RadioItem
            key={o}
            value={o}
            className={ITEM_CLASS}
            // Keep the menu open to try another.
            onSelect={(e) => e.preventDefault()}
          >
            <Typography className="flex w-3.5 justify-center">
              <DropdownMenu.ItemIndicator>
                <Check size={14} />
              </DropdownMenu.ItemIndicator>
            </Typography>
            {name(o)}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}

/** A camera's "…" menu: rename, Fill or Fit, mirror, capture size, reset. */
function CameraMenu({
  device,
  settings,
  onChange,
  onRename,
}: {
  device: InputDevice;
  settings: CameraSettings;
  onChange: (patch: Partial<CameraSettings>) => void;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const name = settings.name || device.label;
  const custom = JSON.stringify(settings) !== JSON.stringify(DEFAULT_CAMERA);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="2xs"
          variant="secondary"
          aria-label={t('inputs.settings', { name })}
          title={t('inputs.settings', { name })}
          className={`absolute right-1.5 top-1.5 z-[1] !rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-black/80 data-[state=open]:opacity-100 ${REVEAL}`}
        >
          <Ellipsis size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{name}</DropdownMenu.Label>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => setTimeout(onRename, 0)}>
            <Pencil size={14} />
            {t('inputs.rename')}
          </DropdownMenu.Item>
          <DropdownMenu.CheckboxItem
            className={ITEM_CLASS}
            checked={settings.mirror}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(mirror) => onChange({ mirror })}
          >
            <FlipHorizontal2 size={14} />
            <Typography className="flex-1">{t('inputs.mirror')}</Typography>
            <DropdownMenu.ItemIndicator>
              <Check size={14} />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <RadioSection
            label={t('inputs.fitLabel')}
            value={settings.fit}
            options={CAMERA_FITS}
            name={(f) => t(`inputs.fit.${f}`)}
            onChange={(fit) => onChange({ fit })}
          />
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <RadioSection
            label={t('inputs.resolutionLabel')}
            value={settings.resolution}
            options={CAMERA_RESOLUTIONS}
            name={(r) => t(`inputs.resolution.${r}`)}
            onChange={(resolution) => onChange({ resolution })}
          />
          {custom && (
            <>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
              <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => onChange(DEFAULT_CAMERA)}>
                <RotateCcw size={14} />
                {t('inputs.reset')}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * One camera: a live preview drawn the way it will go on screen (fill or fit, mirrored);
 * click puts it on screen (click again takes it off). Its "…" holds its settings, which apply
 * straight away when it's live.
 */
function InputTile({ device, n }: { device: InputDevice; n: number }) {
  const { t } = useTranslation();
  const stream = useDeviceStream('videoinput', device.deviceId);
  const video = useRef<HTMLVideoElement>(null);
  const settings = useCameraSettings(device.deviceId);
  const [renaming, setRenaming] = useState(false);
  const live = useStore((s) => s.live?.program.input?.deviceId === device.deviceId);
  const onPreview = useStore((s) => s.live?.switcher.preview?.deviceId === device.deviceId);
  const inPip = useStore((s) => s.live?.program.pip?.deviceId === device.deviceId);
  const previewFirst = useStore((s) => s.settings?.switcher.click !== 'program');
  const name = settings.name || device.label;
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  const change = (patch: Partial<CameraSettings>): void => updateCamera(device, patch);
  return (
    <li className="group relative">
      <Button
        variant="bare"
        aria-label={
          previewFirst
            ? t('switcher.toPreview', { name, n })
            : live
              ? t('inputs.takeOff', { name })
              : t('inputs.show', { name })
        }
        aria-pressed={previewFirst ? onPreview : live}
        onClick={() =>
          void (previewFirst ? clickSource(device) : live ? showCamera(null) : clickSource(device))
        }
        onDoubleClick={() => previewFirst && void take(device)}
        className="group/tile block w-full text-left focus-visible:outline-none"
      >
        <div
          className={`relative aspect-video w-full overflow-hidden rounded-[6px] bg-black transition-shadow duration-100 ${
            live
              ? 'shadow-[0_0_0_3px_var(--tally-program)]'
              : onPreview
                ? 'shadow-[0_0_0_3px_var(--tally-preview)]'
                : 'shadow-[0_0_0_1px_var(--hairline)] group-hover/tile:shadow-[0_0_0_2px_color-mix(in_srgb,var(--text-1)_55%,transparent)] group-focus-visible/tile:shadow-[0_0_0_2px_var(--accent)]'
          }`}
        >
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={`h-full w-full ${settings.fit === 'contain' ? 'object-contain' : 'object-cover'} ${settings.mirror ? '-scale-x-100' : ''}`}
          />
          {!stream && (
            <Typography
              as="div"
              tone="muted"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Video size={22} />
            </Typography>
          )}
          {/* What's set, at a glance. */}
          <span className="absolute bottom-1.5 left-1.5 flex gap-1">
            {[
              settings.fit === 'contain' ? t('inputs.fitTag') : null,
              settings.mirror ? t('inputs.mirrored') : null,
              settings.resolution !== 'auto' ? t(`inputs.resolution.${settings.resolution}`) : null,
            ]
              .filter(Boolean)
              .map((tag) => (
                <Typography
                  key={tag}
                  size={10}
                  weight="semibold"
                  tone="white"
                  className="rounded-[3px] bg-black/60 px-1 py-px backdrop-blur-sm"
                >
                  {tag}
                </Typography>
              ))}
          </span>
          <Typography
            size={11}
            weight="bold"
            tone="white"
            tabular
            className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-black/65 px-1"
          >
            {n}
          </Typography>
          {(live || onPreview || inPip) && (
            <Typography
              size={10}
              weight="bold"
              tone="white"
              caps
              className={`absolute bottom-1.5 right-1.5 rounded-[3px] px-1 py-px ${live ? 'bg-[var(--tally-program)]' : onPreview ? 'bg-[var(--tally-preview)]' : 'bg-black/70'}`}
            >
              {live ? t('mediaBin.live') : onPreview ? t('switcher.preview') : t('switcher.pip')}
            </Typography>
          )}
        </div>
        {!renaming && (
          <Typography size={12} tone="secondary" truncate className="mt-1.5 block">
            {name}
          </Typography>
        )}
      </Button>
      {renaming && (
        <input
          autoFocus
          aria-label={t('inputs.renameField', { name: device.label })}
          defaultValue={name}
          maxLength={200}
          placeholder={device.label}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            setRenaming(false);
            const next = e.currentTarget.value.trim();
            // Blank goes back to the device's own name.
            if (next !== settings.name && !(next === device.label && !settings.name))
              change({ name: next === device.label ? '' : next });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.preventDefault();
              e.currentTarget.value = name;
              e.currentTarget.blur();
            }
          }}
          className="field mt-1 !h-6 w-full !px-1.5"
        />
      )}
      <CameraMenu
        device={device}
        settings={settings}
        onChange={change}
        onRename={() => setRenaming(true)}
      />
    </li>
  );
}

/**
 * Video inputs (media bin › Sources): every camera and capture card the computer sees, live.
 * Click one to put it on screen full size, under the slide's words (for camera shots with
 * lyrics); a video or Clear media takes it off. Each camera's "…" sets how it shows.
 */
export function VideoInputs() {
  const { t } = useTranslation();
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  // Cameras switched off in Settings › Video stay out of the way here.
  const devices = all?.filter((d) => !saved[d.deviceId]?.hidden) ?? null;
  const hiddenCount = (all?.length ?? 0) - (devices?.length ?? 0);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--divider)] bg-[var(--surface-1)] px-3">
        <Typography size={13} weight="semibold" tone="primary" className="shrink-0">
          {t('bin.tabs.video-input')}
        </Typography>
        {devices && (
          <Typography
            size={11}
            tone="muted"
            tabular
            className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-px"
          >
            {devices.length}
          </Typography>
        )}
        <Typography size={11} tone="muted" truncate className="ml-1 min-w-0 flex-1">
          {t('inputs.videoHint')}
        </Typography>
        <CameraSwitcher className="w-56 shrink-0" />
        <Button
          size="xs"
          variant="ghost"
          icon={<RefreshCw size={13} />}
          onClick={rescanDevices}
          className="shrink-0"
        >
          {t('inputs.lookAgain')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<Settings2 size={13} />}
          onClick={() => openDialog('settings', { settingsPage: 'video' })}
          className="shrink-0"
        >
          {hiddenCount ? t('inputs.manageHidden', { count: hiddenCount }) : t('inputs.manage')}
        </Button>
      </div>
      {devices && devices.length > 0 && <SwitcherBar devices={devices} />}
      <CameraAccess className="mx-4 mt-3" />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {devices && devices.length === 0 ? (
          <EmptyState
            icon={<Video size={26} />}
            title={hiddenCount ? t('inputs.allHidden') : t('inputs.noCameras')}
          />
        ) : (
          <ul
            className="grid gap-x-3 gap-y-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {(devices ?? []).map((d, i) => (
              <InputTile key={d.deviceId} device={d} n={i + 1} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
