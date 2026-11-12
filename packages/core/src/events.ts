/** Minimal typed event bus. Features plug in by subscribing (§3.2). */
export type Unsubscribe = () => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const l of [...set]) {
      try {
        (l as (p: Events[K]) => void)(payload);
      } catch {
        // A faulty subscriber must never break the emitter (e.g. live output updates).
      }
    }
  }
}
