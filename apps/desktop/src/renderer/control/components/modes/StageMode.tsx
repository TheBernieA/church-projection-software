import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Copy, Lock, MonitorPlay, Pencil, Plus, Smartphone, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_STAGE_LAYOUT_ID,
  newId,
  resolveStageLayout,
  STAGE_PRESETS,
  StageElementKindSchema,
  type StageElement,
  type StageElementKind,
  type StageLayout,
} from '@lampstand/core';
import { Button, IconButton, Slider, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { StagePreview } from '../StagePreview';
import { SoonFeature } from '../Soon';

const EMPTY: StageLayout[] = [];
const KINDS = StageElementKindSchema.options;

/** Where a new element of each kind lands, and how big. */
const NEW_BOX: Record<StageElementKind, Pick<StageElement, 'x' | 'y' | 'w' | 'h'>> = {
  current: { x: 5, y: 15, w: 50, h: 50 },
  next: { x: 58, y: 15, w: 38, h: 38 },
  clock: { x: 5, y: 3, w: 20, h: 10 },
  elapsed: { x: 78, y: 3, w: 18, h: 10 },
  timers: { x: 30, y: 3, w: 40, h: 10 },
  label: { x: 5, y: 70, w: 50, h: 8 },
  notes: { x: 58, y: 58, w: 38, h: 30 },
  message: { x: 10, y: 40, w: 80, h: 20 },
  chords: { x: 5, y: 66, w: 50, h: 30 },
  text: { x: 30, y: 80, w: 40, h: 10 },
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const snap = (v: number): number => Math.round(v * 2) / 2;

/**
 * The boxes over the preview, for moving (drag the box) and resizing (drag its corner) the
 * layout's elements. Positions snap to half a percent and stay on screen.
 */
function EditBoxes({
  elements,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  elements: StageElement[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<StageElement>, commit: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const area = useRef<HTMLDivElement>(null);
  const drag = (e: ReactPointerEvent, el: StageElement, mode: 'move' | 'resize'): void => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(el.id);
    // preventDefault stops the box taking focus on its own: give it focus, for the keys.
    e.currentTarget.closest<HTMLElement>('[role="button"]')?.focus();
    const rect = area.current?.getBoundingClientRect();
    if (!rect) return;
    const start = { x: e.clientX, y: e.clientY };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent, commit: boolean): void => {
      const dx = ((ev.clientX - start.x) / rect.width) * 100;
      const dy = ((ev.clientY - start.y) / rect.height) * 100;
      const patch =
        mode === 'move'
          ? { x: snap(clamp(el.x + dx, 0, 100 - el.w)), y: snap(clamp(el.y + dy, 0, 100 - el.h)) }
          : {
              w: snap(clamp(el.w + dx, 4, 100 - el.x)),
              h: snap(clamp(el.h + dy, 4, 100 - el.y)),
            };
      onChange(el.id, patch, commit);
    };
    const move = (ev: PointerEvent): void => at(ev, false);
    const up = (ev: PointerEvent): void => {
      at(ev, true);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  return (
    <div
      ref={area}
      className="absolute inset-0"
      onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}
    >
      {elements.map((el) => {
        const on = el.id === selected;
        return (
          <div
            key={el.id}
            role="button"
            tabIndex={0}
            aria-label={t('stageLayouts.element', { name: t(`stageLayouts.kinds.${el.kind}`) })}
            aria-pressed={on}
            onPointerDown={(e) => drag(e, el, 'move')}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 5 : 0.5;
              const move: Record<string, Partial<StageElement>> = {
                ArrowLeft: { x: clamp(el.x - step, 0, 100 - el.w) },
                ArrowRight: { x: clamp(el.x + step, 0, 100 - el.w) },
                ArrowUp: { y: clamp(el.y - step, 0, 100 - el.h) },
                ArrowDown: { y: clamp(el.y + step, 0, 100 - el.h) },
              };
              const patch = move[e.key];
              if (patch) {
                e.preventDefault();
                onChange(el.id, patch, true);
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                onRemove(el.id);
              }
            }}
            onFocus={() => onSelect(el.id)}
            className={`absolute cursor-move rounded-[3px] outline-none ${
              on
                ? 'shadow-[inset_0_0_0_2px_var(--accent)]'
                : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] hover:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.7)]'
            }`}
            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
          >
            <Typography
              size={10}
              weight="semibold"
              tone="white"
              className={`absolute left-0 top-0 rounded-br-[4px] px-1 py-px ${on ? 'bg-[var(--accent)] !text-[var(--accent-ink)]' : 'bg-black/60'}`}
            >
              {t(`stageLayouts.kinds.${el.kind}`)}
            </Typography>
            {on && (
              <span
                aria-hidden
                onPointerDown={(e) => drag(e, el, 'resize')}
                className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-[2px] bg-[var(--accent)] shadow-[0_0_0_1.5px_#000]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One layout in the list: pick it to edit or look at; a dot when it's on the stage screens. */
function LayoutRow({
  layout,
  preset,
  selected,
  inUse,
  onPick,
}: {
  layout: StageLayout;
  preset: boolean;
  selected: boolean;
  inUse: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <Button
        variant="bare"
        aria-pressed={selected}
        onClick={onPick}
        className={`flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left ${
          selected ? 'bg-[var(--select)] text-white' : 'hover:bg-[var(--surface-2)]'
        }`}
      >
        <Typography size={13} tone="inherit" truncate className="min-w-0 flex-1">
          {layout.name}
        </Typography>
        {preset && (
          <Lock size={12} className="shrink-0 opacity-60" aria-label={t('stageLayouts.preset')} />
        )}
        {inUse && (
          <Typography
            size={10}
            weight="bold"
            tone="white"
            caps
            className="shrink-0 rounded-[3px] bg-[var(--tally-preview)] px-1 py-px"
          >
            {t('stageLayouts.inUse')}
          </Typography>
        )}
      </Button>
    </li>
  );
}

/**
 * Stage workspace: design what the stage screens show. Pick a ready-made layout or one of your
 * own, drag and resize its elements over a live preview, and put it on the stage screens.
 */
export function StageMode() {
  const { t } = useTranslation();
  const custom = useStore((s) => s.settings?.stageLayouts ?? EMPTY);
  const activeId = useStore((s) => s.settings?.stageLayoutId ?? null);
  const inUseId = resolveStageLayout(custom, activeId).id;
  const [editId, setEditId] = useState<string>(inUseId);
  const [selected, setSelected] = useState<string | null>(null);
  // While dragging, the boxes move locally; one save when let go.
  const [draft, setDraft] = useState<StageLayout | null>(null);
  const saved = resolveStageLayout(custom, editId);
  const layout = draft?.id === saved.id ? draft : saved;
  const preset = !custom.some((l) => l.id === layout.id);
  const element = layout.elements.find((e) => e.id === selected) ?? null;

  const save = (next: StageLayout): void => {
    setDraft(null);
    void saveSettings({ stageLayouts: custom.map((l) => (l.id === next.id ? next : l)) });
  };
  const patchElement = (id: string, patch: Partial<StageElement>, commit: boolean): void => {
    const next = {
      ...layout,
      elements: layout.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    };
    if (commit) save(next);
    else setDraft(next);
  };
  const duplicate = (): void => {
    const copy: StageLayout = {
      id: newId(),
      name: t('stageLayouts.copyName', { name: layout.name }),
      elements: layout.elements.map((e) => ({ ...e, id: newId() })),
    };
    void saveSettings({ stageLayouts: [...custom, copy] });
    setEditId(copy.id);
    setSelected(null);
  };
  const remove = (): void => {
    const rest = custom.filter((l) => l.id !== layout.id);
    void saveSettings({
      stageLayouts: rest,
      ...(activeId === layout.id ? { stageLayoutId: null } : {}),
    });
    setEditId(DEFAULT_STAGE_LAYOUT_ID);
  };
  const addElement = (kind: StageElementKind): void => {
    const el: StageElement = {
      id: newId(),
      kind,
      ...NEW_BOX[kind],
      size: 1,
      ...(kind === 'text' ? { text: t('stageLayouts.newText') } : {}),
    };
    save({ ...layout, elements: [...layout.elements, el] });
    setSelected(el.id);
  };
  const removeElement = (id: string): void => {
    save({ ...layout, elements: layout.elements.filter((x) => x.id !== id) });
    setSelected(null);
  };

  const all = useMemo(
    () => [
      ...STAGE_PRESETS.map((l) => ({ l, preset: true })),
      ...custom.map((l) => ({ l, preset: false })),
    ],
    [custom],
  );

  return (
    // Three columns; in a narrow workspace they stack (layouts, the layout, what to add) and scroll.
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 @max-[760px]:flex-col @max-[760px]:overflow-y-auto"
        data-testid="stage-mirror"
      >
        {/* Layouts. */}
        <aside
          aria-label={t('stageLayouts.list')}
          className="flex w-56 shrink-0 flex-col gap-2 border-r border-[var(--divider)] bg-[var(--surface-1)] p-3 @max-[760px]:w-full @max-[760px]:border-r-0 @max-[760px]:border-b"
        >
          <Typography as="h2" variant="overline" className="px-1">
            {t('stageLayouts.list')}
          </Typography>
          <ul className="flex flex-col gap-0.5 @max-[760px]:grid @max-[760px]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] @max-[760px]:gap-1">
            {all.map(({ l, preset: p }) => (
              <LayoutRow
                key={l.id}
                layout={l}
                preset={p}
                selected={l.id === layout.id}
                inUse={l.id === inUseId}
                onPick={() => {
                  setEditId(l.id);
                  setSelected(null);
                  setDraft(null);
                }}
              />
            ))}
          </ul>
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={duplicate}>
            {t('stageLayouts.new')}
          </Button>
          <span className="flex-1 @max-[760px]:hidden" />
          <SoonFeature id="stage-app" icon={<Smartphone size={14} />} />
        </aside>

        {/* The layout, live. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 @max-[760px]:flex-none @max-[760px]:overflow-visible">
          <div className="flex flex-wrap items-center gap-2">
            {preset ? (
              <Typography
                size={15}
                weight="semibold"
                tone="primary"
                className="flex items-center gap-2"
              >
                {layout.name}
                <Typography size={11} tone="muted" weight="regular">
                  {t('stageLayouts.presetHint')}
                </Typography>
              </Typography>
            ) : (
              <DeferredInput
                aria-label={t('stageLayouts.name')}
                value={layout.name}
                maxLength={60}
                onCommit={(name) => name.trim() && save({ ...layout, name: name.trim() })}
                className="field !h-8 w-64"
              />
            )}
            <span className="flex-1" />
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={duplicate}>
              {preset ? t('stageLayouts.duplicateToEdit') : t('stageLayouts.duplicate')}
            </Button>
            {!preset && (
              <IconButton
                size="xs"
                variant="danger"
                aria-label={t('stageLayouts.delete', { name: layout.name })}
                onClick={remove}
              >
                <Trash2 size={14} />
              </IconButton>
            )}
            <Button
              size="sm"
              variant={layout.id === inUseId ? 'subtle' : 'primary'}
              icon={<MonitorPlay size={14} />}
              disabled={layout.id === inUseId}
              onClick={() => void saveSettings({ stageLayoutId: layout.id })}
            >
              {layout.id === inUseId ? t('stageLayouts.onStage') : t('stageLayouts.use')}
            </Button>
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-[6px] bg-black shadow-[0_0_0_1px_var(--hairline-strong)]">
            <StagePreview layout={layout} editing={!preset} />
            {!preset && (
              <EditBoxes
                elements={layout.elements}
                selected={selected}
                onSelect={setSelected}
                onChange={patchElement}
                onRemove={removeElement}
              />
            )}
          </div>
          <Typography as="p" variant="caption">
            {preset ? t('stageLayouts.presetHelp') : t('stageLayouts.editHelp')}
          </Typography>
        </div>

        {/* Elements. */}
        {!preset && (
          <aside
            aria-label={t('stageLayouts.elements')}
            className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[var(--divider)] bg-[var(--surface-1)] p-3 @max-[760px]:w-full @max-[760px]:overflow-visible @max-[760px]:border-l-0 @max-[760px]:border-t"
          >
            <Typography as="h2" variant="overline" className="px-1">
              {t('stageLayouts.add')}
            </Typography>
            <div className="grid grid-cols-2 gap-1.5">
              {KINDS.map((k) => (
                <Button
                  key={k}
                  size="xs"
                  variant="subtle"
                  icon={<Plus size={12} />}
                  onClick={() => addElement(k)}
                  className="!justify-start"
                >
                  {t(`stageLayouts.kinds.${k}`)}
                </Button>
              ))}
            </div>
            {element ? (
              <section className="flex flex-col gap-3 border-t border-[var(--divider)] pt-3">
                <div className="flex items-center gap-2">
                  <Pencil size={13} className="text-[var(--text-3)]" />
                  <Typography size={13} weight="semibold" tone="primary" className="flex-1">
                    {t(`stageLayouts.kinds.${element.kind}`)}
                  </Typography>
                  <IconButton
                    size="2xs"
                    variant="quiet"
                    aria-label={t('stageLayouts.removeElement')}
                    onClick={() => {
                      save({
                        ...layout,
                        elements: layout.elements.filter((x) => x.id !== element.id),
                      });
                      setSelected(null);
                    }}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
                {element.kind === 'text' && (
                  <DeferredInput
                    aria-label={t('stageLayouts.textOf')}
                    value={element.text ?? ''}
                    maxLength={300}
                    onCommit={(text) => patchElement(element.id, { text }, true)}
                    className="field !h-8 w-full"
                  />
                )}
                {element.kind !== 'current' && element.kind !== 'next' && (
                  <label className="flex flex-col gap-1">
                    <Typography size={12} tone="secondary">
                      {t('stageLayouts.size')}
                    </Typography>
                    <Slider
                      aria-label={t('stageLayouts.size')}
                      min={0.4}
                      max={4}
                      step={0.1}
                      value={element.size}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(e) =>
                        patchElement(element.id, { size: Number(e.currentTarget.value) }, false)
                      }
                      onPointerUp={(e) =>
                        patchElement(element.id, { size: Number(e.currentTarget.value) }, true)
                      }
                      onKeyUp={(e) =>
                        patchElement(element.id, { size: Number(e.currentTarget.value) }, true)
                      }
                    />
                  </label>
                )}
                <Typography as="p" size={11} tone="muted" tabular>
                  {t('stageLayouts.position', {
                    x: Math.round(element.x),
                    y: Math.round(element.y),
                    w: Math.round(element.w),
                    h: Math.round(element.h),
                  })}
                </Typography>
              </section>
            ) : (
              <Typography
                as="p"
                variant="caption"
                className="border-t border-[var(--divider)] pt-3"
              >
                {t('stageLayouts.selectHint')}
              </Typography>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
