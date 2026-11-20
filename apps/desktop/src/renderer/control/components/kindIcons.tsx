import {
  BookOpen,
  Film,
  Globe,
  Heading,
  Megaphone,
  Music,
  Presentation,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { ServiceItem } from '@lampstand/core';

export const KIND_ICON: Record<ServiceItem['kind'], LucideIcon> = {
  song: Music,
  scripture: BookOpen,
  media: Film,
  presentation: Presentation,
  announcements: Megaphone,
  countdown: Timer,
  header: Heading,
  web: Globe,
};

/** Neutral tints per kind — never red/green (reserved for tally). */
const KIND_TINT: Record<ServiceItem['kind'], string> = {
  song: '#8b7cf6',
  scripture: '#e8b04b',
  media: '#4cc0e8',
  presentation: '#9aa3b8',
  announcements: '#e88a4b',
  countdown: '#5b8def',
  header: '#9aa3b8',
  web: '#4fb3a8',
};

/** A rounded square with a tinted icon. `color` is a hex tint; omit it for the accent gold. */
export function IconTile({
  icon: Icon,
  color,
  size = 28,
}: {
  icon: LucideIcon;
  color?: string;
  size?: number;
}) {
  const style = color
    ? { width: size, height: size, background: `${color}1f`, color }
    : { width: size, height: size, background: 'var(--accent-soft)', color: 'var(--accent)' };
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[7px]"
      style={style}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2} />
    </span>
  );
}

/** Icon tile for a service item kind. */
export function KindTile({ kind, size = 28 }: { kind: ServiceItem['kind']; size?: number }) {
  return <IconTile icon={KIND_ICON[kind]} color={KIND_TINT[kind]} size={size} />;
}
