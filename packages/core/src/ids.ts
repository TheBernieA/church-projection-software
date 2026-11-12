import { v7 as uuidv7 } from 'uuid';

/** Time-sortable UUID v7 used for every entity id. */
export type ID = string;

export function newId(): ID {
  return uuidv7();
}

export function nowIso(): string {
  return new Date().toISOString();
}
