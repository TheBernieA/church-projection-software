import { describe, expect, it } from 'vitest';
import { resolveStageLayout, STAGE_PRESETS, type StageLayout } from './schemas/stage';

describe('stage layouts', () => {
  const mine: StageLayout = { id: 'mine', name: 'Mine', elements: [] };

  it('uses the chosen layout, a ready-made one, or Classic', () => {
    expect(resolveStageLayout([mine], 'mine').id).toBe('mine');
    expect(resolveStageLayout([mine], 'preset-clock').id).toBe('preset-clock');
    expect(resolveStageLayout([mine], 'gone').id).toBe('preset-classic');
    expect(resolveStageLayout([], null).id).toBe('preset-classic');
  });

  it('ready-made layouts keep every box on screen', () => {
    for (const l of STAGE_PRESETS)
      for (const e of l.elements) {
        expect(e.x + e.w).toBeLessThanOrEqual(100);
        expect(e.y + e.h).toBeLessThanOrEqual(100);
      }
  });
});
