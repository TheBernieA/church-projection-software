import { useTranslation } from 'react-i18next';
import { newId, type BackgroundRef } from '@lampstand/core';
import { Button, Typography } from '@lampstand/ui';
import { libraryDragSource } from '../lib/libraryDrag';

import { useStore } from '../lib/store';
import { BackgroundTile } from './BackgroundTile';
import { Tile } from './cards';
import { BUILT_IN_BACKGROUNDS } from '../constants';
import { Thumb } from './media/MediaBrowser';
import { setBackground } from '../lib/actions';
import { importMedia } from '../lib/mediaPlaylists';

export function BackgroundsPanel() {
  const { t } = useTranslation();
  const media = useStore((s) => s.media).filter((m) => m.isBackground && m.kind !== 'audio');
  const setBg = (ref: BackgroundRef): void => void setBackground(ref);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
      {(['motion', 'still'] as const).map((group) => (
        <section key={group} className={group === 'still' ? 'mt-5' : ''}>
          <Typography as="h3" variant="overline" className="pb-2">
            {t(`media.${group}`)}
          </Typography>
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
        <Typography as="h3" variant="overline">
          {t('media.yours')}
        </Typography>
        <Button size="sm" variant="ghost" onClick={() => void importMedia({ asBackground: true })}>
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
