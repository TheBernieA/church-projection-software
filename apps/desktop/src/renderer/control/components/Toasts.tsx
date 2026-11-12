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

/** Non-intrusive notices (bottom-left, never over the monitors). */
export function Toasts() {
  const { t } = useTranslation();
  const toasts = useStore((s) => s.toasts);
  useEffect(() => api.onNotice((n) => toast(t(`notice.${n.key}`, n.params ?? {}), n.level)), [t]);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-20 z-50 flex w-[380px] flex-col gap-2"
    >
      {toasts.map((x) => {
        const Icon = ICON[x.level];
        return (
          <div
            key={x.id}
            role={x.level === 'error' ? 'alert' : 'status'}
            className="flex items-start gap-3 rounded-[12px] bg-[var(--surface-3)] px-4 py-3 text-[13px] shadow-[var(--shadow-3)]"
          >
            <Icon size={17} className="mt-px shrink-0" style={{ color: TONE[x.level] }} />
            <span className="leading-snug">{x.text}</span>
          </div>
        );
      })}
    </div>
  );
}
