import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

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
