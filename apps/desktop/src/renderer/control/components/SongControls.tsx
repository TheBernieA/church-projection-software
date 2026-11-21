import { Languages, Minus, Music2, Plus, Shuffle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Song } from '@lampstand/core';
import { hasChords, transposeChord } from '@lampstand/lyrics';
import { IconButton, Typography } from '@lampstand/ui';
import { groupColor } from '../lib/slides';
import { refreshLiveSlide } from '../lib/actions';
import { patchItem } from '../lib/store';
import { Select } from './Select';
import { NO_TRANSLATION } from '../constants';
import { type SongItem } from '../types';
import { shortLabel } from '../lib/utils';

/** Per-item song choices in the slide grid header: arrangement, translation. */
export function SongControls({ item, song }: { item: SongItem; song: Song }) {
  const { t } = useTranslation();
  const arrangementId =
    song.arrangements.find((a) => a.id === item.arrangementId)?.id ?? song.defaultArrangementId;
  const arrangement = song.arrangements.find((a) => a.id === arrangementId);
  const order = arrangement?.sectionOrder.length
    ? arrangement.sectionOrder
    : song.sections.map((s) => s.id);
  const languages = Object.keys(song.translations ?? {});
  const chorded = song.sections.some((s) => s.lines.some(hasChords));
  const transpose = item.transpose ?? 0;
  const shift = (d: number): void => {
    // Wrap within an octave (-6..+5), from the latest value so fast clicks all count.
    patchItem<SongItem>(item, (current) => {
      const next = (((((current.transpose ?? 0) + d) % 12) + 18) % 12) - 6;
      return { transpose: next || undefined };
    });
    void refreshLiveSlide(item.id); // the band's chart updates right away
  };
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {song.arrangements.length > 1 ? (
        <div className="w-40">
          <Select
            size="sm"
            aria-label={t('slides.arrangement')}
            value={arrangementId}
            onChange={(id) => patchItem<SongItem>(item, { arrangementId: id })}
            options={song.arrangements.map((a) => ({
              value: a.id,
              label: a.name,
              leading: <Shuffle size={13} />,
            }))}
          />
        </div>
      ) : null}
      {/* The order at a glance: one coloured chip per section, in the order they'll show. */}
      <ol
        aria-label={t('slides.order')}
        className="hidden min-w-0 items-center gap-0.5 overflow-hidden xl:flex"
      >
        {order.map((id, i) => {
          const section = song.sections.find((s) => s.id === id);
          if (!section) return null;
          return (
            <Typography
              as="li"
              size={10}
              tone="white"
              weight="bold"
              key={`${id}-${i}`}
              title={section.label}
              className="shrink-0 rounded-[3px] px-1"
              style={{ background: groupColor(section.label) }}
            >
              {shortLabel(section.label)}
            </Typography>
          );
        })}
      </ol>
      {chorded && (
        // Chords are for the band (stage display); transposing never changes the room's text.
        <div
          role="group"
          aria-label={t('slides.transpose')}
          className="flex items-center rounded-[var(--radius-control)] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)]"
        >
          <IconButton size="xs" aria-label={t('slides.transposeDown')} onClick={() => shift(-1)}>
            <Minus size={13} />
          </IconButton>
          <Typography
            size={12}
            weight="semibold"
            tabular
            className="flex min-w-12 items-center justify-center gap-1 px-1"
            title={t('slides.transposeHint')}
            data-testid="transpose-value"
          >
            <Music2 size={12} className="text-[var(--text-3)]" />
            {song.key
              ? transposeChord(song.key, transpose)
              : transpose > 0
                ? `+${transpose}`
                : transpose}
          </Typography>
          <IconButton size="xs" aria-label={t('slides.transposeUp')} onClick={() => shift(1)}>
            <Plus size={13} />
          </IconButton>
        </div>
      )}
      {languages.length > 0 && (
        <div className="w-32">
          <Select
            size="sm"
            aria-label={t('slides.translation')}
            // Unset follows the song's default; '' is an explicit "none" over that default.
            value={(item.translationLang ?? song.defaultTranslation) || NO_TRANSLATION}
            onChange={(v) =>
              patchItem<SongItem>(item, {
                translationLang:
                  v === NO_TRANSLATION ? (song.defaultTranslation ? '' : undefined) : v,
              })
            }
            options={[
              { value: NO_TRANSLATION, label: t('slides.noTranslation') },
              ...languages.map((l) => ({
                value: l,
                label: l.toUpperCase(),
                leading: <Languages size={13} />,
              })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
