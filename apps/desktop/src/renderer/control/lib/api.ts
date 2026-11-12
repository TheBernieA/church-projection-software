import type { AppErrorShape } from '@lampstand/core';
import type { QueryArgs, QueryName, QueryResults } from '@lampstand/ipc-contract';
import '../../shared/output-api.d';

export class ApiError extends Error {
  constructor(readonly shape: AppErrorShape) {
    super(shape.message);
  }
}

export const api = window.lampstand;

/** Query helper that throws ApiError on failure. */
export async function q<K extends QueryName>(
  name: K,
  args?: QueryArgs<K>,
): Promise<QueryResults[K]> {
  const r = await api.query(name, args);
  if (!r.ok) throw new ApiError(r.error);
  return r.value;
}

/** Dispatch a command; resolves to the result or throws ApiError. */
export async function cmd<R = unknown>(
  type: string,
  payload: unknown = {},
  source: 'ui' | 'shortcut' = 'ui',
): Promise<R> {
  const r = await api.command({ type, payload, source });
  if (!r.ok) throw new ApiError(r.error);
  return r.value as R;
}
