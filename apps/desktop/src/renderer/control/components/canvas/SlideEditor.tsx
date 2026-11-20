import { useEffect, useRef, type ReactNode } from 'react';
import { Rows3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { useSize } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import {
  ExpandToggle,
  InspectorToggle,
  SlideStage,
  SlideStepper,
  useFit,
  useInspector,
  usePageKeys,
} from './editorParts';
import { SlideList, type SlideListProps } from './SlideList';
import { isNewSlideKey } from './TextBox';

/** Edit all the words at once (the Reflow page). */
function ReflowButton() {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<Rows3 size={14} />}
      title={t('canvas.reflowHint')}
      aria-label={t('canvas.reflow')}
      onClick={() => useStore.setState({ mode: 'reflow' })}
    >
      <span className="@max-[560px]:hidden">{t('canvas.reflow')}</span>
    </Button>
  );
}

/**
 * The one slide editor, for songs and text slides alike: the slide on a stage, its tools, its
 * slides and an inspector. Compact (beside the playlist and output), it has a header and the
 * slides along the bottom; expanded (the whole window, like a presentation editor), the slides
 * run down the left and the tools float over the stage. The editor's Expand button switches.
 */
export function SlideEditor({
  icon,
  title,
  list,
  extras,
  tools,
  canvas,
  empty,
  inspector,
  onStageBackground,
  onNewSlide,
  hint,
}: {
  icon: ReactNode;
  title: string;
  list: Omit<SlideListProps, 'title'>;
  /** Beside the slide stepper (LIVE, looping). */
  extras?: ReactNode;
  tools?: ReactNode;
  /** The slide being edited; null shows `empty`. */
  canvas: ReactNode | null;
  empty?: ReactNode;
  inspector: ReactNode;
  /** A click on the stage around the slide. */
  onStageBackground?: () => void;
  /** ⇧⌘N. */
  onNewSlide?: () => void;
  /** A line under the slide (how to edit it). */
  hint?: string;
}) {
  const expanded = useStore((s) => s.editExpanded);
  const [root, size] = useSize();
  const inspectorPane = useInspector(size.width);
  const [stage, width] = useFit(expanded ? 40 : 28);
  const total = list.slides.length;
  const step = (shown: number): void => list.onSelect(Math.max(0, Math.min(shown, total - 1)));
  usePageKeys(list.selected, step);

  // ⇧⌘N anywhere in the editor (typing on the slide handles it itself).
  const newSlide = useRef(onNewSlide);
  useEffect(() => {
    newSlide.current = onNewSlide;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !isNewSlideKey(e) || useStore.getState().dialog) return;
      if (!newSlide.current) return;
      e.preventDefault();
      newSlide.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stageArea = canvas ? (
    <SlideStage
      stageRef={stage}
      width={width}
      hint={hint}
      onBackgroundPointerDown={onStageBackground}
    >
      {canvas}
    </SlideStage>
  ) : (
    empty
  );
  const controls = (
    <>
      <ExpandToggle />
      <InspectorToggle {...inspectorPane} />
    </>
  );

  return (
    <div ref={root} className="@container relative flex min-h-0 flex-1">
      {expanded && <SlideList orientation="vertical" title={title} {...list} />}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-0)]">
        {expanded ? (
          // Tools float over the stage, centred while there's room; the item's state and the
          // view buttons sit at the right and never go under them.
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-3 px-3">
            <div className="pointer-events-auto col-start-2">{tools}</div>
            <div className="pointer-events-auto flex items-center justify-end gap-1">
              {extras}
              <ReflowButton />
              {controls}
            </div>
          </div>
        ) : (
          <>
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-3 @max-[560px]:gap-1.5 @max-[560px]:px-2">
              <span className="contents @max-[560px]:hidden">{icon}</span>
              <Typography
                as="h2"
                size={14}
                weight="semibold"
                tone="primary"
                truncate
                className="min-w-0 @max-[560px]:hidden"
              >
                {title}
              </Typography>
              <SlideStepper index={list.selected} total={total} onStep={step} />
              {extras}
              <span className="flex-1" />
              <ReflowButton />
              {controls}
            </header>
            {tools && (
              <div className="flex shrink-0 justify-center-safe overflow-x-auto px-2 pt-3">
                {tools}
              </div>
            )}
          </>
        )}
        <div className={`flex min-h-0 flex-1 flex-col ${expanded ? 'pt-20' : ''}`}>{stageArea}</div>
        {!expanded && <SlideList orientation="horizontal" title={title} {...list} />}
      </div>
      {inspectorPane.open && inspector}
    </div>
  );
}
