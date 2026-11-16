import { useEffect } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toast, useStore } from '../lib/store';

const ICON = { info: Info, warning: TriangleAlert, error: CircleAlert } as const;
const TONE = {
  info: 'var(--text-2)',
  warning: 'var(--warning)',
  error: 'var(--tally-program)',
} as const;

/** Non-intrusive notices: compact, bottom-left (never over the monitors), the latest three. */
export function Toasts() {
  const { t } = useTranslation();
  const toasts = useStore((s) => s.toasts);
  useEffect(() => api.onNotice((n) => toast(t(`notice.${n.key}`, n.params ?? {}), n.level)), [t]);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-9 left-3 z-50 flex w-[340px] flex-col gap-1.5"
    >
      {toasts.slice(-3).map((x) => {
        const Icon = ICON[x.level];
        return (
          <div
            key={x.id}
            role={x.level === 'error' ? 'alert' : 'status'}
            className="flex items-start gap-2.5 rounded-[10px] bg-[var(--surface-3)] px-3 py-2.5 text-ui-13 shadow-[var(--shadow-3),var(--highlight-top)] animate-[ls-toast_200ms_var(--ease-out)]"
          >
            <Icon size={15} className="mt-px shrink-0" style={{ color: TONE[x.level] }} />
            <span className="leading-snug">{x.text}</span>
          </div>
        );
      })}
    </div>
  );
}
