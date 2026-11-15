import { useState } from 'react';
import { Plus, Trash2, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type Overlay, type PropPosition, type Settings } from '@lampstand/core';
import { Button, IconButton } from '@lampstand/ui';
import { hideOverlay, saveSettings, showOverlay } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { thumbUrl } from '../../../shared/media-url';
import { Select } from '../Select';

type Prop = Settings['props'][number];

const POSITIONS: PropPosition[] = [
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
  'lower-third',
  'full',
];

const overlayId = (p: Prop): string => `prop-${p.id}`;

/** The overlay a prop puts on screen (its picture's kind is looked up in the library). */
function toOverlay(p: Prop, kindOf: (id: string) => string | undefined): Overlay {
  const kind = p.mediaId ? kindOf(p.mediaId) : undefined;
  const o: Overlay = { id: overlayId(p), kind: 'prop', text: p.text ?? '', position: p.position };
  if (p.mediaId && (kind === 'image' || kind === 'video')) {
    o.mediaId = p.mediaId;
    o.mediaKind = kind;
  }
  return o;
}

/** Props: logos, images, videos or text overlaid on everything; click to show or hide. */
export function PropsBin() {
  const { t } = useTranslation();
  const props = useStore((s) => s.settings?.props);
  const media = useStore((s) => s.media);
  const overlays = useStore((s) => s.live?.program.overlays);
  const [adding, setAdding] = useState(false);
  const pictures = media.filter((m) => m.kind === 'image' || m.kind === 'video');
  const kindOf = (id: string): string | undefined => media.find((m) => m.id === id)?.kind;
  const list = props ?? [];
  const save = (next: Prop[]): void => void saveSettings({ props: next });
  const isLive = (p: Prop): boolean => !!overlays?.some((o) => o.id === overlayId(p));
  const toggle = (p: Prop): void =>
    void (isLive(p) ? hideOverlay(overlayId(p)) : showOverlay(toOverlay(p, kindOf)));

  return (
    <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-3">
      {list.map((p) => {
        const on = isLive(p);
        const m = p.mediaId ? media.find((x) => x.id === p.mediaId) : undefined;
        return (
          <div key={p.id} className="group flex w-[168px] shrink-0 flex-col gap-1.5">
            <button
              type="button"
              aria-pressed={on}
              aria-label={p.name}
              onClick={() => toggle(p)}
              style={on ? { boxShadow: 'var(--tally-program-glow)' } : undefined}
              className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[5px] bg-[repeating-conic-gradient(#2a2a2d_0%_25%,#202022_0%_50%)] bg-[length:16px_16px] shadow-[var(--shadow-1)]"
            >
              {m?.hasThumbnail ? (
                <img src={thumbUrl(m.id)} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-[13px] font-bold text-white">
                  {p.text || m?.name || p.name}
                </span>
              )}
              {on && (
                <span className="absolute right-1.5 top-1.5 rounded-[4px] bg-[var(--tally-program)] px-1 text-[9px] font-bold text-white">
                  LIVE
                </span>
              )}
            </button>
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{p.name}</span>
              <IconButton
                size="xs"
                aria-label={t('props.delete', { name: p.name })}
                className="opacity-0 group-hover:opacity-100"
                onClick={() => {
                  if (on) void hideOverlay(overlayId(p));
                  save(list.filter((x) => x.id !== p.id));
                }}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
            <Select<PropPosition>
              size="sm"
              aria-label={t('props.position')}
              value={p.position}
              onChange={(position) => {
                const next = { ...p, position };
                save(list.map((x) => (x.id === p.id ? next : x)));
                if (on) void showOverlay(toOverlay(next, kindOf));
              }}
              options={POSITIONS.map((v) => ({ value: v, label: t(`props.positions.${v}`) }))}
            />
          </div>
        );
      })}
      {adding ? (
        <NewProp
          pictures={pictures}
          onCancel={() => setAdding(false)}
          onCreate={(p) => {
            save([...list, p]);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex aspect-video w-[168px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 self-start rounded-[5px] border-2 border-dashed border-[var(--hairline-strong)] text-[12px] font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          <Plus size={18} />
          {t('props.new')}
        </button>
      )}
    </div>
  );
}

function NewProp({
  pictures,
  onCreate,
  onCancel,
}: {
  pictures: { id: string; name: string }[];
  onCreate: (p: Prop) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const TEXT = '__text__';
  const [source, setSource] = useState<string>(pictures[0]?.id ?? TEXT);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const picture = pictures.find((m) => m.id === source);
  const ready = source === TEXT ? !!text.trim() : !!picture;
  return (
    <form
      className="flex w-[260px] shrink-0 flex-col gap-2 rounded-[6px] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-1)]"
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
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" type="button" onClick={onCancel}>
          {t('song.cancel')}
        </Button>
        <Button size="xs" variant="primary" type="submit" disabled={!ready}>
          {t('props.create')}
        </Button>
      </div>
    </form>
  );
}
