import { create } from 'zustand';
import { newId, type PassageRef, type ServiceItem } from '@lampstand/core';
import {
  DetectionQueue,
  Segmenter,
  VerseDetector,
  cleanTranscript,
  matchVersion,
  parseVoiceCommand,
  routeDetection,
  stepTarget,
  type Candidate,
  type DetectionMode,
  type Transcriber,
  type Utterance,
  type VoiceCommand,
} from '@lampstand/detection';
import { formatPassage, nextVerse, prevVerse } from '@lampstand/scripture';
import type { SpeechModelStatus } from '@lampstand/ipc-contract';
import {
  clearLayer,
  findItem,
  goLive,
  openAdhoc,
  restoreAll,
  saveSettings,
  setMask,
  slidesFor,
  stepAcross,
  stepItem,
} from '../actions';
import { api, cmd, q } from '../api';
import { toast, useStore } from '../store';
import i18n from '../../i18n';
import captureUrl from './capture.worklet.js?url&no-inline';
import { WhisperTranscriber } from './whisperTranscriber';

/**
 * Listening (BUILD_SPEC §10, ADR 0008): the chosen input → 16 kHz → utterances → Whisper →
 * voice commands and scripture references → the same actions as a click, with their source
 * ('voice' / 'auto-detect') in the audit log. Everything stays on this computer; audio and
 * transcript live in memory only.
 */

export type ListenStatus = 'off' | 'starting' | 'loading' | 'listening' | 'error';

export interface TranscriptLine {
  readonly id: number;
  readonly text: string;
  readonly at: number;
  /** A command that was acted on, or a reference that was heard. */
  readonly kind: 'speech' | 'command' | 'reference';
}

interface ListenState {
  status: ListenStatus;
  error: string | null;
  /** What kind of problem, so the card can offer the right way out. */
  errorKind: 'model' | 'input' | 'other' | null;
  /** 'webgpu' or 'wasm', once the model runs. */
  device: string | null;
  loadProgress: number;
  /** The input's loudness (dBFS) and whether speech is being heard. */
  level: number;
  speaking: boolean;
  lines: TranscriptLine[];
  candidates: Candidate[];
  /** End of speech → text, for the last piece. */
  latencyMs: number | null;
  models: SpeechModelStatus[];
}

const MAX_LINES = 60;
/** Utterances waiting for the model; beyond this the oldest are dropped (stay current). */
const MAX_BACKLOG = 3;

export const useListen = create<ListenState>(() => ({
  status: 'off',
  error: null,
  errorKind: null,
  device: null,
  loadProgress: 0,
  level: -100,
  speaking: false,
  lines: [],
  candidates: [],
  latencyMs: null,
  models: [],
}));

const patch = (p: Partial<ListenState>): void => useListen.setState(p);
const settings = () => useStore.getState().settings;
const mode = (): DetectionMode => useStore.getState().live?.detection.mode ?? 'off';

// ---------- Speech models ----------

export async function refreshModels(): Promise<void> {
  try {
    patch({ models: await q('speech.models') });
  } catch {
    /* the list just stays as it was */
  }
}

let modelWatch: (() => void) | null = null;
/** Keep the models' states current (download progress comes from main). */
export function watchModels(): () => void {
  if (!modelWatch) {
    const off = api.onSpeechModel((s) => {
      const models = useListen.getState().models;
      patch({
        models: models.some((m) => m.id === s.id)
          ? models.map((m) => (m.id === s.id ? s : m))
          : [...models, s],
      });
    });
    void refreshModels();
    modelWatch = off;
  }
  return () => undefined;
}

export const modelReady = (id: string): boolean =>
  useListen.getState().models.find((m) => m.id === id)?.state.kind === 'ready';

// ---------- The pipeline ----------

let transcriber: { model: string; t: Transcriber } | null = null;
let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let segmenter: Segmenter | null = null;
let backlog: Utterance[] = [];
let busy = false;
let lineSeq = 0;
let session = 0;
let expireTimer: ReturnType<typeof setInterval> | null = null;
let liveWatch: (() => void) | null = null;
const detector = new VerseDetector();
const queue = new DetectionQueue({}, newId);

function addLine(text: string, kind: TranscriptLine['kind']): void {
  const lines = [...useListen.getState().lines, { id: ++lineSeq, text, at: Date.now(), kind }];
  patch({ lines: lines.slice(-MAX_LINES) });
}

const syncCandidates = (): void => patch({ candidates: [...queue.list()] });

function transcriberFor(model: string): Transcriber {
  if (transcriber?.model === model) return transcriber.t;
  transcriber?.t.dispose();
  const t = new WhisperTranscriber(model);
  t.onState((s) => {
    if (s.kind === 'loading') patch({ loadProgress: s.progress });
    if (s.kind === 'ready') patch({ device: s.device });
  });
  transcriber = { model, t };
  return t;
}

/** Listening stopped or couldn't start: said in a notice (the card may be out of view) too. */
function fail(kind: NonNullable<ListenState['errorKind']>, message: string): void {
  patch({ status: 'error', error: message, errorKind: kind });
  toast(message, 'error');
}

/** Listening is off (or stopped by a problem). */
export const isListening = (): boolean => {
  const st = useListen.getState().status;
  return st !== 'off' && st !== 'error';
};

/** Turn listening on: the model loads (once), then the input opens. */
export async function startListening(): Promise<void> {
  const st = useListen.getState().status;
  if (st === 'starting' || st === 'loading' || st === 'listening') return;
  const s = settings();
  if (!s) return;
  const run = ++session;
  const model = s.listening.model;
  await refreshModels();
  if (!modelReady(model)) {
    fail('model', i18n.t('listen.needsModel'));
    return;
  }
  patch({ status: 'loading', error: null, errorKind: null, loadProgress: 0 });
  try {
    await transcriberFor(model).load();
    if (run !== session) return;
    patch({ status: 'starting' });
    const id = s.listening.inputDeviceId;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(id ? { deviceId: { exact: id } } : {}),
        channelCount: 1,
        // Speech recognition wants a clean, even voice: the opposite of the mixer's raw input.
        noiseSuppression: true,
        autoGainControl: true,
        echoCancellation: false,
      },
    });
    if (run !== session) return stopTracks();
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(captureUrl);
    if (run !== session) return stopTracks();
    const node = new AudioWorkletNode(ctx, 'listen-capture', { numberOfOutputs: 0 });
    ctx.createMediaStreamSource(stream).connect(node);
    segmenter = new Segmenter({ sampleRate: ctx.sampleRate });
    let lastLevel = 0;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!segmenter) return;
      for (const u of segmenter.push(e.data)) enqueue(u);
      const now = performance.now();
      if (now - lastLevel > 100) {
        lastLevel = now;
        const l = segmenter.level();
        patch({ level: l.db, speaking: l.speaking });
      }
    };
    stream.getTracks()[0]?.addEventListener('ended', () => {
      fail('input', i18n.t('listen.inputLost'));
      stopTracks();
    });
    expireTimer = setInterval(() => {
      if (queue.expire(Date.now())) syncCandidates();
    }, 5000);
    liveWatch = watchLiveScripture();
    patch({ status: 'listening' });
  } catch (e) {
    stopTracks();
    const denied = e instanceof DOMException && e.name === 'NotAllowedError';
    fail(
      denied ? 'input' : 'other',
      denied
        ? i18n.t('listen.noMicAccess')
        : i18n.t('listen.failed', { reason: e instanceof Error ? e.message : String(e) }),
    );
  }
}

function stopTracks(): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
  void ctx?.close().catch(() => undefined);
  ctx = null;
  segmenter = null;
  backlog = [];
  if (expireTimer) clearInterval(expireTimer);
  expireTimer = null;
  liveWatch?.();
  liveWatch = null;
}

/** Turn listening off: the input closes at once (the model stays loaded for next time). */
export function stopListening(): void {
  session++;
  stopTracks();
  patch({ status: 'off', error: null, errorKind: null, level: -100, speaking: false });
}

export const toggleListening = (): Promise<void> =>
  useListen.getState().status === 'off' || useListen.getState().status === 'error'
    ? startListening()
    : Promise.resolve(stopListening());

function enqueue(u: Utterance): void {
  backlog.push(u);
  if (backlog.length > MAX_BACKLOG) backlog = backlog.slice(-MAX_BACKLOG);
  void drain();
}

async function drain(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    for (let u = backlog.shift(); u; u = backlog.shift()) {
      const t = transcriber?.t;
      if (!t) break;
      const heardAt = performance.now();
      try {
        const piece = await t.transcribe(u.samples, u.startMs, u.endMs);
        patch({ latencyMs: Math.round(performance.now() - heardAt) });
        handleText(cleanTranscript(piece.text));
      } catch {
        /* one piece lost; the next one carries on */
      }
    }
  } finally {
    busy = false;
  }
}

/** What a transcribed piece does: a command, references, or just a line of transcript. */
export function handleText(text: string): void {
  if (!text || useListen.getState().status !== 'listening') return;
  const s = settings();
  if (s?.listening.voiceCommands) {
    const command = parseVoiceCommand(text, { wakeWord: s.listening.wakeWord });
    if (command) {
      addLine(text, 'command');
      void runVoiceCommand(command);
      return;
    }
  }
  const m = mode();
  const heard = m === 'off' ? [] : detector.feed(text, Date.now());
  addLine(text, heard.length ? 'reference' : 'speech');
  for (const h of heard) {
    const offered = queue.offer(h, Date.now());
    if (offered.kind === 'suppressed') continue;
    const c = offered.candidate;
    const route = routeDetection(c, m, s?.listening.autoThreshold ?? 0.9);
    if (route === 'show') void showCandidate(c.id, 'auto-detect');
  }
  if (heard.length) syncCandidates();
}

// ---------- Acting on what was heard ----------

const versionId = (): string => settings()?.defaultBibleVersion ?? 'kjv';

/** One passage that covers a candidate's passages (they're in one book and in order). */
function spanOf(passages: readonly PassageRef[]): PassageRef | null {
  const first = passages[0];
  const last = passages[passages.length - 1];
  return first && last ? { start: first.start, end: last.end } : null;
}

const scriptureItem = (passage: PassageRef, version = versionId()): ServiceItem => ({
  id: newId(),
  kind: 'scripture',
  passage,
  versionIds: [version],
});

/** Put a suggestion on screen (Show now, or Auto). */
export async function showCandidate(
  id: string,
  source: 'ui' | 'auto-detect' = 'ui',
): Promise<void> {
  const c = queue.get(id);
  const passage = c && spanOf(c.passages);
  if (!c || !passage) return;
  queue.mark(id, 'shown');
  syncCandidates();
  await openAdhoc(scriptureItem(passage), 'live', { source });
}

/** Load a suggestion into Preview (or select it), without changing the screen. */
export async function previewCandidate(id: string): Promise<void> {
  const c = queue.get(id);
  const passage = c && spanOf(c.passages);
  if (!c || !passage) return;
  queue.mark(id, 'shown');
  syncCandidates();
  await openAdhoc(scriptureItem(passage), 'preview');
}

export function dismissCandidate(id: string, forToday = false): void {
  if (forToday) queue.block(id);
  else queue.mark(id, 'dismissed');
  syncCandidates();
}

/** The newest waiting suggestion (for the "show it" hotkey). */
export const newestPending = (): Candidate | undefined => queue.pending()[0];

export function clearCandidates(): void {
  queue.clear();
  syncCandidates();
}

export const describePassages = (passages: readonly PassageRef[]): string =>
  passages.map((p) => formatPassage(p)).join('; ');

/** The scripture on screen now (the live item, or a Bible pick shown live). */
function liveScripture(): Extract<ServiceItem, { kind: 'scripture' }> | null {
  const st = useStore.getState();
  const item = findItem(st.liveCursor?.itemId ?? null);
  return item?.kind === 'scripture' ? item : null;
}

/** What the operator shows becomes the context for "verse 5". */
function watchLiveScripture(): () => void {
  let last = '';
  const check = (): void => {
    const it = liveScripture();
    const key = it ? `${it.passage.end.book}.${it.passage.end.chapter}` : '';
    if (!it || key === last) return;
    last = key;
    detector.setContext({ book: it.passage.end.book, chapter: it.passage.end.chapter }, Date.now());
  };
  check();
  return useStore.subscribe(check);
}

/** The verse after (or before) the scripture on screen. */
async function stepVerse(delta: 1 | -1): Promise<void> {
  const it = liveScripture();
  if (!it) return;
  const counts = useStore.getState().verseCounts[it.versionIds[0] ?? versionId()];
  const inChapter = (book: PassageRef['start']['book'], chapter: number): number =>
    counts?.[book]?.[chapter - 1] ?? 0;
  const at = delta > 0 ? it.passage.end : it.passage.start;
  const v = delta > 0 ? nextVerse(at, inChapter) : prevVerse(at, inChapter);
  if (!v) return;
  await openAdhoc(scriptureItem({ start: v, end: v }, it.versionIds[0]), 'live', {
    source: 'voice',
  });
}

/** "Next" / "go back": the next slide, or on a verse shown on its own, the next verse. */
async function stepSlideOrVerse(delta: 1 | -1): Promise<void> {
  const st = useStore.getState();
  const cursor = st.liveCursor;
  const item = findItem(cursor?.itemId ?? null);
  if (cursor && item) {
    const target = stepTarget({
      scripture: item.kind === 'scripture',
      inPlaylist: !!st.service?.items.some((i) => i.id === item.id),
      index: cursor.index,
      slides: slidesFor(item).length,
      delta,
    });
    if (target === 'verse') return stepVerse(delta);
  }
  return stepAcross(delta, 'voice');
}

/** Show the scripture on screen in another version, and use it from now on. */
async function switchVersion(name: string): Promise<void> {
  const id = matchVersion(name, useStore.getState().versions);
  if (!id) {
    addLine(i18n.t('listen.noVersion', { name }), 'command');
    return;
  }
  await saveSettings({ defaultBibleVersion: id });
  const it = liveScripture();
  if (it) await openAdhoc(scriptureItem(it.passage, id), 'live', { source: 'voice' });
}

export async function runVoiceCommand(c: VoiceCommand): Promise<void> {
  switch (c.kind) {
    case 'next':
      return stepSlideOrVerse(1);
    case 'previous':
      return stepSlideOrVerse(-1);
    case 'nextItem':
      return stepItem(1, 'voice');
    case 'previousItem':
      return stepItem(-1, 'voice');
    case 'nextVerse':
      return stepVerse(1);
    case 'previousVerse':
      return stepVerse(-1);
    case 'goLive':
      return goLive('voice');
    case 'clear':
      return clearLayer('content', 'voice');
    case 'black':
      return setMask('black', true, 'voice');
    case 'logo':
      return setMask('logo', true, 'voice');
    case 'restore': {
      // Lift a mask first; otherwise bring back what was cleared.
      const masks = useStore.getState().live?.program.masks;
      if (masks?.black) return setMask('black', false, 'voice');
      if (masks?.logo) return setMask('logo', false, 'voice');
      return restoreAll();
    }
    case 'show': {
      const passage = spanOf(c.passages);
      if (passage) await openAdhoc(scriptureItem(passage), 'live', { source: 'voice' });
      return;
    }
    case 'version':
      return switchVersion(c.name);
  }
}

/** Off / Suggest / Approve / Auto (shared with the stage display and remotes via live state). */
export const setDetectionMode = (m: DetectionMode): Promise<unknown> =>
  cmd('detection.setMode', { mode: m });
