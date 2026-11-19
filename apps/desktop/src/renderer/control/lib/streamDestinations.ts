import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newId, type StreamDestination } from '@lampstand/core';
import { cmd, q } from './api';
import { attempt } from './store';

/**
 * The stream's destinations, edited the same way from Settings › Streaming and the Live console:
 * which have a saved key, and adding, changing and removing one (its key goes with it).
 */
export function useDestinations(
  destinations: StreamDestination[],
  save: (next: StreamDestination[]) => void,
): {
  keys: Record<string, boolean>;
  loadKeys: () => void;
  patch: (id: string, p: Partial<StreamDestination>) => void;
  /** Adds one of this kind; returns its id. */
  add: (kind: StreamDestination['kind']) => string;
  remove: (d: StreamDestination) => Promise<void>;
} {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const loadKeys = useCallback(() => void q('stream.keys').then(setKeys, () => undefined), []);
  useEffect(loadKeys, [loadKeys, destinations.length]);
  return {
    keys,
    loadKeys,
    patch: (id, p) => save(destinations.map((d) => (d.id === id ? { ...d, ...p } : d))),
    add: (kind) => {
      const id = newId();
      save([
        ...destinations,
        { id, kind, name: t(`streaming.kinds.${kind}`), url: '', enabled: true },
      ]);
      return id;
    },
    remove: async (d) => {
      await attempt(() => cmd('stream.setKey', { destinationId: d.id, key: null }), 'errors.save');
      save(destinations.filter((x) => x.id !== d.id));
    },
  };
}
