import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Eye, Mic, Play, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Typography } from '@lampstand/ui';
import type { Candidate } from '@lampstand/detection';
import {
  clearCandidates,
  describePassages,
  dismissCandidate,
  previewCandidate,
  showCandidate,
  startListening,
  useListen,
} from '../../lib/listen/listening';
import { openDialog, useStore } from '../../lib/store';
import { listenColor } from './ListenMenu';

/** Shown in the card at most (the rest are in the list's past). */
const MAX_SHOWN = 6;

/**
 * Listening, beside the live output: what it heard (scripture waiting for the operator, with
 * Show / Preview / Dismiss), the transcript, and why it isn't listening if it can't.
 */
export function ListenCard() {
  const { t } = useTranslation();
  const status = useListen((s) => s.status);
  const error = useListen((s) => s.error);
  const errorKind = useListen((s) => s.errorKind);
  const candidates = useListen((s) => s.candidates);
  const mode = useStore((s) => s.live?.detection.mode ?? 'off');
  const [showTranscript, setShowTranscript] = useState(true);
  if (status === 'off' && candidates.length === 0) return null;

  const pending = candidates.filter((c) => c.status === 'pending');
  const past = candidates.filter((c) => c.status !== 'pending').slice(0, 3);
  const color = listenColor(status) ?? 'var(--text-3)';

  return (
    <section
      aria-label={t('listen.title')}
      className="rounded-[8px] bg-[var(--surface-2)] shadow-[0_0_0_1px_var(--hairline)]"
    >
      <header className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
        <Typography as="h2" variant="overline" className="flex-1">
          {t('listen.title')} · {t(`listen.mode.${mode}`)}
        </Typography>
        <LevelBar />
        {candidates.length > 0 && (
          <Button size="3xs" variant="quiet" onClick={clearCandidates}>
            {t('listen.clear')}
          </Button>
        )}
      </header>
      {status === 'error' && error && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-[6px] bg-[var(--surface-1)] px-2.5 py-2">
          <Typography as="p" size={12} tone="secondary" className="flex-1">
            {error}
          </Typography>
          <Button
            size="2xs"
            onClick={() =>
              errorKind === 'model'
                ? openDialog('settings', { settingsPage: 'assistant' })
                : void startListening()
            }
          >
            {errorKind === 'model' ? t('listen.getModel') : t('listen.retry')}
          </Button>
        </div>
      )}
      <Loading />
      {mode === 'off' && status === 'listening' && (
        <Typography as="p" size={11} tone="muted" className="px-3 pb-2">
          {t('listen.modeOffHint')}
        </Typography>
      )}
      {pending.length > 0 && (
        <ul className="space-y-1 px-2 pb-2">
          {pending.slice(0, MAX_SHOWN).map((c, i) => (
            <CandidateRow key={c.id} c={c} newest={i === 0} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <ul className="px-3 pb-2">
          {past.map((c) => (
            <Typography
              as="li"
              key={c.id}
              size={11}
              tone="muted"
              className="flex items-center gap-1.5 truncate"
            >
              <BookOpen size={11} className="shrink-0" />
              {describePassages(c.passages)} · {t(`listen.state.${c.status}`)}
            </Typography>
          ))}
        </ul>
      )}
      {status !== 'off' && (
        <div className="border-t border-[var(--hairline)]">
          <Button
            variant="bare"
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left"
            onClick={() => setShowTranscript(!showTranscript)}
            aria-expanded={showTranscript}
          >
            {showTranscript ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Typography variant="overline">{t('listen.transcript')}</Typography>
            <Latency />
          </Button>
          {showTranscript && <Transcript />}
        </div>
      )}
    </section>
  );
}

function CandidateRow({ c, newest }: { c: Candidate; newest: boolean }) {
  const { t } = useTranslation();
  const pct = Math.round(c.confidence * 100);
  return (
    <li
      className={`rounded-[6px] px-2.5 py-2 ${newest ? 'bg-[var(--surface-3)] shadow-[inset_3px_0_0_var(--accent)]' : 'bg-[var(--surface-1)]'}`}
    >
      <div className="flex items-center gap-2">
        <BookOpen size={13} className="shrink-0 text-[var(--text-3)]" />
        <Typography size={13} weight="semibold" tone="primary" className="min-w-0 flex-1 truncate">
          {describePassages(c.passages)}
          {c.chapterOnly && (
            <Typography as="span" size={11} tone="muted" weight="regular">
              {' '}
              · {t('listen.chapterOnly')}
            </Typography>
          )}
        </Typography>
        <Typography size={10} tone="muted" tabular title={t('listen.confidence')}>
          {pct}%
        </Typography>
      </div>
      <Typography as="p" size={11} tone="muted" className="mt-0.5 line-clamp-2">
        “{c.snippet}”
      </Typography>
      <div className="mt-1.5 flex items-center gap-1">
        <Button
          size="2xs"
          variant="live"
          icon={<Play size={11} fill="currentColor" />}
          onClick={() => void showCandidate(c.id)}
        >
          {t('listen.show')}
        </Button>
        <Button size="2xs" icon={<Eye size={12} />} onClick={() => void previewCandidate(c.id)}>
          {t('listen.preview')}
        </Button>
        <span className="flex-1" />
        <Button size="2xs" variant="quiet" onClick={() => dismissCandidate(c.id, true)}>
          {t('listen.notToday')}
        </Button>
        <IconButton
          size="2xs"
          variant="quiet"
          aria-label={t('listen.dismiss')}
          onClick={() => dismissCandidate(c.id)}
        >
          <X size={12} />
        </IconButton>
      </div>
    </li>
  );
}

/** The input's level: a thin bar that moves with the voice (green while speech is heard). */
function LevelBar() {
  const level = useListen((s) => s.level);
  const speaking = useListen((s) => s.speaking);
  const status = useListen((s) => s.status);
  if (status !== 'listening') return null;
  const pct = Math.max(0, Math.min(100, ((level + 70) / 60) * 100));
  return (
    <span
      aria-hidden
      className="relative h-1.5 w-12 overflow-hidden rounded-full bg-[var(--surface-1)]"
      title={speaking ? 'speech' : undefined}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
        style={{
          width: `${pct}%`,
          background: speaking ? 'var(--tally-preview)' : 'var(--text-3)',
        }}
      />
    </span>
  );
}

function Loading() {
  const { t } = useTranslation();
  const status = useListen((s) => s.status);
  const progress = useListen((s) => s.loadProgress);
  if (status !== 'loading' && status !== 'starting') return null;
  return (
    <Typography as="p" size={11} tone="muted" className="flex items-center gap-1.5 px-3 pb-2">
      <Mic size={11} />
      {status === 'loading'
        ? t('listen.loadingModel', { pct: Math.round(progress * 100) })
        : t('listen.status.starting')}
    </Typography>
  );
}

function Latency() {
  const { t } = useTranslation();
  const ms = useListen((s) => s.latencyMs);
  const device = useListen((s) => s.device);
  if (ms === null) return null;
  return (
    <Typography size={10} tone="muted" tabular className="ml-auto" title={device ?? undefined}>
      {t('listen.latency', { s: (ms / 1000).toFixed(1) })}
    </Typography>
  );
}

function Transcript() {
  const { t } = useTranslation();
  const lines = useListen((s) => s.lines);
  if (!lines.length)
    return (
      <Typography as="p" size={11} tone="muted" className="px-3 pb-2.5">
        {t('listen.nothingYet')}
      </Typography>
    );
  return (
    <ol className="flex max-h-40 flex-col-reverse overflow-y-auto px-3 pb-2.5">
      {[...lines].reverse().map((l) => (
        <Typography
          as="li"
          key={l.id}
          size={12}
          tone={l.kind === 'speech' ? 'secondary' : 'primary'}
          weight={l.kind === 'speech' ? 'regular' : 'medium'}
          className="py-0.5"
        >
          {l.kind === 'command' && (
            <Typography as="span" size={10} tone="muted" caps className="mr-1">
              {t('listen.commandTag')}
            </Typography>
          )}
          {l.text}
        </Typography>
      ))}
    </ol>
  );
}
