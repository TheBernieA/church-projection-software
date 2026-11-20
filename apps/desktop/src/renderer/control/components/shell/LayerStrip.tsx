import { useState, type DragEvent, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Ellipsis, ListChecks, RotateCcw, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '@lampstand/core';
import { IconButton, Typography } from '@lampstand/ui';
import { clearGroup } from '../../lib/actions';
import { openDialog, useStore } from '../../lib/store';
import i18n from '../../i18n';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';

/** The layers the strip can hold, top to bottom as stacked on screen by default. */
const STRIP_LAYERS = [
  'messages',
  'props',
  'announcements',
  'content',
  'media',
  'background',
] as const;
type StripLayerId = (typeof STRIP_LAYERS)[number];

/** One layer's clear button, as the strip (or the "…" menu) shows it. */
export interface StripLayer {
  id: StripLayerId;
  icon: ReactNode;
  label: string;
  /** Its keyboard shortcut, for the tooltip. */
  hint?: string;
  /** Showing something now. */
  on: boolean;
  /** Empty now, but the last clear can be undone. */
  restorable: boolean;
  /** What would come back (a slide label, a file name), for the tooltip. */
  restoreWhat?: string | undefined;
  onClear: () => void;
  onRestore: () => void;
}

/** Which layers sit on the strip, in what order; the rest live in "…". Per computer. */
interface StripPrefs {
  order: StripLayerId[];
  hidden: StripLayerId[];
}
const PREFS_KEY = 'lampstand.layerStrip';
const DEFAULT_PREFS: StripPrefs = { order: [...STRIP_LAYERS], hidden: ['props'] };
const isLayer = (x: unknown): x is StripLayerId =>
  typeof x === 'string' && (STRIP_LAYERS as readonly string[]).includes(x);

function readPrefs(): StripPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    const { order, hidden } = raw as Partial<Record<keyof StripPrefs, unknown>>;
    const known = Array.isArray(order) ? order.filter(isLayer) : [];
    return {
      // Layers added in a later version join at the end.
      order: [...new Set([...known, ...STRIP_LAYERS])],
      hidden: Array.isArray(hidden) ? hidden.filter(isLayer) : DEFAULT_PREFS.hidden,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function useStripPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const save = (next: StripPrefs): void => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* private window: just for this session */
    }
  };
  return { prefs, save };
}

const tipFor = (layer: StripLayer): { name: string; restore: boolean; tip: string } => {
  const restore = !layer.on && layer.restorable;
  const name = restore
    ? i18n.t('monitor.restoreLayer', { name: layer.label })
    : i18n.t('monitor.clearLayer', { name: layer.label });
  const tip = restore && layer.restoreWhat ? `${name}: ${layer.restoreWhat}` : name;
  return { name, restore, tip: layer.hint && !restore ? `${tip} (${layer.hint})` : tip };
};

/**
 * One layer on the strip. Lit red while the layer shows something; clicking clears just that
 * layer. Once cleared it remembers what was there: a red outline, and clicking again brings it
 * back. Inert (but still draggable) when there is nothing to bring back.
 */
function LayerButton({ layer }: { layer: StripLayer }) {
  const { t } = useTranslation();
  const { name, restore, tip } = tipFor(layer);
  const inert = !layer.on && !layer.restorable;
  return (
    <IconButton
      size="2xs"
      variant="quiet"
      onClick={inert ? undefined : restore ? layer.onRestore : layer.onClear}
      aria-disabled={inert || undefined}
      active={layer.on}
      activeTone="live"
      aria-label={name}
      title={`${tip}\n${t('monitor.dragToMove')}`}
      // An empty layer is a plain icon, not a faded "disabled" one; one that can come back is
      // outlined in red.
      className={`${inert ? 'cursor-default hover:!bg-transparent' : ''} ${
        restore
          ? '!text-[var(--text-1)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tally-program)_70%,transparent)]'
          : ''
      }`}
    >
      {layer.icon}
    </IconButton>
  );
}

const DRAG_TYPE = 'application/x-lampstand-strip-layer';
const isStripDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes(DRAG_TYPE);

const EMPTY_GROUPS: NonNullable<Settings['clearGroups']> = [];

/**
 * "…" at the foot of the strip: the layers kept off the strip (clear or bring back from here),
 * which layers the strip shows, and the operator's clear groups. Dropping a strip button on it
 * moves that layer in here.
 */
function MoreMenu({
  layers,
  prefs,
  onToggle,
  onReset,
  onDropLayer,
}: {
  layers: StripLayer[];
  prefs: StripPrefs;
  onToggle: (id: StripLayerId) => void;
  onReset: () => void;
  onDropLayer: (id: StripLayerId) => void;
}) {
  const { t } = useTranslation();
  const groups = useStore((s) => s.settings?.clearGroups ?? EMPTY_GROUPS);
  const [over, setOver] = useState(false);
  const tucked = prefs.order
    .filter((id) => prefs.hidden.includes(id))
    .flatMap((id) => layers.find((l) => l.id === id) ?? []);
  // Something live in a tucked-away layer: a red dot on "…", so it's never forgotten.
  const liveInside = tucked.some((l) => l.on);
  const custom = JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFS);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="2xs"
          variant="quiet"
          aria-label={t('monitor.moreLayers')}
          title={t('monitor.moreLayersHint')}
          onDragOver={(e) => {
            if (!isStripDrag(e)) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            setOver(false);
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (isLayer(id)) onDropLayer(id);
          }}
          className={`relative ${over ? 'shadow-[inset_0_0_0_1.5px_var(--select)]' : ''}`}
        >
          <Ellipsis size={14} />
          {liveInside && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--tally-program)]"
            />
          )}
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="left" align="end" sideOffset={6} className={MENU_CLASS}>
          {tucked.length > 0 && (
            <>
              <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                {t('monitor.layersLabel')}
              </DropdownMenu.Label>
              {tucked.map((l) => {
                const { name, restore, tip } = tipFor(l);
                return (
                  <DropdownMenu.Item
                    key={l.id}
                    className={ITEM_CLASS}
                    disabled={!l.on && !l.restorable}
                    title={tip}
                    onSelect={restore ? l.onRestore : l.onClear}
                  >
                    <Typography tone={l.on ? 'inherit' : 'muted'} className="flex">
                      {l.icon}
                    </Typography>
                    <Typography className="flex-1">{name}</Typography>
                    {l.on && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-[var(--tally-program)]"
                      />
                    )}
                  </DropdownMenu.Item>
                );
              })}
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
            </>
          )}
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t('monitor.onTheStrip')}
          </DropdownMenu.Label>
          {prefs.order.map((id) => {
            const l = layers.find((x) => x.id === id);
            if (!l) return null;
            return (
              <DropdownMenu.CheckboxItem
                key={id}
                className={ITEM_CLASS}
                checked={!prefs.hidden.includes(id)}
                // Keep the menu open while choosing several.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onToggle(id)}
              >
                <Typography className="flex w-3.5 justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </Typography>
                {l.label}
              </DropdownMenu.CheckboxItem>
            );
          })}
          {custom && (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={onReset}>
              <RotateCcw size={14} />
              {t('monitor.resetStrip')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t('clearGroups.title')}
          </DropdownMenu.Label>
          {groups.map((g) => (
            <DropdownMenu.Item
              key={g.id}
              className={ITEM_CLASS}
              onSelect={() => void clearGroup(g.layers)}
              title={g.layers.map((l) => t(`clearGroups.layers.${l}`)).join(', ')}
            >
              <ListChecks size={14} />
              <Typography truncate className="flex-1">
                {t('clearGroups.clear', { name: g.name })}
              </Typography>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => openDialog('settings', { settingsPage: 'presenting' })}
          >
            <Settings2 size={14} />
            {groups.length ? t('clearGroups.edit') : t('clearGroups.create')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The vertical clear strip beside the monitor: Turn off live on top, then one button per layer
 * (in the operator's order: drag a button up or down to move it, or onto "…" to tuck it away),
 * then "…" with the rest.
 */
export function LayerStrip({ power, layers }: { power: ReactNode; layers: StripLayer[] }) {
  const { t } = useTranslation();
  const { prefs, save } = useStripPrefs();
  const [dragging, setDragging] = useState<StripLayerId | null>(null);
  const [overId, setOverId] = useState<StripLayerId | null>(null);
  const shown = prefs.order
    .filter((id) => !prefs.hidden.includes(id))
    .flatMap((id) => layers.find((l) => l.id === id) ?? []);

  /** Put `id` just before `target` (on the strip). */
  const moveBefore = (id: StripLayerId, target: StripLayerId): void => {
    if (id === target) return;
    const order = prefs.order.filter((x) => x !== id);
    order.splice(order.indexOf(target), 0, id);
    save({ order, hidden: prefs.hidden.filter((x) => x !== id) });
  };
  const toggle = (id: StripLayerId): void =>
    save({
      ...prefs,
      hidden: prefs.hidden.includes(id)
        ? prefs.hidden.filter((x) => x !== id)
        : [...prefs.hidden, id],
    });
  const tuck = (id: StripLayerId): void => {
    if (!prefs.hidden.includes(id)) save({ ...prefs, hidden: [...prefs.hidden, id] });
  };
  const end = (): void => {
    setDragging(null);
    setOverId(null);
  };

  return (
    <div
      role="group"
      aria-label={t('monitor.clear')}
      className="flex w-7 shrink-0 flex-col items-center gap-[3px]"
    >
      {power}
      {shown.map((l) => (
        <div
          key={l.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, l.id);
            e.dataTransfer.effectAllowed = 'move';
            setDragging(l.id);
          }}
          onDragEnd={end}
          onDragOver={(e) => {
            if (!isStripDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOverId(l.id);
          }}
          onDragLeave={() => setOverId((o) => (o === l.id ? null : o))}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (isLayer(id)) moveBefore(id, l.id);
            end();
          }}
          className={`relative rounded-[6px] transition-opacity duration-[var(--dur-fast)] ${
            dragging === l.id ? 'opacity-40' : ''
          }`}
        >
          {overId === l.id && dragging !== l.id && (
            <span
              aria-hidden
              className="absolute -top-[2.5px] left-0.5 right-0.5 h-0.5 rounded-full bg-[var(--select)]"
            />
          )}
          <LayerButton layer={l} />
        </div>
      ))}
      <MoreMenu
        layers={layers}
        prefs={prefs}
        onToggle={toggle}
        onReset={() => save(DEFAULT_PREFS)}
        onDropLayer={(id) => {
          tuck(id);
          end();
        }}
      />
    </div>
  );
}
