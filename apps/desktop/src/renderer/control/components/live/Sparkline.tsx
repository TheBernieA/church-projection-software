/** A tiny line chart of recent values (the last two minutes of a stream measure). */
export function Sparkline({
  values,
  max,
  color = 'var(--accent)',
  className = 'h-6 w-full',
}: {
  values: readonly number[];
  /** Top of the scale (defaults to the largest value). */
  max?: number;
  color?: string;
  className?: string;
}) {
  const W = 120;
  const H = 24;
  if (values.length < 2) return <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className={className} />;
  const top = Math.max(max ?? 0, ...values, 1e-6);
  const step = W / (values.length - 1);
  const pts = values.map(
    (v, i) => `${(i * step).toFixed(1)},${(H - 2 - (v / top) * (H - 4)).toFixed(1)}`,
  );
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className}>
      <polyline
        points={`0,${H} ${pts.join(' ')} ${W},${H}`}
        fill={color}
        fillOpacity={0.12}
        stroke="none"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
