import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Image as ImageIcon,
  Minus,
  Plus,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { usePictures } from '../../lib/hooks';
import { importMedia } from '../../lib/mediaPlaylists';
import { editObjects, newObject } from '../../lib/objects';
import { useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS } from '../menu';
import { mediaUrl } from '../../../shared/mediaUrl';
import { type ObjectKind, type TextItem } from '../../types';

const ADD: { kind: Exclude<ObjectKind, 'image'>; icon: typeof Type }[] = [
  { kind: 'text', icon: Type },
  { kind: 'rect', icon: Square },
  { kind: 'ellipse', icon: Circle },
  { kind: 'line', icon: Minus },
];

/** One tool in the floating bar: an icon over its short name. */
function Tool({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      variant="bare"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] text-[var(--text-2)] transition-colors disabled:cursor-default disabled:opacity-35 ${
        danger
          ? 'hover:bg-[color-mix(in_srgb,var(--tally-program)_18%,transparent)] hover:text-[var(--tally-program)]'
          : 'hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
      }`}
    >
      {icon}
      <Typography size={10} weight="medium" tone="inherit" truncate className="max-w-full">
        {label}
      </Typography>
    </Button>
  );
}

/** Pictures from the media library, to place on the slide (or import one). */
function PictureTool({ onPick }: { onPick: (mediaId: string) => void }) {
  const { t } = useTranslation();
  const pictures = usePictures();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Tool icon={<ImageIcon size={17} />} label={t('canvas.kinds.image')} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={6}
          className={`${MENU_CLASS} max-h-[360px] w-[280px] overflow-y-auto`}
        >
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t('canvas.addPicture')}
          </DropdownMenu.Label>
          {pictures.length === 0 && (
            <Typography as="p" size={12} tone="muted" leading="snug" className="px-2 py-1.5">
              {t('canvas.noPictures')}
            </Typography>
          )}
          {pictures.map((m) => (
            <DropdownMenu.Item key={m.id} className={ITEM_CLASS} onSelect={() => onPick(m.id)}>
              <img
                src={mediaUrl(m.id)}
                alt=""
                className="h-7 w-12 shrink-0 rounded-[3px] object-cover"
                draggable={false}
              />
              <Typography truncate className="min-w-0">
                {m.name}
              </Typography>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline)]" />
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void importMedia({})}>
            <Plus size={14} />
            {t('canvas.importPicture')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The canvas tools, as a floating bar over the slide: add a text box, shape, line or picture;
 * with something selected, bring it forward, send it back or delete it.
 */
export function CanvasToolbar({ item, index }: { item: TextItem; index: number }) {
  const { t } = useTranslation();
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
      className="flex items-center gap-0.5 rounded-[12px] bg-[var(--surface-1)] p-1 shadow-[0_0_0_1px_var(--hairline-strong),0_10px_30px_rgba(0,0,0,0.35)]"
    >
      {ADD.map(({ kind, icon: Icon }) => (
        <Tool
          key={kind}
          icon={<Icon size={17} />}
          label={t(`canvas.kinds.${kind}`)}
          onClick={() => add(kind)}
        />
      ))}
      <PictureTool onPick={(id) => add('image', id)} />
      <span className="mx-1 h-8 w-px bg-[var(--hairline-strong)]" aria-hidden />
      <Tool
        icon={<ArrowUpToLine size={17} />}
        label={t('canvas.forward')}
        disabled={at < 0 || at === objects.length - 1}
        onClick={() => arrange(at + 1)}
      />
      <Tool
        icon={<ArrowDownToLine size={17} />}
        label={t('canvas.backward')}
        disabled={at <= 0}
        onClick={() => arrange(at - 1)}
      />
      <Tool
        icon={<Trash2 size={17} />}
        label={t('canvas.delete')}
        disabled={at < 0}
        danger
        onClick={() => {
          editObjects(item, index, (os) => os.filter((o) => o.id !== selected));
          useStore.setState({ editObjectId: null });
        }}
      />
    </div>
  );
}
