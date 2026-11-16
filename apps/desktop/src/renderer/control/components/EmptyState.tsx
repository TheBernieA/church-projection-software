import type { ReactNode } from 'react';
import { Text } from '@lampstand/ui';

/** Centred hint for a workspace with nothing to show yet. */
export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-[var(--text-3)]">{icon}</div>
      <Text as="p" size={14} tone="secondary" weight="semibold">
        {title}
      </Text>
      {body && (
        <Text as="p" variant="caption" leading="relaxed" className="max-w-sm">
          {body}
        </Text>
      )}
    </div>
  );
}
