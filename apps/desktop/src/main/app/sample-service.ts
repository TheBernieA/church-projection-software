import { newId, nowIso, SERVICE_SCHEMA_VERSION, type ServicePlan } from '@lampstand/core';

/** Pre-loaded sample service so a new operator can try everything immediately (§15.3). */
export function sampleService(hymnIds: string[]): ServicePlan {
  const now = nowIso();
  const songs = hymnIds
    .slice(0, 4)
    .map((songId) => ({ id: newId(), kind: 'song' as const, songId }));
  return {
    id: newId(),
    schemaVersion: SERVICE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    name: 'Sample Sunday service',
    isTemplate: false,
    items: [
      { id: newId(), kind: 'header', label: 'Walk-in' },
      // A duration (not a fixed time) so the countdown starts fresh whenever it goes live.
      { id: newId(), kind: 'countdown', title: 'Service begins in', target: { durationSec: 300 } },
      {
        id: newId(),
        kind: 'announcements',
        title: 'Welcome',
        loopIntervalSec: 8,
        slides: [
          { id: newId(), title: 'Welcome', body: 'We are glad you are here.' },
          { id: newId(), title: 'Connect', body: 'Visit the welcome desk after the service.' },
        ],
      },
      { id: newId(), kind: 'header', label: 'Worship' },
      ...songs.slice(0, 2),
      { id: newId(), kind: 'header', label: 'Word' },
      {
        id: newId(),
        kind: 'scripture',
        passage: {
          start: { book: 'PSA', chapter: 23, verse: 1 },
          end: { book: 'PSA', chapter: 23, verse: 6 },
        },
        versionIds: ['kjv'],
      },
      {
        id: newId(),
        kind: 'scripture',
        passage: {
          start: { book: 'JHN', chapter: 3, verse: 16 },
          end: { book: 'JHN', chapter: 3, verse: 17 },
        },
        versionIds: ['kjv'],
      },
      {
        id: newId(),
        kind: 'scripture',
        passage: {
          start: { book: 'ROM', chapter: 8, verse: 28 },
          end: { book: 'ROM', chapter: 8, verse: 39 },
        },
        versionIds: ['kjv'],
      },
      { id: newId(), kind: 'header', label: 'Response' },
      ...songs.slice(2, 4),
    ],
  };
}
