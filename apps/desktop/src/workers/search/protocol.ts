import type { SearchHit } from '@lampstand/ipc-contract';

export interface SongDoc {
  id: string;
  title: string;
  firstLine: string;
  lyrics: string;
  authors: string;
  ccli: string;
  hymn: string;
  tags: string;
  isHymn: boolean;
}

export type ToWorker =
  | { type: 'init'; biblesDir: string; cacheDir: string }
  | { type: 'bibles'; versions: { id: string; checksum: string }[] }
  | { type: 'songs'; docs: SongDoc[] }
  | { type: 'query'; id: number; text: string; limit: number; versionId?: string };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'indexed'; what: 'songs' | 'bible'; versionId?: string; ms: number }
  | { type: 'result'; id: number; hits: SearchHit[]; ms: number }
  | { type: 'error'; id?: number; message: string };
