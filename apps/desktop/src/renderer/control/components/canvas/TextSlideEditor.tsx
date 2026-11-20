import { useMemo, useState } from 'react';
import { Circle, Copy, Image as ImageIcon, Minus, Plus, Square, Trash2, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, type SlideObject } from '@lampstand/core';
import { TallyTag } from '@lampstand/ui';
import { useItemSlides } from '../../lib/hooks';
import { displayCombo } from '../../lib/shortcuts';
import { useStore } from '../../lib/store';
import {
  addSlide,
  breakSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  selectSlide,
} from '../../lib/textSlides';
import { KindTile } from '../kindIcons';
import { LoopToggle } from '../LoopToggle';
import { SlideInspector } from '../SlideInspector';
import { EditorToolbar } from './EditorToolbar';
import { SlideCanvas, type TypingTarget } from './SlideCanvas';
import { SlideEditor } from './SlideEditor';
import { MenuItem, MenuSeparator, ObjectsPanel, type ListSlide } from './SlideList';
import { type TextItem } from '../../types';

const OBJECT_ICON: Record<SlideObject['kind'], typeof Type> = {
  text: Type,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  image: ImageIcon,
};

/**
 * Text slides and announcements in the Edit workspace: the slide on its stage with the canvas
 * tools (text boxes, shapes, lines, pictures), its words typed right on it, the slides in a list
 * and the inspector.
 */
export function TextSlideEditor({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  const { slides } = useItemSlides(item);
  const cursor = useStore((s) => s.editCursor);
  const objectId = useStore((s) => s.editObjectId);
  const liveAt = useStore((s) => (s.liveCursor?.itemId === item.id ? s.liveCursor.index : -1));
  const index = cursor?.itemId === item.id ? Math.min(cursor.index, item.slides.length - 1) : 0;
  const slide = item.slides[index];
  /** What is being typed, on which slide (by id, so it follows the slide when slides move). */
  const [typing, setTyping] = useState<{ slideId: string; target: TypingTarget } | null>(null);
  const here = typing && typing.slideId === slide?.id ? typing.target : null;
  const visit = here ? `${typing?.slideId}:${here.kind === 'object' ? here.id : 'words'}` : '';

  const type = (target: TypingTarget | null): void => {
    setTyping(target && slide ? { slideId: slide.id, target } : null);
    if (target) useStore.setState({ editObjectId: target.kind === 'object' ? target.id : null });
  };
  const select = (i: number): void => {
    setTyping(null);
    selectSlide(item, i);
  };
  /** A new slide after slide `after`, its words ready to type. */
  const newSlide = (after = index): void =>
    setTyping({ slideId: addSlide(item, after), target: { kind: 'slide', heading: false } });

  const list = useMemo(
    () =>
      item.slides.map((s, i): ListSlide => ({
        key: s.id,
        index: i,
        caption: s.title?.trim() || undefined,
        live: liveAt === i,
        scene: (() => {
          const a = slides[i]?.action;
          return a?.kind === 'content'
            ? makeScene({ background: a.background, content: a.content })
            : makeScene();
        })(),
      })),
    [item.slides, slides, liveAt],
  );

  const one = item.slides.length <= 1;
  const menu = (i: number) => (
    <>
      <MenuItem
        icon={<Plus size={13} />}
        label={t('canvas.newSlide')}
        shortcut={displayCombo('Mod+Shift+N')}
        onSelect={() => newSlide(i)}
      />
      <MenuItem
        icon={<Copy size={13} />}
        label={t('canvas.duplicate')}
        onSelect={() => duplicateSlide(item, i)}
      />
      <MenuSeparator />
      <MenuItem
        icon={<Trash2 size={13} />}
        label={t('canvas.deleteSlide')}
        danger
        disabled={one}
        onSelect={() => deleteSlide(item, i)}
      />
    </>
  );
  const words = slide?.title?.trim() || slide?.body.split('\n')[0]?.trim() || t('canvas.text');

  return (
    <SlideEditor
      icon={<KindTile kind={item.kind} size={24} />}
      title={item.kind === 'presentation' ? item.title : t('service.kind.announcements')}
      list={{
        slides: list,
        selected: index,
        onSelect: select,
        onMove: (from, to) => moveSlide(item, from, to),
        onDelete: (i) => !one && deleteSlide(item, i),
        menu,
        addMenu: (
          <MenuItem
            icon={<Plus size={13} />}
            label={t('canvas.newSlide')}
            shortcut={displayCombo('Mod+Shift+N')}
            onSelect={() => newSlide()}
          />
        ),
        onAdd: () => newSlide(item.slides.length - 1),
        footer: (
          <ObjectsPanel
            rows={[
              {
                key: 'words',
                icon: <Type size={14} />,
                label: words,
                selected: here?.kind === 'slide',
                onClick: () => type({ kind: 'slide', heading: !!slide?.title }),
              },
              ...(slide?.objects ?? []).map((o) => {
                const Icon = OBJECT_ICON[o.kind];
                return {
                  key: o.id,
                  icon: <Icon size={14} />,
                  label: o.kind === 'text' && o.text.trim() ? o.text : t(`canvas.kinds.${o.kind}`),
                  selected: objectId === o.id,
                  onClick: () => {
                    setTyping(null);
                    useStore.setState({ editObjectId: o.id });
                  },
                };
              }),
            ]}
          />
        ),
      }}
      extras={
        <>
          {liveAt === index && (
            <TallyTag tone="program" className="!static">
              LIVE
            </TallyTag>
          )}
          <LoopToggle item={item} />
        </>
      }
      tools={
        <EditorToolbar
          typing={here?.kind === 'slide'}
          onType={() => type({ kind: 'slide', heading: !!slide?.title })}
          onNewSlide={() => newSlide()}
          objects={{ item, index }}
        />
      }
      canvas={
        <SlideCanvas
          item={item}
          index={index}
          typing={here}
          visit={visit}
          onType={type}
          onBreak={(before, after) =>
            setTyping({
              slideId: breakSlide(item, index, before, after),
              target: { kind: 'slide', heading: false },
            })
          }
          onNewSlide={() => newSlide()}
        />
      }
      inspector={<SlideInspector />}
      onStageBackground={() => {
        setTyping(null);
        useStore.setState({ editObjectId: null });
      }}
      onNewSlide={() => newSlide()}
      hint={t('canvas.hint')}
    />
  );
}
