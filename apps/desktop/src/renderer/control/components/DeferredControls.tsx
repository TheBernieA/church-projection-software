import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/**
 * Range slider that stays local while dragging and commits once on release. Committing a value
 * like UI scale re-lays-out the whole window, so doing it on every pointer move made dragging lag.
 */
export function CommitSlider({
  value,
  onCommit,
  format,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onCommit: (v: number) => void;
  format?: (v: number) => string;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-3">
      <input
        {...rest}
        type="range"
        value={shown}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className={`h-1.5 w-48 cursor-pointer accent-[var(--accent)] ${rest.className ?? ''}`}
      />
      {format && (
        <span className="tnum w-12 text-right text-[13px] text-[var(--text-2)]">
          {format(shown)}
        </span>
      )}
    </div>
  );
}

/**
 * Text/number input that edits locally and commits after a short pause or on blur, instead of
 * sending a settings update (and rebuilding every slide) on each keystroke.
 */
export function DeferredInput({
  value,
  onCommit,
  delay = 400,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (v: string) => void;
  delay?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flush = (v: string): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (v !== value) latest.current(v);
  };
  return (
    <input
      {...rest}
      value={draft ?? value}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(v), delay);
      }}
      onBlur={() => {
        if (draft !== null) flush(draft);
        setDraft(null);
      }}
    />
  );
}
