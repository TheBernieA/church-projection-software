import { useTranslation } from 'react-i18next';
import { newId, type BackgroundRef, type MediaItem } from '@lampstand/core';
import { Button } from '@lampstand/ui';
import { openAdhoc } from '../lib/actions';
import { libraryDragSource } from '../lib/libraryDrag';
import { cmd, q } from '../lib/api';
import { addItemToService, attempt, toast, useStore } from '../lib/store';
import { thumbUrl } from '../../shared/mediaUrl';
import { SoonFeature } from './Soon';
import i18n from '../i18n';
import { BUILT_IN_BACKGROUNDS } from '../constants';
import { swatchCss } from '../lib/utils';

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
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-3">
        <Button size="sm" onClick={() => void importMedia(false)}>
          + {t('media.add')}
        </Button>
        <span className="mx-1 h-4 w-px bg-[var(--hairline-strong)]" aria-hidden />
        <SoonFeature id="media-playlists" label={t('media.soon.playlists')} />
        <SoonFeature id="media-cues" label={t('media.soon.cues')} />
        <SoonFeature id="playback-markers" label={t('media.soon.markers')} />
        <SoonFeature id="stock-media" label={t('media.soon.stock')} />
      </div>
      {media.length === 0 && (
        <p className="px-5 py-3 text-[13px] leading-relaxed text-[var(--text-3)]">
          {t('media.empty')}
        </p>
      )}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 overflow-y-auto px-4 pb-4">
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

export function BackgroundsPanel() {
  const { t } = useTranslation();
  const media = useStore((s) => s.media).filter((m) => m.isBackground && m.kind !== 'audio');
  const setBg = (ref: BackgroundRef): void =>
    void cmd('live.setBackground', { background: { ref } });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
      <h3 className="section-label pb-2">{t('media.builtIn')}</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
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
