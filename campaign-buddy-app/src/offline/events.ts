/** Minimal typed pub/sub, so contexts that don't nest (sync engine ↔ attendance) can react to each other. */
export function createEmitter<T = void>() {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value: T): void {
      listeners.forEach((l) => {
        try {
          l(value);
        } catch {
          // a broken listener must not stop the rest
        }
      });
    },
    subscribe(listener: (value: T) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Fired after every sync pass that sent, refused or parked anything — screens holding server-derived state should refresh. */
export const syncedEvents = createEmitter<void>();
