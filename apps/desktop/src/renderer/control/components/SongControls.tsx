import { Languages, Shuffle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem, Song } from '@lampstand/core';
import { groupColor } from '../lib/slides';
import { patchItem } from '../lib/store';
import { Select } from './Select';

type SongItem = Extract<ServiceItem, { kind: 'song' }>;

const NO_TRANSLATION = '__none__';

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
            <li
              key={`${id}-${i}`}
              title={section.label}
              className="shrink-0 rounded-[3px] px-1 text-[10px] font-bold text-white"
              style={{ background: groupColor(section.label) }}
            >
              {shortLabel(section.label)}
            </li>
          );
        })}
      </ol>
      {languages.length > 0 && (
        <div className="w-32">
          <Select
            size="sm"
            aria-label={t('slides.translation')}
            value={item.translationLang ?? NO_TRANSLATION}
            onChange={(v) =>
              patchItem<SongItem>(item, {
                translationLang: v === NO_TRANSLATION ? undefined : v,
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

/** "Verse 1" → "V1", "Chorus" → "C", "Pre-chorus" → "PC". */
function shortLabel(label: string): string {
  const num = /\d+/.exec(label)?.[0] ?? '';
  const words = label
    .replace(/\d+/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);
  return (words.map((w) => w[0]?.toUpperCase() ?? '').join('') || label.slice(0, 2)) + num;
}
