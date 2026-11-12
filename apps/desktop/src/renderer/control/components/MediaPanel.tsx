import { useTranslation } from 'react-i18next';
import { newId, type BackgroundRef, type MediaItem } from '@lampstand/core';
import { gradientCss } from '@lampstand/renderer';
import { Button } from '@lampstand/ui';
import { openAdhoc } from '../lib/actions';
import { libraryDragSource } from '../lib/library-drag';
import { cmd, q } from '../lib/api';
import { addItemToService, attempt, toast, useStore } from '../lib/store';
import { thumbUrl } from '../../shared/media-url';
import i18n from '../i18n';

async function importMedia(asBackground: boolean): Promise<void> {
  const r = await attempt(() => q('media.import', { asBackground }), 'errors.import');
  if (r?.imported) toast(i18n.t('media.imported', { count: r.imported }));
  if (r?.rejected) toast(i18n.t('media.rejected', { count: r.rejected }), 'warning');
}

function Thumb({ m }: { m: MediaItem }) {
  return m.hasThumbnail ? (
    <img
      src={thumbUrl(m.id)}
      alt=""
      className="aspect-video w-full bg-black object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      loading="lazy"
    />
  ) : (
    <div className="flex aspect-video w-full items-center justify-center bg-black text-[var(--text-3)]">
      {m.kind}
    </div>
  );
}

/** User media: images & video, copied into the library (§12). */
export function MediaPanel() {
  const { t } = useTranslation();
  const media = useStore((s) => s.media).filter((m) => !m.isBackground && m.kind !== 'audio');
  const addToService = addItemToService;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-3">
        <Button size="sm" onClick={() => void importMedia(false)}>
          + {t('media.add')}
        </Button>
      </div>
      {media.length === 0 && (
        <p className="px-5 py-3 text-[13px] leading-relaxed text-[var(--text-3)]">
          {t('media.empty')}
        </p>
      )}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-4 pb-4">
        {media.map((m) => {
          const item = {
            id: `adhoc-${m.id}`,
            kind: 'media' as const,
            mediaId: m.id,
            loop: m.kind === 'video',
            autoAdvance: false,
            asBackground: false,
          };
          return (
            <div key={m.id} className="group">
              <button
                type="button"
                className="block w-full overflow-hidden rounded-[8px] shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)]"
                onClick={() => void openAdhoc(item, 'preview')}
                onDoubleClick={() => addToService({ ...item, id: newId() })}
                {...libraryDragSource(() => item)}
              >
                <Thumb m={m} />
              </button>
              <div className="flex items-center gap-1 pt-1.5">
                <span className="truncate text-[12px] text-[var(--text-2)]">{m.name}</span>
                <button
                  type="button"
                  className="ml-auto text-[12px] text-[var(--text-3)] opacity-0 transition-opacity hover:text-[var(--tally-program)] group-hover:opacity-100"
                  onClick={() => void cmd('media.delete', { id: m.id })}
                >
                  {t('media.delete')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Built-in generated backgrounds: resolution-independent, license-free (§12). */
export const BUILT_IN_BACKGROUNDS: { name: string; ref: BackgroundRef }[] = [
  {
    name: 'Midnight',
    ref: {
      kind: 'gradient',
      angle: 160,
      stops: [
        { color: '#1B2140', pos: 0 },
        { color: '#0B0E1A', pos: 100 },
      ],
    },
  },
  {
    name: 'Aurora',
    ref: {
      kind: 'generated',
      preset: 'aurora',
      colors: ['#2A1B4F', '#0E3B5C', '#5A1F3D'],
      speed: 0.6,
    },
  },
  {
    name: 'Ember',
    ref: {
      kind: 'generated',
      preset: 'glow',
      colors: ['#5C1F0E', '#8A3B12', '#1A0B08'],
      speed: 0.5,
    },
  },
  {
    name: 'Ocean drift',
    ref: {
      kind: 'generated',
      preset: 'drift',
      colors: ['#06283D', '#1363DF', '#0B1D33'],
      speed: 0.5,
    },
  },
  {
    name: 'Advent',
    ref: {
      kind: 'gradient',
      angle: 135,
      stops: [
        { color: '#2D1B4E', pos: 0 },
        { color: '#4A2C6F', pos: 50 },
        { color: '#120A1F', pos: 100 },
      ],
    },
  },
  {
    name: 'Easter dawn',
    ref: {
      kind: 'gradient',
      angle: 180,
      stops: [
        { color: '#F6C177', pos: 0 },
        { color: '#C76B98', pos: 55 },
        { color: '#2E2A5A', pos: 100 },
      ],
    },
  },
  {
    name: 'Forest',
    ref: {
      kind: 'generated',
      preset: 'aurora',
      colors: ['#0F3D2E', '#1E5F3A', '#0A1F17'],
      speed: 0.4,
    },
  },
  { name: 'Black', ref: { kind: 'color', color: '#000000' } },
];

export function swatchCss(ref: BackgroundRef): string {
  if (ref.kind === 'gradient') return gradientCss(ref);
  if (ref.kind === 'color') return ref.color;
  if (ref.kind === 'generated') return `linear-gradient(135deg, ${ref.colors.join(', ')})`;
  return '#000';
}

export function BackgroundsPanel() {
  const { t } = useTranslation();
  const media = useStore((s) => s.media).filter((m) => m.isBackground && m.kind !== 'audio');
  const setBg = (ref: BackgroundRef): void =>
    void cmd('live.setBackground', { background: { ref } });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <h3 className="section-label pb-2">{t('media.builtIn')}</h3>
      <div className="grid grid-cols-2 gap-3">
        {BUILT_IN_BACKGROUNDS.map((b) => (
          <button
            key={b.name}
            type="button"
            title={t('media.setBackground')}
            onClick={() => setBg(b.ref)}
            className="group text-left"
          >
            <div
              className="aspect-video w-full rounded-[8px] shadow-[var(--shadow-1)] transition-transform duration-150 will-change-transform group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-2)]"
              style={{ background: swatchCss(b.ref) }}
            />
            <span className="mt-1.5 block text-[12px] text-[var(--text-2)]">{b.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between pb-2">
        <h3 className="section-label">{t('media.yours')}</h3>
        <Button size="sm" variant="ghost" onClick={() => void importMedia(true)}>
          + {t('media.addBackground')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {media.map((m) => (
          <button
            key={m.id}
            type="button"
            title={t('media.setBackground')}
            className="group text-left"
            {...libraryDragSource(() => ({
              id: newId(),
              kind: 'media',
              mediaId: m.id,
              loop: true,
              autoAdvance: false,
              asBackground: true,
            }))}
            onClick={() =>
              setBg(
                m.kind === 'video'
                  ? { kind: 'video', mediaId: m.id, loop: true }
                  : { kind: 'image', mediaId: m.id },
              )
            }
          >
            <Thumb m={m} />
            <span className="mt-1.5 block truncate text-[12px] text-[var(--text-2)]">{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
