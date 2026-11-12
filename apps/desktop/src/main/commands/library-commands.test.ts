import { describe, expect, it } from 'vitest';
import { CommandBus, type ServicePlan } from '@lampstand/core';
import { MemoryRepository } from '../storage/repository';
import { registerLibraryCommands } from './library-commands';

const plan = (name: string): ServicePlan => ({
  id: 'svc-1',
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name,
  isTemplate: false,
  items: [],
});

function setup() {
  const bus = new CommandBus();
  const services = new MemoryRepository<ServicePlan>();
  registerLibraryCommands(bus, {
    songs: new MemoryRepository(),
    services,
    themes: new MemoryRepository(),
  });
  const save = (p: ServicePlan) =>
    bus.dispatch({ type: 'service.save', payload: { entity: p }, source: 'ui' });
  return { bus, services, save };
}

describe('entity save/undo', () => {
  it('a save with identical content is not an undo step', async () => {
    const { bus, save } = setup();
    await save(plan('A'));
    await save(plan('B'));
    expect(bus.history().undo).toHaveLength(2);
    await save({ ...plan('B'), updatedAt: '2030-01-01T00:00:00.000Z' }); // same content, new timestamp
    expect(bus.history().undo).toHaveLength(2);
  });

  it('undo restores the previous version, redo re-applies it', async () => {
    const { bus, services, save } = setup();
    await save(plan('A'));
    await save(plan('B'));
    await bus.undo();
    expect((await services.get('svc-1'))?.name).toBe('A');
    await bus.redo();
    expect((await services.get('svc-1'))?.name).toBe('B');
    await bus.undo();
    await bus.undo();
    expect(await services.get('svc-1')).toBeNull(); // undoing the first save deletes it again
  });
});
