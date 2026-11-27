import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MixerChannel } from '@lampstand/core';
import { Switch, Typography } from '@lampstand/ui';
import { onMeters, readDyn, readMeter } from '../../../lib/meters';
import { mixerLive } from '../../../lib/mixer';
import { clamp } from './eqGeometry';
import { Knob } from './Knob';

type Patch = Parameters<typeof mixerLive>[0]['patch'];

const lin = (v: number, lo: number, hi: number): number => (v - lo) / (hi - lo);
const fromLin = (p: number, lo: number, hi: number, step: number): number =>
  Math.round((lo + clamp(p, 0, 1) * (hi - lo)) / step) * step;
const logPos = (v: number, lo: number, hi: number): number => Math.log(v / lo) / Math.log(hi / lo);
const fromLog = (p: number, lo: number, hi: number): number =>
  lo * Math.pow(hi / lo, clamp(p, 0, 1));
const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`;
const ms = (v: number): string => (v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);

/** A titled card with its on/off switch. */
function Card({
  title,
  on,
  onToggle,
  label,
  disabled,
  children,
  footer,
  className = '',
}: {
  footer?: ReactNode;
  title: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  label: string;
  disabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-3 shadow-[inset_0_0_0_1px_var(--hairline)] ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Typography size={12} weight="semibold" tone="primary">
          {title}
        </Typography>
        <Switch label={label} checked={on} disabled={disabled} onChange={onToggle} />
      </div>
      <div className={`flex min-h-0 flex-1 flex-col gap-3 ${on ? '' : 'opacity-50'}`}>
        {children}
      </div>
      {footer}
    </section>
  );
}

/** The channel's level against the gate's threshold: the gate opens when the bar crosses it. */
function GateBar({ c }: { c: MixerChannel }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const [peak] = readMeter('room', c.id);
      const db = peak > 0 ? 20 * Math.log10(peak) : -90;
      if (bar.current) bar.current.style.width = `${clamp((db + 80) / 80, 0, 1) * 100}%`;
      if (bar.current)
        bar.current.style.background = db >= c.gate.thresholdDb ? '#2fbf71' : 'var(--surface-4)';
    };
    draw();
    return onMeters(draw);
  }, [c.id, c.gate.thresholdDb]);
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)]">
      <span ref={bar} className="absolute inset-y-0 left-0" />
      <span
        className="absolute inset-y-[-2px] w-[2px] bg-[var(--accent)]"
        style={{ left: `${clamp((c.gate.thresholdDb + 80) / 80, 0, 1) * 100}%` }}
      />
    </div>
  );
}

/** Output level for an input level (dB) through the compressor: a 6 dB soft knee. */
export function compOut(x: number, threshold: number, ratio: number, knee = 6): number {
  const over = x - threshold;
  if (2 * over < -knee) return x;
  if (2 * Math.abs(over) <= knee)
    return x + ((1 / ratio - 1) * (over + knee / 2) ** 2) / (2 * knee);
  return threshold + over / ratio;
}

/** The compressor's transfer curve: input level across, output level up, with make-up. */
function TransferCurve({ c }: { c: MixerChannel }) {
  const S = 150;
  const LO = -60;
  const at = (db: number): number => ((db - LO) / -LO) * S;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = LO + i;
    const y = clamp(compOut(x, c.comp.thresholdDb, c.comp.ratio) + c.comp.makeupDb, LO, 6);
    pts.push(`${i ? 'L' : 'M'}${at(x).toFixed(1)},${(S - at(y)).toFixed(1)}`);
  }
  const tx = at(c.comp.thresholdDb);
  return (
    <svg
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      aria-hidden
      className="shrink-0 rounded-[var(--radius-md)] bg-[#141416] shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
    >
      {[-48, -36, -24, -12].map((d) => (
        <g key={d}>
          <line x1={at(d)} x2={at(d)} y1={0} y2={S} stroke="rgba(255,255,255,0.05)" />
          <line x1={0} x2={S} y1={S - at(d)} y2={S - at(d)} stroke="rgba(255,255,255,0.05)" />
        </g>
      ))}
      <line x1={0} y1={S} x2={S} y2={0} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 3" />
      <line x1={tx} x2={tx} y1={0} y2={S} stroke="var(--accent)" strokeOpacity={0.5} />
      <path d={pts.join('')} fill="none" stroke="var(--accent)" strokeWidth={2.25} />
    </svg>
  );
}

/** Gain reduction, growing down from the top (to −20 dB), with its reading. */
export function GrMeter({ id, kind = 'comp' }: { id: string; kind?: 'comp' | 'duck' }) {
  const bar = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const [gr, duck] = readDyn('room', id);
      const v = kind === 'comp' ? gr : duck;
      if (bar.current) bar.current.style.height = `${clamp(-v / 20, 0, 1) * 100}%`;
      if (text.current) text.current.textContent = v > -0.1 ? '0' : v.toFixed(1).replace('-', '−');
    };
    draw();
    return onMeters(draw);
  }, [id, kind]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-[150px] w-2.5 overflow-hidden rounded-[2px] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)]">
        <span ref={bar} className="absolute inset-x-0 top-0 bg-[#e8b04b]" />
      </div>
      {/* A fixed width: "0" to "−20.0" mustn't resize the column (it moved the whole card). */}
      <Typography ref={text} size={10} tabular tone="secondary" className="w-9 text-center" />
      <Typography size={10} weight="semibold" tone="muted" caps>
        GR
      </Typography>
    </div>
  );
}

/** The channel's dynamics: gate, compressor and ducking, each a card. */
export function DynamicsView({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const off = c.locked;
  const set = (patch: Patch): void => mixerLive({ action: 'channel', id: c.id, patch });
  const n = { name: c.name };
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[200px_minmax(380px,1fr)_220px] items-start gap-3 overflow-auto">
      <Card
        title={t('mixer.gate')}
        label={t('mixer.gateOf', n)}
        on={c.gate.on}
        disabled={off}
        onToggle={(on) => set({ gate: { on } })}
        className=""
      >
        <Typography size={11} tone="muted" leading="snug">
          {t('mixer.eqw.gateHelp')}
        </Typography>
        <GateBar c={c} />
        <div className="flex justify-center">
          <Knob
            label={t('mixer.threshold')}
            pos={lin(c.gate.thresholdDb, -80, 0)}
            onPos={(p) => set({ gate: { thresholdDb: fromLin(p, -80, 0, 1) } })}
            onReset={() => set({ gate: { thresholdDb: -50 } })}
            text={signed(c.gate.thresholdDb)}
            disabled={off}
            step={1 / 80}
            size={52}
          />
        </div>
      </Card>

      <Card
        title={t('mixer.comp')}
        label={t('mixer.compOf', n)}
        on={c.comp.on}
        disabled={off}
        onToggle={(on) => set({ comp: { on } })}
        className=""
      >
        <div className="flex flex-wrap gap-4">
          <TransferCurve c={c} />
          <div className="grid min-w-0 flex-1 grid-cols-3 content-start justify-items-center gap-x-1 gap-y-3">
            <Knob
              label={t('mixer.threshold')}
              pos={lin(c.comp.thresholdDb, -60, 0)}
              onPos={(p) => set({ comp: { thresholdDb: fromLin(p, -60, 0, 1) } })}
              onReset={() => set({ comp: { thresholdDb: -18 } })}
              text={signed(c.comp.thresholdDb)}
              disabled={off}
              step={1 / 60}
            />
            <Knob
              label={t('mixer.ratio')}
              pos={logPos(c.comp.ratio, 1, 20)}
              onPos={(p) => set({ comp: { ratio: Math.round(fromLog(p, 1, 20) * 10) / 10 } })}
              onReset={() => set({ comp: { ratio: 3 } })}
              text={`${c.comp.ratio.toFixed(1).replace(/\.0$/, '')}:1`}
              disabled={off}
            />
            <Knob
              label={t('mixer.makeup')}
              pos={lin(c.comp.makeupDb, 0, 24)}
              onPos={(p) => set({ comp: { makeupDb: fromLin(p, 0, 24, 0.5) } })}
              onReset={() => set({ comp: { makeupDb: 0 } })}
              text={signed(c.comp.makeupDb)}
              disabled={off}
              step={1 / 48}
            />
            <Knob
              label={t('mixer.attack')}
              pos={logPos(c.comp.attackMs, 0.5, 100)}
              onPos={(p) => set({ comp: { attackMs: Math.round(fromLog(p, 0.5, 100) * 10) / 10 } })}
              onReset={() => set({ comp: { attackMs: 5 } })}
              text={ms(c.comp.attackMs)}
              disabled={off}
            />
            <Knob
              label={t('mixer.release')}
              pos={logPos(c.comp.releaseMs, 10, 1000)}
              onPos={(p) => set({ comp: { releaseMs: Math.round(fromLog(p, 10, 1000)) } })}
              onReset={() => set({ comp: { releaseMs: 150 } })}
              text={ms(c.comp.releaseMs)}
              disabled={off}
            />
          </div>
          <GrMeter id={c.id} />
        </div>
      </Card>

      <Card
        title={t('mixer.ducking')}
        label={t('mixer.duckOf', n)}
        on={c.duck.on}
        disabled={off}
        onToggle={(on) => set({ duck: { on } })}
        className=""
        footer={
          c.kind === 'input' && (
            <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-2.5">
              <Typography size={11} tone="secondary">
                {t('mixer.ducksOthers')}
              </Typography>
              <Switch
                label={t('mixer.ducksOthersOf', n)}
                checked={c.ducksOthers}
                disabled={off}
                onChange={(ducksOthers) => set({ ducksOthers })}
              />
            </div>
          )
        }
      >
        <Typography size={11} tone="muted" leading="snug">
          {t('mixer.duckHelp')}
        </Typography>
        <div className="flex items-start justify-center gap-3">
          <Knob
            label={t('mixer.duckAmount')}
            pos={lin(c.duck.amountDb, 3, 40)}
            onPos={(p) => set({ duck: { amountDb: fromLin(p, 3, 40, 1) } })}
            onReset={() => set({ duck: { amountDb: 12 } })}
            text={`−${c.duck.amountDb} dB`}
            disabled={off}
            step={1 / 37}
          />
          <Knob
            label={t('mixer.duckWhen')}
            pos={lin(c.duck.thresholdDb, -60, -10)}
            onPos={(p) => set({ duck: { thresholdDb: fromLin(p, -60, -10, 1) } })}
            onReset={() => set({ duck: { thresholdDb: -40 } })}
            text={signed(c.duck.thresholdDb)}
            disabled={off}
            step={1 / 50}
          />
        </div>
      </Card>
    </div>
  );
}
