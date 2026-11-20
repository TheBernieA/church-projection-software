import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StageElementKindSchema, type StageLayout } from '@lampstand/core';
import { parseChordLine } from '@lampstand/lyrics';
import { StageView } from '@lampstand/renderer';
import { mediaUrl } from '../../shared/mediaUrl';
import { useStore } from '../lib/store';

const KINDS = StageElementKindSchema.options;

/**
 * A live render of a stage layout: the same view the stage screen uses (the Stage workspace,
 * where `editing` also shows empty boxes, and the multi-view).
 */
export function StagePreview({
  layout,
  editing = false,
}: {
  layout: StageLayout;
  editing?: boolean;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<StageView | null>(null);
  const live = useStore((s) => s.live);
  useEffect(() => {
    if (!host.current) return;
    const v = new StageView(host.current, {
      mediaUrl,
      parseChords: parseChordLine,
      labels: { now: t('stage.now'), next: t('stage.next') },
      showEmpty: editing,
      names: Object.fromEntries(KINDS.map((k) => [k, t(`stageLayouts.kinds.${k}`)])),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [editing, t]);
  useEffect(() => view.current?.setLayout(layout), [layout, editing, t]);
  useEffect(() => {
    if (live) view.current?.update(live);
  }, [live, editing, t]);
  return <div ref={host} aria-hidden className="absolute inset-0" />;
}
