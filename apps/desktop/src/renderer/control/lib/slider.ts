import { useEffect, useRef, useState, type ChangeEvent } from 'react';

/**
 * A slider value held locally while the operator drags, committed exactly once when they let
 * go: on the native `change` event, which the browser fires once per drag (on release, even
 * off the slider) and once per arrow key. React's `onChange` is really `input`, so it only
 * updates the draft.
 *
 * The draft is tagged with the playback state it was made against. It keeps showing the
 * dropped position until the commit comes back as new shared state, then gives way to the
 * real playhead; no snap back to the old position, and never stuck.
 */
export function useDraft(resetKey: unknown, commit: (value: number) => void) {
  const [held, setHeld] = useState<{ key: unknown; value: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onCommit = (): void => latest.current(Number(el.value));
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, []);
  const draft = held && held.key === resetKey ? held.value : null;
  return {
    draft,
    props: {
      ref: input,
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setHeld({ key: resetKey, value: Number(e.target.value) }),
    },
  };
}
