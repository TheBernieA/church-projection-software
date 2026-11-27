/**
 * Speech to text, whatever does it (BUILD_SPEC §0.8: "local speech model → cloud model" without
 * touching the UI). Today: Whisper in a worker in the control window. A native utilityProcess
 * or a cloud engine implements the same interface.
 */

export type TranscriberState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly progress: number }
  | { readonly kind: 'ready'; readonly device: string }
  | { readonly kind: 'error'; readonly message: string };

export interface TranscriptPiece {
  readonly text: string;
  /** Where the audio sat in the input stream. */
  readonly startMs: number;
  readonly endMs: number;
  /** How long transcribing took (for the latency readout). */
  readonly tookMs: number;
}

export interface Transcriber {
  /** Load the model (once); resolves when ready. */
  load(): Promise<void>;
  /** 16 kHz mono samples of one utterance. */
  transcribe(samples: Float32Array, startMs: number, endMs: number): Promise<TranscriptPiece>;
  onState(cb: (s: TranscriberState) => void): () => void;
  dispose(): void;
}

/**
 * Whisper's well-known inventions on silence or noise. A piece that is only one of these is
 * dropped, never shown or acted on.
 */
const HALLUCINATIONS = [
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'thank you so much for watching',
  'please subscribe',
  'subscribe',
  'you',
  'bye',
  'music',
  'applause',
  'silence',
  'blank audio',
];

/** The transcript cleaned up: tags like [MUSIC] removed, and nothing if it's only noise. */
export function cleanTranscript(text: string): string {
  const t = text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bare = t
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim();
  if (!bare || HALLUCINATIONS.includes(bare)) return '';
  return t;
}
