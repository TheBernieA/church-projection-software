import { useTranslation } from 'react-i18next';
import {
  CUT_SLOPES,
  EQ_BAND_TYPES,
  type CutSlope,
  type EqBandType,
  type MixerChannel,
} from '@lampstand/core';
import { Button, Segmented, Switch, Typography, typographyClass } from '@lampstand/ui';
import {
  BAND_RANGE,
  clamp,
  formatGain,
  formatHz,
  GRAPH_DB,
  HPF_RANGE,
  LPF_RANGE,
  NODE_IDS,
  nodeActive,
  nodeColour,
  nodePoint,
  Q_RANGE,
  roundHz,
  type NodeId,
} from './eqGeometry';
import { setBand, setCut } from './eqEdit';
import { Knob } from './Knob';

/** A log-scale knob position for a value in a range, and back. */
const logPos = (v: number, lo: number, hi: number): number => Math.log(v / lo) / Math.log(hi / lo);
const logVal = (p: number, lo: number, hi: number): number => lo * Math.pow(hi / lo, p);

/** Where each band sits by default (double-click a frequency knob). */
const DEFAULT_HZ = [100, 250, 800, 2500, 6000, 10_000];

/** The eight nodes as small chips: pick one to edit, see at a glance which are working. */
function NodeChips({
  c,
  node,
  onSelect,
  compact = false,
}: {
  c: MixerChannel;
  node: NodeId;
  onSelect: (n: NodeId) => void;
  /** One row of marks only (docked). */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('mixer.eqw.bands')}
      className={`grid gap-1 ${compact ? 'grid-cols-8' : 'grid-cols-4'}`}
    >
      {NODE_IDS.map((id) => {
        const active = nodeActive(c, id);
        const selected = id === node;
        const colour = nodeColour(id);
        const p = nodePoint(c, id);
        const name =
          id === 'hpf'
            ? t('mixer.eqw.lowCut')
            : id === 'lpf'
              ? t('mixer.eqw.highCut')
              : t('mixer.eqw.band', { n: id + 1 });
        return (
          <Button
            key={String(id)}
            variant="bare"
            role="tab"
            aria-selected={selected}
            aria-label={name}
            title={`${name} · ${formatHz(p.hz)}`}
            onClick={() => onSelect(id)}
            className={`flex h-[30px] ${compact ? 'w-[36px] justify-center' : 'w-[74px]'} items-center gap-1.5 rounded-[var(--radius-control)] px-1.5 transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${selected ? 'bg-[var(--surface-3)]' : 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)]'}`}
            style={selected ? { boxShadow: `inset 0 0 0 1px ${colour}` } : undefined}
          >
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-full"
              style={
                active
                  ? { background: colour, color: '#16161a' }
                  : { boxShadow: `inset 0 0 0 1.5px ${colour}`, color: colour }
              }
            >
              <Typography size={10} weight="bold" tone="inherit">
                {id === 'hpf' ? 'L' : id === 'lpf' ? 'H' : id + 1}
              </Typography>
            </span>
            {!compact && (
              <span
                className={`min-w-0 flex-1 text-left ${typographyClass({ size: 10, tabular: true })} ${active ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}
              >
                {formatHz(p.hz).replace(' ', '')}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

/** The selected band's or cut's own controls: on/off, shape, and its knobs. */
function NodeControls({
  c,
  node,
  compact = false,
}: {
  c: MixerChannel;
  node: NodeId;
  compact?: boolean;
}) {
  const knob = compact ? 40 : 46;
  const row = `flex min-w-0 items-center ${compact ? 'flex-wrap gap-x-3 gap-y-2' : 'gap-4'}`;
  const { t } = useTranslation();
  const off = c.locked;
  const colour = nodeColour(node);

  if (node === 'hpf' || node === 'lpf') {
    const isLow = node === 'hpf';
    const on = isLow ? c.hpf : c.lpf;
    const hz = isLow ? c.hpfHz : c.lpfHz;
    const slope = isLow ? c.hpfSlope : c.lpfSlope;
    const [lo, hi] = isLow ? HPF_RANGE : LPF_RANGE;
    const name = isLow ? t('mixer.eqw.lowCut') : t('mixer.eqw.highCut');
    return (
      <div className={row}>
        <div
          className={`flex shrink-0 gap-1.5 ${compact ? 'w-full flex-row items-center justify-between' : 'min-w-[120px] flex-col'}`}
        >
          <div className="flex items-center gap-2">
            <Switch
              label={t('mixer.eqw.nodeOn', { name })}
              checked={on}
              disabled={off}
              onChange={(v) => setCut(c, node, { on: v })}
            />
            <Typography size={12} weight="semibold" tone="primary" truncate>
              {name}
            </Typography>
          </div>
          {!compact && (
            <Typography size={11} tone="muted" leading="snug">
              {isLow ? t('mixer.eqw.lowCutHelp') : t('mixer.eqw.highCutHelp')}
            </Typography>
          )}
        </div>
        <Knob
          label={t('mixer.eqw.freq')}
          pos={logPos(hz, lo, hi)}
          onPos={(p) => setCut(c, node, { hz: roundHz(logVal(p, lo, hi)), on: true })}
          onReset={() => setCut(c, node, { hz: isLow ? 80 : 16_000 })}
          text={formatHz(hz)}
          colour={colour}
          disabled={off}
          step={0.01}
          size={knob}
        />
        <div className="flex flex-col items-center gap-1">
          <Typography size={10} weight="semibold" tone="muted" caps>
            {t('mixer.eqw.slope')}
          </Typography>
          <Segmented<`${CutSlope}`>
            label={t('mixer.eqw.slopeOf', { name })}
            value={`${slope}`}
            disabled={off}
            options={CUT_SLOPES.map((s) => ({ value: `${s}`, label: `${s}` }))}
            onChange={(v) => setCut(c, node, { slope: Number(v) as CutSlope })}
          />
          <Typography size={10} tone="muted">
            dB/oct
          </Typography>
        </div>
      </div>
    );
  }

  const b = c.eq.bands[node];
  if (!b) return null;
  const name = t('mixer.eqw.band', { n: node + 1 });
  const shelf = b.type === 'lowShelf' || b.type === 'highShelf';
  const notch = b.type === 'notch';
  return (
    <div className={row}>
      <div
        className={`flex shrink-0 gap-1.5 ${compact ? 'w-full flex-row items-center justify-between' : 'min-w-[120px] flex-col'}`}
      >
        <div className="flex items-center gap-2">
          <Switch
            label={t('mixer.eqw.nodeOn', { name })}
            checked={b.on}
            disabled={off}
            onChange={(on) => setBand(c, node, { on })}
          />
          <Typography size={12} weight="semibold" tone="primary" truncate>
            {name}
          </Typography>
        </div>
        <Segmented<EqBandType>
          label={t('mixer.eqw.shapeOf', { name })}
          value={b.type}
          disabled={off}
          options={EQ_BAND_TYPES.map((ty) => ({
            value: ty,
            label: t(`mixer.eqw.typesShort.${ty}`),
            name: t(`mixer.eqw.types.${ty}`),
          }))}
          onChange={(type) => setBand(c, node, { type })}
        />
      </div>
      <Knob
        label={t('mixer.eqw.freq')}
        pos={logPos(b.hz, BAND_RANGE[0], BAND_RANGE[1])}
        onPos={(p) => setBand(c, node, { hz: roundHz(logVal(p, BAND_RANGE[0], BAND_RANGE[1])) })}
        onReset={() => setBand(c, node, { hz: DEFAULT_HZ[node] ?? 1000 })}
        text={formatHz(b.hz)}
        colour={colour}
        disabled={off}
        step={1 / 120}
        size={knob}
      />
      <Knob
        label={t('mixer.eqw.gain')}
        pos={(b.db + GRAPH_DB) / (2 * GRAPH_DB)}
        onPos={(p) =>
          setBand(c, node, {
            db: Math.round(clamp(p * 2 * GRAPH_DB - GRAPH_DB, -GRAPH_DB, GRAPH_DB) * 2) / 2,
          })
        }
        onReset={() => setBand(c, node, { db: 0 })}
        text={notch ? '—' : formatGain(b.db)}
        bipolar
        colour={colour}
        disabled={off || notch}
        step={1 / 72}
        size={knob}
      />
      <Knob
        label={t('mixer.eqw.q')}
        pos={logPos(b.q, Q_RANGE[0], Q_RANGE[1])}
        onPos={(p) =>
          setBand(c, node, { q: Math.round(logVal(p, Q_RANGE[0], Q_RANGE[1]) * 100) / 100 })
        }
        onReset={() => setBand(c, node, { q: 1 })}
        text={shelf ? '—' : b.q.toFixed(2)}
        colour={colour}
        disabled={off || shelf}
        step={1 / 100}
        size={knob}
      />
    </div>
  );
}

/** Under the graph: the node chips and the selected node's controls. */
export function EqBands({
  c,
  node,
  onSelect,
  compact = false,
}: {
  c: MixerChannel;
  node: NodeId;
  onSelect: (n: NodeId) => void;
  /** Docked (little height): a column beside the graph instead of a row under it. */
  compact?: boolean;
}) {
  if (compact)
    return (
      <div className="flex w-[324px] shrink-0 flex-col gap-2.5 overflow-y-auto">
        <NodeChips c={c} node={node} onSelect={onSelect} compact />
        <span className="h-px w-full shrink-0 bg-[var(--hairline-strong)]" />
        <NodeControls c={c} node={node} compact />
      </div>
    );
  return (
    <div className="flex min-w-0 items-center gap-4 overflow-x-auto">
      <NodeChips c={c} node={node} onSelect={onSelect} />
      <span className="h-14 w-px shrink-0 bg-[var(--hairline-strong)]" />
      <NodeControls c={c} node={node} />
    </div>
  );
}
