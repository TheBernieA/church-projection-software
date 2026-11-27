import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, Check, Loader2, Music2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Switch, Typography } from '@lampstand/ui';
import type { ResolvedPlan, ResolvedStep } from '@lampstand/planner';
import {
  addToOpenService,
  createPlannedService,
  planService,
  refreshAssistant,
  useAssistant,
} from '../../lib/assistant';
import { closeDialog, openDialog, useStore } from '../../lib/store';
import { Dialog } from '../Dialog';
import { Field } from '../form';
import { KeyNeeded } from './KeyNeeded';

/**
 * Plan a service with the assistant: the operator writes the order of service in their own
 * words, reviews what came back (songs found in the library, readings understood, what still
 * needs them), then creates a playlist or adds it to the open one. Nothing changes before that.
 */
export function PlanServiceDialog() {
  const open = useStore((s) => s.dialog === 'planService');
  return open ? <PlanServiceForm /> : null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

function PlanServiceForm() {
  const { t } = useTranslation();
  const hasKey = useAssistant((s) => s.hasKey);
  const allowTitles = useStore((s) => s.settings?.assistant.sendSongTitles ?? true);
  const openPlan = useStore((s) => s.service);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [useLibrary, setUseLibrary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ResolvedPlan | null>(null);
  const [name, setName] = useState('');

  useEffect(() => void refreshAssistant(), []);

  const run = async (): Promise<void> => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p = await planService(text, { date, useLibrary: useLibrary && allowTitles });
      setPlan(p);
      setName(p.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('planner.failed'));
    } finally {
      setBusy(false);
    }
  };

  const create = async (): Promise<void> => {
    if (!plan || busy) return;
    setBusy(true);
    const ok = await createPlannedService(name, plan.date ?? date, plan.items);
    if (ok) closeDialog();
    else setBusy(false);
  };
  const append = (): void => {
    if (plan && addToOpenService(plan.items)) closeDialog();
  };

  const footer = plan ? (
    <>
      <Button
        variant="ghost"
        icon={<ArrowLeft size={14} />}
        className="mr-auto"
        onClick={() => setPlan(null)}
      >
        {t('planner.back')}
      </Button>
      {openPlan && !openPlan.isTemplate && (
        <Button disabled={busy || !plan.items.length} onClick={append}>
          {t('planner.addTo', { name: openPlan.name })}
        </Button>
      )}
      <Button variant="primary" disabled={busy || !plan.items.length} onClick={() => void create()}>
        {t('planner.create')}
      </Button>
    </>
  ) : (
    <>
      <Button onClick={() => closeDialog()}>{t('song.cancel')}</Button>
      <Button
        variant="primary"
        disabled={busy || !text.trim() || !hasKey}
        icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        onClick={() => void run()}
      >
        {busy ? t('planner.planning') : t('planner.plan')}
      </Button>
    </>
  );

  return (
    <Dialog name="planService" title={t('planner.title')} footer={footer}>
      {hasKey === false ? (
        <KeyNeeded />
      ) : plan ? (
        <Review plan={plan} name={name} onName={setName} />
      ) : (
        <div className="space-y-4">
          <Typography as="p" variant="caption" leading="snug">
            {t('planner.intro')}
          </Typography>
          <Field label={t('planner.text')} htmlFor="plan-text">
            <textarea
              id="plan-text"
              className="field min-h-[220px] w-full resize-y font-[inherit] leading-relaxed"
              value={text}
              maxLength={20000}
              placeholder={t('planner.placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run();
              }}
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap items-end gap-6">
            <Field label={t('planner.date')} htmlFor="plan-date">
              <input
                id="plan-date"
                type="date"
                className="field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 pb-1.5">
              <Switch
                label={t('planner.useLibrary')}
                checked={useLibrary && allowTitles}
                disabled={!allowTitles}
                onChange={setUseLibrary}
              />
              <Typography size={12} tone="secondary">
                {t('planner.useLibrary')}
              </Typography>
            </label>
          </div>
          <Typography as="p" variant="caption" leading="snug" tone="muted">
            {useLibrary && allowTitles ? t('planner.privacyTitles') : t('planner.privacy')}
          </Typography>
          {error && (
            <Typography as="p" role="alert" size={12} className="text-[var(--tally-program)]">
              {error}
            </Typography>
          )}
        </div>
      )}
    </Dialog>
  );
}

const STATUS_ICON = {
  matched: <Check size={14} className="text-[var(--tally-preview)]" />,
  parsed: <Check size={14} className="text-[var(--tally-preview)]" />,
  made: <Check size={14} className="text-[var(--text-3)]" />,
  unmatched: <AlertTriangle size={14} className="text-[var(--accent)]" />,
};

function StepRow({ step }: { step: ResolvedStep }) {
  const { t } = useTranslation();
  const icon =
    step.kind === 'song' ? (
      <Music2 size={13} />
    ) : step.kind === 'scripture' ? (
      <BookOpen size={13} />
    ) : null;
  const detail =
    step.status === 'unmatched'
      ? t(step.kind === 'song' ? 'planner.notInLibrary' : 'planner.notUnderstood', {
          what: step.detail,
        })
      : step.detail;
  return (
    <li
      className={`flex items-start gap-2.5 px-3 py-2 ${step.kind === 'section' ? 'bg-[var(--surface-1)]' : ''}`}
    >
      <span className="mt-0.5 flex w-4 shrink-0 justify-center">{STATUS_ICON[step.status]}</span>
      <div className="min-w-0 flex-1">
        <Typography
          as="p"
          size={13}
          weight={step.kind === 'section' ? 'semibold' : 'regular'}
          tone="primary"
          className="flex items-center gap-1.5"
        >
          {icon && (
            <Typography as="span" tone="muted" className="flex shrink-0">
              {icon}
            </Typography>
          )}
          <Typography
            as="span"
            size={13}
            tone="inherit"
            weight={step.kind === 'section' ? 'semibold' : 'regular'}
            truncate
          >
            {step.title}
          </Typography>
        </Typography>
        {detail && (
          <Typography as="p" size={11} tone="muted" className="truncate">
            {detail}
          </Typography>
        )}
      </div>
    </li>
  );
}

function Review({
  plan,
  name,
  onName,
}: {
  plan: ResolvedPlan;
  name: string;
  onName: (n: string) => void;
}) {
  const { t } = useTranslation();
  const missing = plan.steps.filter((s) => s.status === 'unmatched').length;
  return (
    <div className="space-y-4">
      <Field label={t('planner.name')} htmlFor="plan-name">
        <input
          id="plan-name"
          className="field w-full"
          value={name}
          maxLength={200}
          onChange={(e) => onName(e.target.value)}
        />
      </Field>
      <Typography as="p" variant="caption" leading="snug">
        {missing
          ? t('planner.reviewMissing', { count: plan.items.length, missing })
          : t('planner.review', { count: plan.items.length })}
      </Typography>
      <ul className="max-h-[42vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-[8px] bg-[var(--surface-2)] shadow-[0_0_0_1px_var(--hairline)]">
        {plan.steps.map((s, i) => (
          <StepRow key={i} step={s} />
        ))}
      </ul>
      {plan.questions.length > 0 && (
        <div className="rounded-[8px] bg-[var(--surface-2)] px-3 py-2.5 shadow-[inset_3px_0_0_var(--accent),0_0_0_1px_var(--hairline)]">
          <Typography as="p" size={12} weight="semibold" tone="primary">
            {t('planner.questions')}
          </Typography>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {plan.questions.map((q, i) => (
              <Typography as="li" key={i} size={12} tone="secondary">
                {q}
              </Typography>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Open the planner (from the library's + menu). */
export const openPlanner = (): void => openDialog('planService');
