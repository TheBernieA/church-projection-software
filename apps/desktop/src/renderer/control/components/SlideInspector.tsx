import { ArrowLeft, ArrowRight, Copy, Info, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, omit, type ServiceItem, type TextSlide } from '@lampstand/core';
import { Button, IconButton, Segmented, Switch, Typography, typographyClass } from '@lampstand/ui';
import { useState } from 'react';
import { useInService, useItemSlides, useSelectedItem } from '../lib/hooks';
import { TextFormatPanel } from './textFormat';
import { deleteSlide, duplicateSlide, moveSlide } from '../lib/textSlides';
import { patchItem, updateItem, useStore } from '../lib/store';
import { InspectorShell } from './canvas/editorParts';
import { ObjectInspector } from './canvas/ObjectInspector';
import { Field, NumberInput } from './form';
import { type CountdownItem, type TextItem } from '../types';
import { clamp } from '../lib/utils';
import { isClockTime } from '../lib/slides';
import { Select } from './Select';

const NO_VIDEO = 'none';

/** Replace an item. `typing` groups keystrokes into one undo step; actions are one step each. */
function replaceItem(next: ServiceItem, typing = false): void {
  updateItem(next.id, () => next, { typing });
}

/**
 * Right-hand inspector for editable items (text slides, announcements, countdowns). It edits the
 * slide selected in the grid, so the field ↔ slide relationship is always explicit.
 */
export function SlideInspector() {
  const item = useSelectedItem();
  const inService = useInService(item);
  if (!item || !inService) return null;
  if (item.kind === 'countdown')
    return (
      <InspectorShell>
        <CountdownInspector item={item} />
      </InspectorShell>
    );
  if (item.kind === 'presentation' || item.kind === 'announcements')
    return (
      <InspectorShell>
        <TextOrObjectInspector item={item} />
      </InspectorShell>
    );
  return null;
}

/** The item's text formatting (the Text tab), over its theme. */
function ItemTextFormat({ item }: { item: TextItem }) {
  const { slides } = useItemSlides(item);
  const first = slides.find((s) => s.action.kind === 'content');
  if (first?.action.kind !== 'content') return null;
  return (
    <TextFormatPanel
      theme={first.action.content.theme}
      format={item.textFormat ?? {}}
      onChange={(p) =>
        patchItem<TextItem>(item, (cur) => ({ textFormat: { ...cur.textFormat, ...p } }))
      }
      onSet={(f) =>
        patchItem<TextItem>(item, { textFormat: Object.keys(f).length ? f : undefined })
      }
    />
  );
}

/**
 * The selected canvas object's properties; else the item and slide (Slide) or the words'
 * formatting (Text).
 */
function TextOrObjectInspector({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'slide' | 'text'>('slide');
  const editCursor = useStore((s) => s.editCursor);
  const objectId = useStore((s) => s.editObjectId);
  const index =
    editCursor?.itemId === item.id ? Math.min(editCursor.index, item.slides.length - 1) : 0;
  const object = item.slides[index]?.objects?.find((o) => o.id === objectId);
  if (object) return <ObjectInspector item={item} index={index} object={object} />;
  return (
    <>
      <div className="px-5 pt-4">
        <Segmented<'slide' | 'text'>
          label={t('inspector.tabs')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'slide', label: t('inspector.slideTab') },
            { value: 'text', label: t('inspector.textTab') },
          ]}
        />
      </div>
      {tab === 'slide' ? <TextInspector item={item} /> : <ItemTextFormat item={item} />}
    </>
  );
}

function TextInspector({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  const editCursor = useStore((s) => s.editCursor);
  const liveCursor = useStore((s) => s.liveCursor);
  const count = item.slides.length;
  const index = editCursor?.itemId === item.id ? Math.min(editCursor.index, count - 1) : 0;
  const slide = item.slides[index];
  const setSlides = (slides: TextSlide[], typing = false): void =>
    replaceItem({ ...item, slides }, typing);
  const patchSlide = (p: Partial<TextSlide>): void => {
    if (slide)
      setSlides(
        item.slides.map((s) => (s.id === slide.id ? { ...s, ...p } : s)),
        true,
      );
  };
  const move = (to: number): void => moveSlide(item, index, to);
  const isLive = liveCursor?.itemId === item.id && liveCursor.index === index;

  return (
    <div className="flex flex-col gap-6 p-5">
      <section className="space-y-4">
        <Typography as="h3" variant="overline">
          {t(`service.kind.${item.kind}`)}
        </Typography>
        <Field label={t('inspector.name')} htmlFor="insp-name">
          <input
            id="insp-name"
            className="field"
            value={item.title}
            onChange={(e) => replaceItem({ ...item, title: e.target.value }, true)}
          />
        </Field>
        {item.kind === 'announcements' && (
          <Field
            label={t('inspector.advance')}
            htmlFor="insp-advance"
            hint={t('inspector.advanceHelp')}
          >
            <div className="flex items-center gap-2">
              <NumberInput
                id="insp-advance"
                min={2}
                max={600}
                className="w-24"
                value={item.loopIntervalSec}
                onChange={(v) => replaceItem({ ...item, loopIntervalSec: clamp(v, 2, 600) }, true)}
              />
              <Typography size={13} tone="secondary">
                {t('inspector.seconds')}
              </Typography>
            </div>
          </Field>
        )}
      </section>

      {slide ? (
        <section className="space-y-4">
          {/* Which slide, and the way to the others, are in the header above the canvas. */}
          <Typography as="h3" variant="overline">
            {t('inspector.thisSlide')}
          </Typography>
          <Field label={t('inspector.title')} htmlFor="insp-title">
            <input
              id="insp-title"
              className="field"
              placeholder={t('inspector.titlePlaceholder')}
              value={slide.title ?? ''}
              onChange={(e) => patchSlide({ title: e.target.value })}
            />
          </Field>
          <Field label={t('inspector.text')} htmlFor="insp-body">
            <textarea
              id="insp-body"
              className={`field !font-sans ${typographyClass({ size: 14, important: true })}`}
              rows={7}
              value={slide.body}
              placeholder={t('inspector.textPlaceholder')}
              onChange={(e) => patchSlide({ body: e.target.value })}
            />
          </Field>
          <Field label={t('inspector.notes')} htmlFor="insp-notes" hint={t('inspector.notesHelp')}>
            <textarea
              id="insp-notes"
              className="field !font-sans"
              rows={3}
              value={slide.notes ?? ''}
              onChange={(e) => patchSlide({ notes: e.target.value })}
            />
          </Field>
          {isLive && (
            <Typography
              as="p"
              size={12}
              tone="secondary"
              leading="snug"
              className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2.5"
            >
              <Info size={14} className="mt-px shrink-0" />
              {t('inspector.liveHint')}
            </Typography>
          )}
          <div className="flex items-center gap-1 pt-1">
            <IconButton
              size="sm"
              aria-label={t('inspector.moveLeft')}
              disabled={index === 0}
              onClick={() => move(index - 1)}
            >
              <ArrowLeft size={16} />
            </IconButton>
            <IconButton
              size="sm"
              aria-label={t('inspector.moveRight')}
              disabled={index >= count - 1}
              onClick={() => move(index + 1)}
            >
              <ArrowRight size={16} />
            </IconButton>
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy size={15} />}
              onClick={() => duplicateSlide(item, index)}
            >
              {t('service.duplicate')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              icon={<Trash2 size={15} />}
              disabled={count <= 1}
              title={count <= 1 ? t('inspector.lastSlide') : undefined}
              onClick={() => deleteSlide(item, index)}
            >
              {t('inspector.delete')}
            </Button>
          </div>
        </section>
      ) : (
        <Typography as="p" size={13} tone="muted">
          {t('inspector.noSlide')}
        </Typography>
      )}
    </div>
  );
}

function CountdownInspector({ item }: { item: CountdownItem }) {
  const { t } = useTranslation();
  const videos = useStore((s) => s.media).filter((m) => m.kind === 'video');
  const byTime = typeof item.target === 'string';
  const minutes = byTime
    ? ''
    : String(Math.round((item.target as { durationSec: number }).durationSec / 60));
  const clock = typeof item.target === 'string' && isClockTime(item.target) ? item.target : '10:30';
  const video = item.video ? videos.find((m) => m.id === item.video?.mediaId) : undefined;
  return (
    <div className="flex flex-col gap-4 p-5">
      <Typography as="h3" variant="overline">
        {t('service.kind.countdown')}
      </Typography>
      <Field label={t('inspector.countdownText')} htmlFor="insp-cd-title">
        <input
          id="insp-cd-title"
          className="field"
          value={item.title}
          onChange={(e) => replaceItem({ ...item, title: e.target.value }, true)}
        />
      </Field>
      <Field label={t('inspector.countTo')} group>
        <Segmented<'length' | 'time'>
          label={t('inspector.countTo')}
          value={byTime ? 'time' : 'length'}
          onChange={(v) =>
            replaceItem({ ...item, target: v === 'time' ? clock : { durationSec: 300 } })
          }
          options={[
            { value: 'length', label: t('inspector.forLength') },
            { value: 'time', label: t('inspector.untilTime') },
          ]}
        />
      </Field>
      {byTime ? (
        <Field
          label={t('inspector.endsAt')}
          htmlFor="insp-cd-time"
          hint={t('inspector.endsAtHelp')}
        >
          <input
            id="insp-cd-time"
            type="time"
            className="field w-32"
            value={clock}
            onChange={(e) =>
              e.target.value && replaceItem({ ...item, target: e.target.value }, true)
            }
          />
        </Field>
      ) : (
        <Field
          label={t('inspector.minutes')}
          htmlFor="insp-cd-min"
          hint={t('inspector.minutesHelp')}
        >
          <input
            id="insp-cd-min"
            type="number"
            min={1}
            max={600}
            className="field w-28"
            value={minutes}
            placeholder="5"
            onChange={(e) =>
              replaceItem(
                {
                  ...item,
                  target: { durationSec: Math.max(1, Number(e.target.value) || 5) * 60 },
                },
                true,
              )
            }
          />
        </Field>
      )}
      <Field label={t('inspector.countdownVideo')} group hint={t('inspector.countdownVideoHelp')}>
        <Select<string>
          size="sm"
          aria-label={t('inspector.countdownVideo')}
          value={item.video?.mediaId ?? NO_VIDEO}
          onChange={(id) =>
            replaceItem(
              id === NO_VIDEO
                ? omit(item, 'video', 'hideTimer')
                : { ...item, video: { mediaId: id } },
            )
          }
          options={[
            { value: NO_VIDEO, label: t('inspector.noVideo') },
            ...videos.map((m) => ({
              value: m.id,
              label: m.durationSec
                ? `${m.name} · ${formatClock(Math.round(m.durationSec))}`
                : m.name,
            })),
          ]}
        />
      </Field>
      {video && (
        <label className="flex items-center justify-between gap-3">
          <Typography size={13} tone="secondary">
            {t('inspector.showTimerOverVideo')}
          </Typography>
          <Switch
            label={t('inspector.showTimerOverVideo')}
            checked={!item.hideTimer}
            onChange={(on) => replaceItem({ ...item, hideTimer: !on })}
          />
        </label>
      )}
    </div>
  );
}
