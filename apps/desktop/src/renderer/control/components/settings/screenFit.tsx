import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Grid3x3, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  adjustedCorners,
  isPlainAdjust,
  screenFilterCss,
  ScreenAdjustSchema,
  type CornerOffset,
  type EdgeBlend,
  type ScreenAdjust,
  type Settings,
} from '@lampstand/core';
import { Button, IconButton, Segmented, Switch, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { useStore } from '../../lib/store';
import { EMPTY_LIST } from '../../constants';
import { Select } from '../Select';
import { CommitSlider, Group, Notice, Row } from './parts';

type Update = (patch: Partial<Settings>) => void;
type CornerId = keyof ScreenAdjust['corners'];

const PLAIN: ScreenAdjust = ScreenAdjustSchema.parse({});
const CORNERS: CornerId[] = ['tl', 'tr', 'br', 'bl'];
const BLEND_WINDOW = 'window-blend-';

/** A screen that can be fitted: by display fingerprint, or a rehearsal window's id. */
interface FitTarget {
  key: string;
  label: string;
  /** Its output window, for the test pattern. */
  outputId: string;
}

/** The screens there are to fit: audience, alternate and stage displays, or rehearsal windows. */
function useFitTargets(s: Settings): FitTarget[] {
  const { t } = useTranslation();
  const displays = useStore((x) => x.displays);
  if (s.windowMode) {
    const blendWindows = s.edgeBlend.enabled ? s.edgeBlend.windows - 1 : 0;
    return [
      { key: 'window-main', label: t('screenFit.rehearsal'), outputId: 'window-main' },
      ...Array.from({ length: blendWindows }, (_, i) => ({
        key: `${BLEND_WINDOW}${i + 1}`,
        label: t('screenFit.rehearsalN', { n: i + 2 }),
        outputId: `${BLEND_WINDOW}${i + 1}`,
      })),
    ];
  }
  return displays
    .filter((d) => d.role !== 'none')
    .map((d) => ({
      key: d.fingerprint,
      label: `${d.label} · ${t(`outputs.roleShort.${d.role}`)}`,
      outputId: `display-${d.id}`,
    }));
}

const clampPct = (n: number): number => Math.max(-50, Math.min(50, Math.round(n * 10) / 10));

/**
 * The corner-pinning pad: the screen's shape, with its four corners to drag (or nudge with the
 * arrow keys, Shift for bigger steps) to where the projector really lands. Saves when let go.
 */
function CornerPad({
  adjust,
  onCommit,
}: {
  adjust: ScreenAdjust;
  onCommit: (corners: ScreenAdjust['corners']) => void;
}) {
  const { t } = useTranslation();
  const pad = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ScreenAdjust['corners'] | null>(null);
  const drag = useRef<{ id: CornerId; x: number; y: number; from: CornerOffset } | null>(null);
  const corners = draft ?? adjust.corners;
  const W = 320;
  const H = 180;
  // The outline drawn at the pad's size, with the screen's other adjustments too.
  const shape = adjustedCorners({ ...adjust, corners, flipH: false, flipV: false }, W, H);
  const move = (id: CornerId, c: CornerOffset): void => setDraft({ ...corners, [id]: c });
  // Arrow-key nudges save once the keys rest (each press builds on the last, unsaved one).
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );
  const commit = (): void => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (draft) onCommit(draft);
    setDraft(null);
  };
  const onDown = (id: CornerId) => (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, x: e.clientX, y: e.clientY, from: corners[id] };
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    const box = pad.current?.getBoundingClientRect();
    if (!d || !box) return;
    move(d.id, {
      x: clampPct(d.from.x + ((e.clientX - d.x) / box.width) * 100),
      y: clampPct(d.from.y + ((e.clientY - d.y) / box.height) * 100),
    });
  };
  const onUp = (): void => {
    drag.current = null;
    commit();
  };
  const onKey = (id: CornerId) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 2 : 0.5;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const c = corners[id];
    const next = { ...corners, [id]: { x: clampPct(c.x + dx), y: clampPct(c.y + dy) } };
    setDraft(next);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      idle.current = null;
      onCommit(next);
      setDraft(null);
    }, 400);
  };
  return (
    <div
      ref={pad}
      className="relative aspect-video w-full max-w-[320px] shrink-0 rounded-[4px] bg-[var(--surface-0)] shadow-[0_0_0_1px_var(--hairline-strong)]"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <polygon
          points={shape.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="color-mix(in srgb, var(--accent) 22%, transparent)"
          stroke="var(--accent)"
          strokeWidth="1.5"
          style={{ filter: screenFilterCss(adjust) || undefined }}
        />
      </svg>
      {CORNERS.map((id, i) => {
        const [x, y] = shape[i] ?? [0, 0];
        return (
          <Button
            key={id}
            variant="bare"
            aria-label={t(`screenFit.corner.${id}`)}
            title={t('screenFit.cornerHint')}
            onPointerDown={onDown(id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onKeyDown={onKey(id)}
            onBlur={commit}
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full bg-[var(--accent)] shadow-[0_0_0_2px_var(--surface-0)] outline-none focus-visible:shadow-[var(--focus-ring)] active:cursor-grabbing"
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Screen adjustments: pick a screen, then pin its corners (keystone), size and move the picture,
 * flip it for rear projection, and match its colour to the others. Each output applies its own.
 */
export function ScreenFitGroup({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const targets = useFitTargets(s);
  const patterns = useStore((x) => x.live?.testPatterns ?? EMPTY_LIST);
  const [picked, setPicked] = useState<string | null>(null);
  const target = targets.find((x) => x.key === picked) ?? targets[0];
  if (!target)
    return (
      <Group title={t('screenFit.title')} description={t('screenFit.help')}>
        <Notice>{t('screenFit.noScreens')}</Notice>
      </Group>
    );
  const adjust = s.screenAdjust[target.key] ?? PLAIN;
  const save = (patch: Partial<ScreenAdjust>): void => {
    const next = { ...adjust, ...patch };
    // An untouched screen keeps no entry.
    const rest = Object.fromEntries(
      Object.entries(s.screenAdjust).filter(([k]) => k !== target.key),
    );
    update({ screenAdjust: isPlainAdjust(next) ? rest : { ...rest, [target.key]: next } });
  };
  const pattern = patterns.includes(target.outputId);
  const pct = (v: number): string => `${Math.round(v)}%`;
  const times = (v: number): string => `${Math.round(v * 100)}%`;
  return (
    <Group title={t('screenFit.title')} description={t('screenFit.help')}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="min-w-[200px] flex-1">
          <Select<string>
            size="sm"
            aria-label={t('screenFit.screen')}
            value={target.key}
            onChange={setPicked}
            options={targets.map((x) => ({ value: x.key, label: x.label }))}
          />
        </div>
        <Button
          size="xs"
          variant={pattern ? 'primary' : 'ghost'}
          icon={<Grid3x3 size={13} />}
          aria-pressed={pattern}
          onClick={() => void cmd('live.testPattern', { outputId: target.outputId, on: !pattern })}
        >
          {t('outputs.testPattern')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<RotateCcw size={13} />}
          disabled={isPlainAdjust(adjust)}
          onClick={() => save(PLAIN)}
        >
          {t('screenFit.reset')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-5 px-4 py-4">
        <div className="flex flex-col gap-2">
          <CornerPad adjust={adjust} onCommit={(corners) => save({ corners })} />
          <Typography as="p" variant="caption" leading="snug" className="max-w-[320px]">
            {t('screenFit.cornerHelp')}
          </Typography>
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
          <CommitSlider
            label={t('screenFit.size')}
            value={Math.round(adjust.scale * 100)}
            min={50}
            max={150}
            format={pct}
            labelWidth="w-24"
            onCommit={(v) => save({ scale: v / 100 })}
          />
          <CommitSlider
            label={t('screenFit.moveX')}
            value={adjust.offsetX}
            min={-50}
            max={50}
            format={pct}
            labelWidth="w-24"
            onCommit={(offsetX) => save({ offsetX })}
          />
          <CommitSlider
            label={t('screenFit.moveY')}
            value={adjust.offsetY}
            min={-50}
            max={50}
            format={pct}
            labelWidth="w-24"
            onCommit={(offsetY) => save({ offsetY })}
          />
          <CommitSlider
            label={t('screenFit.brightness')}
            value={Math.round(adjust.brightness * 100)}
            min={20}
            max={200}
            format={(v) => times(v / 100)}
            labelWidth="w-24"
            onCommit={(v) => save({ brightness: v / 100 })}
          />
          <CommitSlider
            label={t('screenFit.contrast')}
            value={Math.round(adjust.contrast * 100)}
            min={20}
            max={200}
            format={(v) => times(v / 100)}
            labelWidth="w-24"
            onCommit={(v) => save({ contrast: v / 100 })}
          />
          <CommitSlider
            label={t('screenFit.saturate')}
            value={Math.round(adjust.saturate * 100)}
            min={0}
            max={200}
            format={(v) => times(v / 100)}
            labelWidth="w-24"
            onCommit={(v) => save({ saturate: v / 100 })}
          />
          <CommitSlider
            label={t('screenFit.hue')}
            value={adjust.hue}
            min={-180}
            max={180}
            format={(v) => `${Math.round(v)}°`}
            labelWidth="w-24"
            onCommit={(hue) => save({ hue })}
          />
        </div>
      </div>
      <Row label={t('screenFit.flipH')} description={t('screenFit.flipHHelp')}>
        <Switch
          label={t('screenFit.flipH')}
          checked={adjust.flipH}
          onChange={(flipH) => save({ flipH })}
        />
      </Row>
      <Row label={t('screenFit.flipV')} description={t('screenFit.flipVHelp')}>
        <Switch
          label={t('screenFit.flipV')}
          checked={adjust.flipV}
          onChange={(flipV) => save({ flipV })}
        />
      </Row>
    </Group>
  );
}

/** A little picture of the projectors side by side, their overlaps shaded. */
function BlendSketch({ count, overlap }: { count: number; overlap: number }) {
  const o = overlap / 100;
  const total = count - (count - 1) * o;
  return (
    <div aria-hidden className="relative h-12 w-full max-w-[320px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 h-full rounded-[3px] shadow-[0_0_0_1.5px_var(--accent)]"
          style={{
            left: `${((i * (1 - o)) / total) * 100}%`,
            width: `${(1 / total) * 100}%`,
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Edge blending: the audience projectors make one wide picture, overlapping a little, the
 * overlaps faded so no seam shows. Their order (left to right), the overlap and the gamma.
 */
export function EdgeBlendGroup({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const displays = useStore((x) => x.displays);
  const blend = s.edgeBlend;
  const save = (patch: Partial<EdgeBlend>): void => update({ edgeBlend: { ...blend, ...patch } });
  const audience = displays.filter((d) => d.role === 'main');
  // Left to right: the saved order first, then the rest as the displays sit.
  const rank = (fp: string): number => {
    const i = blend.order.indexOf(fp);
    return i >= 0 ? i : 1000;
  };
  const ordered = [...audience].sort((a, b) => rank(a.fingerprint) - rank(b.fingerprint));
  const count = s.windowMode ? blend.windows : ordered.length;
  const swap = (i: number, j: number): void => {
    const fps = ordered.map((d) => d.fingerprint);
    const a = fps[i];
    const b = fps[j];
    if (a === undefined || b === undefined) return;
    fps[i] = b;
    fps[j] = a;
    save({ order: fps });
  };
  return (
    <Group title={t('edgeBlend.title')} description={t('edgeBlend.help')}>
      <Row label={t('edgeBlend.enable')} description={t('edgeBlend.enableHelp')}>
        <Switch
          label={t('edgeBlend.enable')}
          checked={blend.enabled}
          onChange={(enabled) => save({ enabled })}
        />
      </Row>
      {blend.enabled && !s.windowMode && audience.length < 2 && (
        <div className="px-4 py-3">
          <Notice tone="warn">{t('edgeBlend.needTwo')}</Notice>
        </div>
      )}
      {blend.enabled && (
        <div className="flex flex-col gap-3 px-4 py-4">
          {count >= 2 && <BlendSketch count={count} overlap={blend.overlap} />}
          <CommitSlider
            label={t('edgeBlend.overlap')}
            value={blend.overlap}
            max={40}
            format={(v) => `${Math.round(v)}%`}
            labelWidth="w-24"
            onCommit={(overlap) => save({ overlap })}
          />
          <CommitSlider
            label={t('edgeBlend.gamma')}
            value={Math.round(blend.gamma * 10)}
            min={10}
            max={30}
            format={(v) => (v / 10).toFixed(1)}
            labelWidth="w-24"
            onCommit={(v) => save({ gamma: v / 10 })}
          />
          <Typography as="p" variant="caption" leading="snug">
            {t('edgeBlend.gammaHelp')}
          </Typography>
        </div>
      )}
      {blend.enabled && s.windowMode && (
        <Row label={t('edgeBlend.windows')} description={t('edgeBlend.windowsHelp')}>
          <Segmented<string>
            label={t('edgeBlend.windows')}
            value={String(blend.windows)}
            onChange={(v) => save({ windows: Number(v) })}
            options={['2', '3', '4'].map((v) => ({ value: v, label: v }))}
          />
        </Row>
      )}
      {blend.enabled && !s.windowMode && ordered.length >= 2 && (
        <Row label={t('edgeBlend.order')} description={t('edgeBlend.orderHelp')} stack>
          <ol className="flex flex-col gap-1">
            {ordered.map((d, i) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-[6px] bg-[var(--surface-3)] px-2.5 py-1.5"
              >
                <Typography size={12} weight="semibold" tone="secondary" className="w-5">
                  {i + 1}
                </Typography>
                <Typography size={12} tone="primary" truncate className="min-w-0 flex-1">
                  {d.label}
                </Typography>
                <IconButton
                  size="2xs"
                  aria-label={t('edgeBlend.left', { name: d.label })}
                  disabled={i === 0}
                  onClick={() => swap(i, i - 1)}
                >
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton
                  size="2xs"
                  aria-label={t('edgeBlend.right', { name: d.label })}
                  disabled={i === ordered.length - 1}
                  onClick={() => swap(i, i + 1)}
                >
                  <ArrowDown size={13} />
                </IconButton>
              </li>
            ))}
          </ol>
        </Row>
      )}
    </Group>
  );
}
