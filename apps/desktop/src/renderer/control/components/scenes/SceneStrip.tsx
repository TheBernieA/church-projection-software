import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EMPTY_SCENE, type Scene, type StreamSettings } from '@lampstand/core';
import { Button, Segmented, Typography } from '@lampstand/ui';
import { useCameraSettingsVersion, useDeviceStream, useInputDevices } from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { SCENE_GROUPS, type SceneTemplate } from '../../lib/streamOptions';
import { SceneView } from '../SceneView';
import { Select } from '../Select';
import { usePref } from '../../lib/prefs';

/**
 * Scenes, as small live previews (real cameras, the real slide), one click each: the same strip
 * for the stream (Live console) and for the screens (under the output monitor).
 */

type Picture = StreamSettings['picture'];

/** One look a scene gives, ready to click (camera scenes name their cameras). */
export interface SceneChoice {
  key: string;
  label: string;
  /** A camera's scene, captioned by the camera (and on a second line, what it adds, if it varies). */
  caption?: { camera: string; kind?: string };
  /** Leaves the words as they are (see SceneTemplate.keepsWords). */
  keepsWords?: boolean;
  group: SceneTemplate['group'];
  patch: Pick<Picture, 'background' | 'words' | 'mirror'> &
    Partial<Pick<Picture, 'layout' | 'camera' | 'secondCamera'>>;
}

export interface Camera {
  id: string;
  name: string;
}

/** The cameras on this computer, by their saved names (hidden ones left out). */
export function useCameras(): Camera[] {
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  return useMemo(
    () =>
      (all ?? [])
        .filter((d) => !saved[d.deviceId]?.hidden)
        .map((d) => ({ id: d.deviceId, name: saved[d.deviceId]?.name || d.label })),
    [all, saved],
  );
}

/** A layout's two cameras: the ones wanted, else the first two there are. */
export function cameraPair(
  cameras: Camera[],
  first: string | null | undefined,
  second: string | null | undefined,
): readonly [string, string] | null {
  const a = first && cameras.some((c) => c.id === first) ? first : cameras[0]?.id;
  const b =
    second && second !== a && cameras.some((c) => c.id === second)
      ? second
      : cameras.find((c) => c.id !== a)?.id;
  return a && b ? ([a, b] as const) : null;
}

/**
 * The scenes for a list of templates: camera ones once per camera, two-camera layouts with the
 * pair (left out with fewer than two cameras). Labels are i18n keys under `prefix`.
 */
export function sceneChoices(
  templates: readonly SceneTemplate[],
  cameras: Camera[],
  pair: readonly [string, string] | null,
  label: (id: string, name?: string) => string,
): SceneChoice[] {
  const all = templates.flatMap((s): SceneChoice[] => {
    const base = {
      group: s.group,
      patch: { background: s.background, words: s.words, mirror: s.mirror ?? ('own' as const) },
    };
    if (s.perCamera)
      return cameras.map((c) => ({
        ...base,
        key: `${s.id}:${c.id}`,
        label: label(`${s.id}Of`, c.name),
        caption: { camera: c.name, ...(s.keepsWords ? {} : { kind: label(`${s.id}Kind`) }) },
        ...(s.keepsWords ? { keepsWords: true } : {}),
        patch: { ...base.patch, camera: c.id },
      }));
    if (s.twoCameras)
      return pair
        ? [
            {
              ...base,
              key: s.id,
              label: label(s.id),
              patch: { ...base.patch, layout: s.layout, camera: pair[0], secondCamera: pair[1] },
            },
          ]
        : [];
    return [{ ...base, key: s.id, label: label(s.id) }];
  });
  // Each camera's scenes side by side (A + slide, A + words, then B…), not A, B, A, B.
  const camOrder = (c: SceneChoice): number =>
    c.caption ? cameras.findIndex((x) => x.id === c.patch.camera) : -1;
  return all
    .map((c, i) => ({ c, i }))
    .sort((x, y) => {
      const a = camOrder(x.c);
      const b = camOrder(y.c);
      return a >= 0 && b >= 0 && x.c.group === y.c.group ? a - b || x.i - y.i : x.i - y.i;
    })
    .map((x) => x.c);
}

/** A camera's live picture, small (the tile shows the very camera it would switch to). */
export function CameraThumb({
  deviceId,
  className = '',
}: {
  deviceId: string;
  className?: string;
}) {
  const stream = useDeviceStream('videoinput', deviceId);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={video}
      autoPlay
      muted
      playsInline
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

/** The lower-third band, sketched over a tile's picture. */
const BandSketch = () => (
  <span
    aria-hidden
    className="absolute inset-x-[8%] bottom-[9%] flex h-[24%] flex-col justify-center gap-[3px] rounded-[2px] bg-black/60 px-[8%]"
  >
    <span className="h-[3px] w-full rounded-full bg-white/85" />
    <span className="h-[3px] w-2/3 self-center rounded-full bg-white/70" />
  </span>
);

/** A word on a tile with no picture of its own (the stage display, the switcher with nothing up). */
const TileWord = ({ children }: { children: string }) => (
  <Typography
    as="span"
    size={10}
    weight="semibold"
    tone="white"
    className="absolute inset-0 flex items-center justify-center opacity-70"
  >
    {children}
  </Typography>
);

/** What a scene would show, small: real cameras, the real slide. */
function ScenePicture({
  c,
  program,
  behind,
  wordsAlone,
}: {
  c: SceneChoice;
  program: Scene | null;
  behind: Scene | null;
  wordsAlone: Scene | null;
}) {
  const { t } = useTranslation();
  const p = c.patch;
  if (p.mirror === 'stage') return <TileWord>{t('console.scenes.stageTile')}</TileWord>;
  if (p.mirror === 'alternate')
    return (
      <>
        {program && <SceneView mode="thumbnail" scene={program} />}
        <Typography
          as="span"
          size={10}
          weight="semibold"
          tone="white"
          className="absolute right-1 top-1 rounded-[3px] bg-black/60 px-1"
        >
          HDMI
        </Typography>
      </>
    );
  const switcherCam = program?.input?.deviceId;
  const onCamera = p.background === 'camera' || p.background === 'layout';
  const picture =
    p.background === 'layout' && p.camera && p.secondCamera ? (
      p.layout === 'pip' ? (
        <>
          <CameraThumb deviceId={p.camera} />
          <span className="absolute right-[4%] top-[6%] h-[32%] w-[32%] overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(255,255,255,0.4)]">
            <CameraThumb deviceId={p.secondCamera} />
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex">
          <span className="h-full w-1/2 overflow-hidden">
            <CameraThumb deviceId={p.camera} />
          </span>
          <span className="h-full w-1/2 overflow-hidden">
            <CameraThumb deviceId={p.secondCamera} />
          </span>
        </span>
      )
    ) : p.background === 'camera' && p.camera ? (
      <CameraThumb deviceId={p.camera} />
    ) : p.background === 'switcher' ? (
      switcherCam ? (
        <CameraThumb deviceId={switcherCam} />
      ) : (
        <TileWord>{t('console.scenes.switcherTile')}</TileWord>
      )
    ) : p.background === 'program' && program && behind ? (
      <SceneView mode="thumbnail" scene={p.words === 'full' ? program : behind} />
    ) : p.words === 'full' && wordsAlone ? (
      <SceneView mode="thumbnail" scene={wordsAlone} />
    ) : null;
  return (
    <>
      {picture}
      {/* Full-screen words over a camera: the real slide on top. */}
      {onCamera && p.words === 'full' && wordsAlone && (
        <span className="absolute inset-0">
          <SceneView mode="thumbnail" scene={wordsAlone} transparent />
        </span>
      )}
      {p.words === 'lowerThird' && <BandSketch />}
    </>
  );
}

/**
 * The strip: a header that folds it, the kinds of scene as tabs, then one row of tiles (four
 * across; more scroll sideways). With a two-camera scene on air, `pair` offers which camera goes
 * where.
 */
export function SceneStrip({
  prefKey,
  label,
  choices,
  isOn,
  onPick,
  onAir,
  pair,
  trailing,
}: {
  /** Remembers whether the strip is open. */
  prefKey: string;
  /** What the strip switches (for screen readers). */
  label: string;
  choices: SceneChoice[];
  isOn: (c: SceneChoice) => boolean;
  onPick: (c: SceneChoice) => void;
  /** The scene is going out now (red tally), not just chosen. */
  onAir: boolean;
  /** Controls at the end of the header row (the screen masks). */
  trailing?: ReactNode;
  /** A two-camera scene is on: camera A and B pickers. */
  pair?: {
    cameras: Camera[];
    value: readonly [string, string];
    onChange: (camera: string, secondCamera: string) => void;
  } | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = usePref(prefKey, true);
  const program = useStore((s) => s.live?.program ?? null);
  // The screens' picture without its words, and its words alone (for the tiles to compose).
  const behind = useMemo<Scene | null>(
    () =>
      program ? { ...EMPTY_SCENE, background: program.background, media: program.media } : null,
    [program],
  );
  const wordsAlone = useMemo<Scene | null>(
    () => (program ? { ...EMPTY_SCENE, content: program.content } : null),
    [program],
  );
  const current = choices.find(isOn);
  // Opens on the kind with the scene that's on.
  const [tab, setTab] = useState<SceneTemplate['group']>(() => current?.group ?? 'slides');
  const shown = choices.filter((c) => c.group === tab);
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="bare"
          aria-expanded={open}
          aria-label={open ? t('console.scenesHide') : t('console.scenesShow')}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <ChevronRight
            size={14}
            className={`shrink-0 text-[var(--text-3)] transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <Typography as="span" variant="overline">
            {t('console.scenesTitle')}
          </Typography>
          <Typography size={12} tone="secondary" truncate className="min-w-0 flex-1 text-right">
            {current?.label ?? t('console.scenesCustom')}
          </Typography>
        </Button>
        {trailing}
      </div>
      {open && (
        <>
          <Segmented<SceneTemplate['group']>
            label={t('console.sceneTabs')}
            value={tab}
            onChange={setTab}
            options={SCENE_GROUPS.filter((g) => choices.some((c) => c.group === g)).map((g) => ({
              value: g,
              label: t(`console.sceneGroups.${g}`),
            }))}
          />
          <div
            // One row of whole tiles, four across: more scroll sideways, so none is ever cut off.
            className="grid auto-cols-[max(84px,calc((100%_-_24px)/4))] grid-flow-col gap-2 overflow-x-auto overflow-y-hidden p-0.5 pb-1"
          >
            {shown.map((c) => {
              const on = isOn(c);
              return (
                <Button
                  key={c.key}
                  variant="bare"
                  data-scene={c.key}
                  aria-pressed={on}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => onPick(c)}
                  className="group/scene flex min-w-0 cursor-pointer flex-col gap-1 text-left"
                >
                  <span
                    className={`relative block aspect-video w-full overflow-hidden rounded-[5px] bg-black transition-shadow ${
                      on
                        ? onAir
                          ? 'shadow-[0_0_0_2px_var(--tally-program)]'
                          : 'shadow-[0_0_0_2px_var(--accent)]'
                        : 'shadow-[0_0_0_1px_var(--hairline-strong)] group-hover/scene:shadow-[0_0_0_1px_var(--text-3)]'
                    }`}
                  >
                    <ScenePicture c={c} program={program} behind={behind} wordsAlone={wordsAlone} />
                  </span>
                  <Typography
                    size={11}
                    tone={on ? 'primary' : 'secondary'}
                    weight={on ? 'semibold' : 'regular'}
                    truncate
                    className="block"
                  >
                    {c.caption?.camera ?? c.label}
                  </Typography>
                  {c.caption?.kind && (
                    // What sets this camera's scenes apart, never cut off by a long camera name.
                    <Typography size={10} tone="muted" truncate className="-mt-1 block">
                      {c.caption.kind}
                    </Typography>
                  )}
                </Button>
              );
            })}
          </div>
          {tab === 'cameras' && pair && (
            <PairPicker cameras={pair.cameras} value={pair.value} onChange={pair.onChange} />
          )}
        </>
      )}
    </div>
  );
}

/** Which camera goes where in a two-camera scene (picking the other one's camera swaps them). */
function PairPicker({
  cameras,
  value,
  onChange,
}: {
  cameras: Camera[];
  value: readonly [string, string];
  onChange: (camera: string, secondCamera: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          { first: true, mine: value[0], other: value[1] },
          { first: false, mine: value[1], other: value[0] },
        ] as const
      ).map(({ first, mine, other }) => (
        <Select<string>
          key={String(first)}
          size="sm"
          aria-label={first ? t('streaming.cameraA') : t('streaming.cameraB')}
          value={mine}
          onChange={(id) => {
            const rest = id === other ? mine : other;
            const [camera, secondCamera] = first ? [id, rest] : [rest, id];
            onChange(camera, secondCamera);
          }}
          options={cameras.map((c) => ({ value: c.id, label: c.name }))}
        />
      ))}
    </div>
  );
}
