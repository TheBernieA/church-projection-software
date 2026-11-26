import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { GripVertical, Link2, MonitorSpeaker, Presentation, Radio, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EMPTY_SCENE, type Scene } from '@lampstand/core';
import { Switch, Typography } from '@lampstand/ui';
import { useCameraSettings, useDeviceStream, type InputDevice } from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { linkStream, routeTo } from '../../lib/switcher';
import { SceneView } from '../SceneView';
import { Select } from '../Select';

type Dest = 'screens' | 'stream';
/** A source on the left: a camera, or none (the slides alone). */
const NONE = 'none';
const DRAG_TYPE = 'application/x-lampstand-camera';

/** Each destination's cable colour. */
const CABLE: Record<Dest, string> = { screens: '#5aa9f0', stream: '#e57fb8' };

interface Cable {
  dest: Dest;
  d: string;
  from: [number, number];
  to: [number, number];
  /** The stream following the screens: drawn dashed. */
  follows: boolean;
}

/** A camera's live picture, small. */
function Thumb({ device }: { device: InputDevice }) {
  const stream = useDeviceStream('videoinput', device.deviceId);
  const video = useRef<HTMLVideoElement>(null);
  const mirror = useCameraSettings(device.deviceId).mirror;
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={video}
      autoPlay
      muted
      playsInline
      className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''}`}
    />
  );
}

/** A source card on the left, dragged onto a destination to send it there. */
function SourceCard({
  id,
  name,
  picture,
  tags,
}: {
  id: string;
  name: string;
  picture: ReactNode;
  tags: { label: string; colour: string }[];
}) {
  const { t } = useTranslation();
  return (
    <li
      data-route-src={id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, id);
        e.dataTransfer.effectAllowed = 'link';
      }}
      title={t('routing.dragHelp')}
      className="group flex cursor-grab items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-3)] active:cursor-grabbing"
    >
      <GripVertical
        size={14}
        className="shrink-0 text-[var(--text-3)] opacity-50 group-hover:opacity-100"
      />
      <div className="relative aspect-video w-[112px] shrink-0 overflow-hidden rounded-[5px] bg-black">
        {picture}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Typography size={12} weight="semibold" tone="primary" truncate>
          {name}
        </Typography>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Typography
              key={tag.label}
              size={10}
              weight="bold"
              tone="white"
              caps
              className="rounded-[3px] px-1.5 py-px"
              style={{ background: tag.colour }}
            >
              {tag.label}
            </Typography>
          ))}
        </div>
      </div>
    </li>
  );
}

/** A destination on the right: what it shows now, its source, and where to drop a camera. */
function DestCard({
  dest,
  icon,
  title,
  help,
  scene,
  source,
  options,
  onPick,
  children,
}: {
  dest: Dest;
  icon: ReactNode;
  title: string;
  help: string;
  scene: Scene;
  source: string;
  options: { value: string; label: string }[];
  onPick: (id: string) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const accept = (e: DragEvent): boolean => e.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <section
      data-route-dest={dest}
      aria-label={title}
      onDragOver={(e) => {
        if (!accept(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'link';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) onPick(id);
      }}
      className="flex flex-col gap-3 rounded-[var(--radius-xl)] bg-[var(--surface-2)] p-3 transition-shadow"
      style={{
        boxShadow: over
          ? `0 0 0 2px ${CABLE[dest]}, 0 10px 30px rgba(0,0,0,0.45)`
          : `inset 3px 0 0 ${CABLE[dest]}, var(--shadow-1)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 items-center justify-center rounded-[var(--radius-md)]"
          style={{ background: `${CABLE[dest]}26`, color: CABLE[dest] }}
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col">
          <Typography size={13} weight="semibold" tone="primary">
            {title}
          </Typography>
          <Typography size={11} tone="muted" truncate>
            {help}
          </Typography>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[6px] bg-black shadow-[0_0_0_2px_var(--tally-program)]">
        <SceneView
          scene={scene}
          label={`${title}: ${options.find((o) => o.value === source)?.label ?? ''}`}
        />
        {over && (
          <Typography
            as="div"
            size={12}
            weight="semibold"
            tone="white"
            className="absolute inset-0 flex items-center justify-center bg-black/55"
          >
            {t('routing.dropHere', { name: title })}
          </Typography>
        )}
      </div>
      <Select<string>
        size="sm"
        aria-label={t('routing.sourceOf', { name: title })}
        value={source}
        onChange={onPick}
        options={options}
      />
      {children}
    </section>
  );
}

/**
 * Routing (Cameras › Routing): where each camera goes, as a picture. Sources on the left (the
 * cameras, and the slides alone), destinations on the right (the screens, and the livestream with
 * its recording and NDI feeds), and a cable from each destination's source. Drag a camera onto a
 * destination to send it there (with the Auto transition), or pick from its list. The stream
 * follows the screens (a dashed cable) until it's given a camera of its own.
 */
export function RoutingView({ devices }: { devices: InputDevice[] }) {
  const { t } = useTranslation();
  const screensInput = useStore((s) => s.live?.program.input ?? null);
  const pip = useStore((s) => s.live?.program.pip ?? null);
  const own = useStore((s) => s.live?.streamCut ?? null);
  const box = useRef<HTMLDivElement>(null);
  const [cables, setCables] = useState<Cable[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const screensSrc = screensInput?.deviceId ?? NONE;
  const streamSrc = own ? (own.input?.deviceId ?? NONE) : screensSrc;
  const follows = !own;
  const known = (id: string): string =>
    id === NONE || devices.some((d) => d.deviceId === id) ? id : NONE;

  // Cables follow the cards: measured after each layout and whenever the area changes size.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (): void => {
      const b = el.getBoundingClientRect();
      setSize({ w: b.width, h: b.height });
      const next: Cable[] = [];
      for (const [dest, src] of [
        ['screens', known(screensSrc)],
        ['stream', known(streamSrc)],
      ] as const) {
        const a = el
          .querySelector(`[data-route-src="${CSS.escape(src)}"]`)
          ?.getBoundingClientRect();
        const z = el.querySelector(`[data-route-dest="${dest}"]`)?.getBoundingClientRect();
        if (!a || !z) continue;
        const from: [number, number] = [a.right - b.left, a.top + a.height / 2 - b.top];
        const to: [number, number] = [z.left - b.left, z.top + Math.min(z.height / 2, 48) - b.top];
        // The two cables to one source leave it a little apart.
        if (dest === 'stream' && known(screensSrc) === known(streamSrc)) from[1] += 8;
        const dx = Math.max(40, (to[0] - from[0]) * 0.5);
        next.push({
          dest,
          from,
          to,
          follows: dest === 'stream' && follows,
          d: `M${from[0]},${from[1]} C${from[0] + dx},${from[1]} ${to[0] - dx},${to[1]} ${to[0]},${to[1]}`,
        });
      }
      setCables(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const list = el.querySelector('ul');
    list?.addEventListener('scroll', measure);
    return () => {
      ro.disconnect();
      list?.removeEventListener('scroll', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screensSrc, streamSrc, follows, devices]);

  const device = (id: string): InputDevice | null => devices.find((d) => d.deviceId === id) ?? null;
  const pick = (dest: Dest) => (id: string) => void routeTo(device(id), dest);
  const options = [
    { value: NONE, label: t('routing.slidesOnly') },
    ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
  ];
  const tagsFor = (id: string): { label: string; colour: string }[] => [
    ...(known(screensSrc) === id ? [{ label: t('switcher.screens'), colour: CABLE.screens }] : []),
    ...(known(streamSrc) === id ? [{ label: t('switcher.stream'), colour: CABLE.stream }] : []),
  ];
  return (
    <div ref={box} className="relative flex min-h-0 flex-1 gap-6 overflow-hidden p-5">
      <div className="flex w-[340px] shrink-0 flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <Typography size={11} weight="bold" tone="muted" caps>
            {t('routing.sources')}
          </Typography>
          <Typography size={11} tone="muted">
            {t('routing.dragHint')}
          </Typography>
        </div>
        <ul
          aria-label={t('routing.sources')}
          className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1"
        >
          <SourceCard
            id={NONE}
            name={t('routing.slidesOnly')}
            picture={
              <Typography as="div" tone="muted" className="flex h-full items-center justify-center">
                <Presentation size={20} />
              </Typography>
            }
            tags={tagsFor(NONE)}
          />
          {devices.map((d) => (
            <SourceCard
              key={d.deviceId}
              id={d.deviceId}
              name={d.label}
              picture={<Thumb device={d} />}
              tags={tagsFor(d.deviceId)}
            />
          ))}
        </ul>
      </div>

      {/* The cables, under the cards' edges. */}
      <svg
        aria-hidden
        width={size.w}
        height={size.h}
        className="pointer-events-none absolute inset-0"
      >
        {cables.map((c) => (
          <g key={c.dest}>
            <path d={c.d} fill="none" stroke={CABLE[c.dest]} strokeOpacity={0.18} strokeWidth={8} />
            <path
              d={c.d}
              fill="none"
              stroke={CABLE[c.dest]}
              strokeWidth={2.25}
              strokeDasharray={c.follows ? '6 5' : undefined}
            />
            <circle cx={c.from[0]} cy={c.from[1]} r={4} fill={CABLE[c.dest]} />
            <circle cx={c.to[0]} cy={c.to[1]} r={4} fill={CABLE[c.dest]} />
          </g>
        ))}
      </svg>

      <span className="min-w-[80px] flex-1" />

      <div className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
        <Typography size={11} weight="bold" tone="muted" caps>
          {t('routing.destinations')}
        </Typography>
        <DestCard
          dest="screens"
          icon={<MonitorSpeaker size={15} />}
          title={t('routing.screens')}
          help={t('routing.screensHelp')}
          scene={{ ...EMPTY_SCENE, input: screensInput, pip }}
          source={known(screensSrc)}
          options={options}
          onPick={pick('screens')}
        />
        <DestCard
          dest="stream"
          icon={<Radio size={15} />}
          title={t('routing.stream')}
          help={t('routing.streamHelp')}
          scene={{ ...EMPTY_SCENE, input: own ? own.input : screensInput, pip }}
          source={known(streamSrc)}
          options={options}
          onPick={pick('stream')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Link2 size={13} className="shrink-0 text-[var(--text-3)]" />
              <Typography size={11} tone="secondary" leading="snug">
                {follows ? t('routing.follows') : t('routing.own')}
              </Typography>
            </div>
            <Switch
              label={t('routing.followSwitch')}
              checked={follows}
              disabled={follows}
              onChange={(on) => on && void linkStream()}
            />
          </div>
        </DestCard>
        {devices.length === 0 && (
          <Typography size={12} tone="muted" className="flex items-center gap-2">
            <Video size={14} />
            {t('inputs.noCameras')}
          </Typography>
        )}
      </div>
    </div>
  );
}
