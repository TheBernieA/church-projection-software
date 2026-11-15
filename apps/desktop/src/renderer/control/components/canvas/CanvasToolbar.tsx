import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Image as ImageIcon,
  Minus,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@lampstand/ui';
import { usePictures } from '../../lib/hooks';
import { editObjects, newObject, type ObjectKind, type TextItem } from '../../lib/objects';
import { useStore } from '../../lib/store';
import { Select } from '../Select';

const ADD: { kind: Exclude<ObjectKind, 'image'>; icon: typeof Type }[] = [
  { kind: 'text', icon: Type },
  { kind: 'rect', icon: Square },
  { kind: 'ellipse', icon: Circle },
  { kind: 'line', icon: Minus },
];

/** Canvas tools: add a text box, shape, line or picture; arrange or delete the selection. */
export function CanvasToolbar({ item, index }: { item: TextItem; index: number }) {
  const { t } = useTranslation();
  const pictures = usePictures();
  const selected = useStore((s) => s.editObjectId);
  const objects = item.slides[index]?.objects ?? [];
  const at = objects.findIndex((o) => o.id === selected);
  const add = (kind: ObjectKind, mediaId?: string): void => {
    const o = newObject(kind, mediaId);
    editObjects(item, index, (os) => [...os, o]);
    useStore.setState({ editObjectId: o.id });
  };
  const arrange = (to: number): void =>
    editObjects(item, index, (os) => {
      const next = [...os];
      const [o] = next.splice(at, 1);
      if (o) next.splice(Math.max(0, Math.min(next.length, to)), 0, o);
      return next;
    });
  return (
    <div
      role="toolbar"
      aria-label={t('canvas.tools')}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--hairline)] px-3 py-1.5"
    >
      {ADD.map(({ kind, icon: Icon }) => (
        <Button
          key={kind}
          size="sm"
          variant="ghost"
          icon={<Icon size={14} />}
          onClick={() => add(kind)}
        >
          {t(`canvas.kinds.${kind}`)}
        </Button>
      ))}
      <div className="w-44">
        <Select<string>
          size="sm"
          aria-label={t('canvas.addPicture')}
          value=""
          placeholder={t('canvas.addPicture')}
          onChange={(id) => add('image', id)}
          options={pictures.map((m) => ({
            value: m.id,
            label: m.name,
            leading: <ImageIcon size={13} />,
          }))}
        />
      </div>
      <span className="mx-1 h-5 w-px bg-[var(--hairline-strong)]" aria-hidden />
      <IconButton
        size="sm"
        aria-label={t('canvas.forward')}
        disabled={at < 0 || at === objects.length - 1}
        onClick={() => arrange(at + 1)}
      >
        <ArrowUpToLine size={15} />
      </IconButton>
      <IconButton
        size="sm"
        aria-label={t('canvas.backward')}
        disabled={at <= 0}
        onClick={() => arrange(at - 1)}
      >
        <ArrowDownToLine size={15} />
      </IconButton>
      <IconButton
        size="sm"
        aria-label={t('canvas.delete')}
        disabled={at < 0}
        onClick={() => {
          editObjects(item, index, (os) => os.filter((o) => o.id !== selected));
          useStore.setState({ editObjectId: null });
        }}
      >
        <Trash2 size={15} />
      </IconButton>
      <span className="ml-auto text-[11px] text-[var(--text-3)]">{t('canvas.hint')}</span>
    </div>
  );
}
