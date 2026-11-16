import { useTranslation } from 'react-i18next';
import { newId, type BackgroundRef, type MediaItem } from '@lampstand/core';
import { Button } from '@lampstand/ui';
import { openAdhoc } from '../lib/actions';
import { libraryDragSource } from '../lib/libraryDrag';
import { cmd, q } from '../lib/api';
import { addItemToService, attempt, toast, useStore } from '../lib/store';
import { thumbUrl } from '../../shared/mediaUrl';
import { BackgroundTile } from './BackgroundTile';
import { REVEAL, Tile } from './cards';
import { SoonFeature } from './Soon';
import i18n from '../i18n';
import { BUILT_IN_BACKGROUNDS } from '../constants';

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
      className="h-full w-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.02]"
      loading="lazy"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-[var(--text-3)]">
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
            <div key={m.id} className="group relative">
              <Tile
                label={m.name}
                onClick={() => void openAdhoc(item, 'preview')}
                onDoubleClick={() => addToService({ ...item, id: newId() })}
                {...libraryDragSource(() => item)}
              >
                <Thumb m={m} />
              </Tile>
              <button
                type="button"
                className={`absolute bottom-0 right-0 bg-[var(--surface-1)] pl-1.5 text-[12px] text-[var(--text-3)] hover:text-[var(--tally-program)] ${REVEAL}`}
                onClick={() => void cmd('media.delete', { id: m.id })}
              >
                {t('media.delete')}
              </button>
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
      {(['motion', 'still'] as const).map((group) => (
        <section key={group} className={group === 'still' ? 'mt-5' : ''}>
          <h3 className="section-label pb-2">{t(`media.${group}`)}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {BUILT_IN_BACKGROUNDS.filter(
              (b) => (b.ref.kind === 'generated') === (group === 'motion'),
            ).map((b) => (
              <BackgroundTile
                key={b.name}
                name={b.name}
                bgRef={b.ref}
                title={t('media.setBackground')}
                onPick={() => setBg(b.ref)}
              />
            ))}
          </div>
        </section>
      ))}
      <div className="mt-6 flex items-center justify-between pb-2">
        <h3 className="section-label">{t('media.yours')}</h3>
        <Button size="sm" variant="ghost" onClick={() => void importMedia(true)}>
          + {t('media.addBackground')}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
        {media.map((m) => (
          <Tile
            key={m.id}
            label={m.name}
            title={t('media.setBackground')}
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
          </Tile>
        ))}
      </div>
    </div>
  );
}
