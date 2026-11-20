import { useTranslation } from 'react-i18next';
import type { StreamSettings } from '@lampstand/core';
import { Button } from '@lampstand/ui';

type Picture = StreamSettings['picture'];
type Edge = Picture['wordsEdge'];
type Align = Picture['wordsAlign'];

const SPOTS: { edge: Edge; align: Align }[] = [
  { edge: 'top', align: 'left' },
  { edge: 'top', align: 'center' },
  { edge: 'top', align: 'right' },
  { edge: 'bottom', align: 'left' },
  { edge: 'bottom', align: 'center' },
  { edge: 'bottom', align: 'right' },
];

/**
 * Where the stream's lower third sits: six spots (top or bottom, left, centre or right), each
 * a little picture of the screen with the words' band where they'd go.
 */
export function WordsPlacement({
  edge,
  align,
  onChange,
}: {
  edge: Edge;
  align: Align;
  onChange: (p: { wordsEdge: Edge; wordsAlign: Align }) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t('streaming.wordsPlace')}
      className="grid w-[168px] shrink-0 grid-cols-3 gap-1"
    >
      {SPOTS.map((s) => {
        const on = s.edge === edge && s.align === align;
        const name = t(`streaming.place.${s.edge}.${s.align}`);
        return (
          <Button
            key={`${s.edge}-${s.align}`}
            variant="bare"
            role="radio"
            aria-checked={on}
            aria-label={name}
            title={name}
            onClick={() => onChange({ wordsEdge: s.edge, wordsAlign: s.align })}
            className={`relative aspect-video cursor-pointer rounded-[4px] transition-[box-shadow,background-color] ${
              on
                ? 'bg-[var(--accent-soft)] shadow-[0_0_0_1.5px_var(--accent)]'
                : 'bg-[var(--surface-3)] shadow-[0_0_0_1px_var(--hairline)] hover:shadow-[0_0_0_1px_var(--text-3)]'
            }`}
          >
            {/* The words' band, where it would sit. */}
            <span
              aria-hidden
              className={`absolute h-[22%] w-[46%] rounded-[1.5px] ${
                on ? 'bg-[var(--accent)]' : 'bg-[var(--text-3)]'
              } ${s.edge === 'top' ? 'top-[14%]' : 'bottom-[14%]'} ${
                s.align === 'left'
                  ? 'left-[10%]'
                  : s.align === 'right'
                    ? 'right-[10%]'
                    : 'left-1/2 -translate-x-1/2'
              }`}
            />
          </Button>
        );
      })}
    </div>
  );
}
