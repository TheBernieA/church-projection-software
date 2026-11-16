import { useState } from 'react';
import { Trash2, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type Overlay, type PropPosition } from '@lampstand/core';
import { IconButton, TallyTag, Text } from '@lampstand/ui';
import { hideOverlay, showOverlay } from '../../lib/actions';
import {
  isPicture,
  useMediaKindOf,
  useOverlayLive,
  usePictures,
  useSettingsList,
} from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { thumbUrl } from '../../../shared/mediaUrl';
import { AddCard, BIN_CARD, BinRow, FormActions, REVEAL } from '../cards';
import { Select } from '../Select';
import { type Prop } from '../../types';
import { PROP_POSITIONS } from '../../constants';

const overlayId = (p: Prop): string => `prop-${p.id}`;

/** The overlay a prop puts on screen (its picture's kind is looked up in the library). */
function toOverlay(p: Prop, kindOf: (id: string) => string | undefined): Overlay {
  const kind = p.mediaId ? kindOf(p.mediaId) : undefined;
  const o: Overlay = { id: overlayId(p), kind: 'prop', text: p.text ?? '', position: p.position };
  if (p.mediaId && isPicture(kind)) {
    o.mediaId = p.mediaId;
    o.mediaKind = kind;
  }
  return o;
}

/** One prop: click the picture to show or hide it; change its position live. */
function PropCard({
  prop,
  onChange,
  onDelete,
}: {
  prop: Prop;
  onChange: (next: Prop) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const kindOf = useMediaKindOf();
  const on = useOverlayLive(overlayId(prop));
  const m = useStore((s) =>
    prop.mediaId ? s.media.find((x) => x.id === prop.mediaId) : undefined,
  );
  return (
    <div className="group flex w-[168px] shrink-0 flex-col gap-1.5">
      <button
        type="button"
        aria-pressed={on}
        aria-label={prop.name}
        onClick={() =>
          void (on ? hideOverlay(overlayId(prop)) : showOverlay(toOverlay(prop, kindOf)))
        }
        style={on ? { boxShadow: 'var(--tally-program-glow)' } : undefined}
        className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[5px] bg-[repeating-conic-gradient(#2a2a2d_0%_25%,#202022_0%_50%)] bg-[length:16px_16px] shadow-[var(--shadow-1)]"
      >
        {m?.hasThumbnail ? (
          <img src={thumbUrl(m.id)} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Text size={13} tone="white" weight="bold" className="px-2 text-center">
            {prop.text || m?.name || prop.name}
          </Text>
        )}
        {on && <TallyTag tone="program">LIVE</TallyTag>}
      </button>
      <div className="flex items-center gap-1">
        <Text size={12} weight="medium" truncate className="min-w-0 flex-1">
          {prop.name}
        </Text>
        <IconButton
          size="xs"
          aria-label={t('props.delete', { name: prop.name })}
          className={REVEAL}
          onClick={() => {
            void hideOverlay(overlayId(prop));
            onDelete();
          }}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
      <Select<PropPosition>
        size="sm"
        aria-label={t('props.position')}
        value={prop.position}
        onChange={(position) => {
          const next = { ...prop, position };
          onChange(next);
          if (on) void showOverlay(toOverlay(next, kindOf));
        }}
        options={PROP_POSITIONS.map((v) => ({ value: v, label: t(`props.positions.${v}`) }))}
      />
    </div>
  );
}

function NewProp({ onCreate, onCancel }: { onCreate: (p: Prop) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const pictures = usePictures();
  const TEXT = '__text__';
  const [source, setSource] = useState<string>(pictures[0]?.id ?? TEXT);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const picture = pictures.find((m) => m.id === source);
  const ready = source === TEXT ? !!text.trim() : !!picture;
  return (
    <form
      className={`${BIN_CARD} w-[260px]`}
      aria-label={t('props.new')}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const p: Prop = {
          id: newId(),
          name: name.trim() || (picture?.name ?? text.trim()).slice(0, 60),
          position: 'top-right',
        };
        if (source === TEXT) p.text = text.trim();
        else p.mediaId = source;
        onCreate(p);
      }}
    >
      <Select<string>
        size="sm"
        aria-label={t('props.source')}
        value={source}
        onChange={setSource}
        options={[
          ...pictures.map((m) => ({ value: m.id, label: m.name })),
          { value: TEXT, label: t('props.text'), leading: <Type size={13} /> },
        ]}
      />
      {source === TEXT && (
        <input
          className="field !h-8"
          aria-label={t('props.textLabel')}
          placeholder={t('props.textLabel')}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      )}
      <input
        className="field !h-8"
        aria-label={t('props.name')}
        placeholder={t('props.name')}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
      />
      <FormActions onCancel={onCancel} submitLabel={t('props.create')} disabled={!ready} />
    </form>
  );
}

/** Props: logos, images, videos or text overlaid on everything; click to show or hide. */
export function PropsBin() {
  const { t } = useTranslation();
  const [props, save] = useSettingsList('props');
  const [adding, setAdding] = useState(false);
  return (
    <BinRow>
      {props.map((p) => (
        <PropCard
          key={p.id}
          prop={p}
          onChange={(next) => save(props.map((x) => (x.id === p.id ? next : x)))}
          onDelete={() => save(props.filter((x) => x.id !== p.id))}
        />
      ))}
      {adding ? (
        <NewProp
          onCancel={() => setAdding(false)}
          onCreate={(p) => {
            save([...props, p]);
            setAdding(false);
          }}
        />
      ) : (
        <AddCard
          label={t('props.new')}
          onClick={() => setAdding(true)}
          className="aspect-video w-[168px]"
        />
      )}
    </BinRow>
  );
}
