const INITIAL_DELAY_MS = 500;
const BACKOFF_FACTOR = 1.5;
const MAX_DELAY_MS = 8000;

export type PollOptions<T> = {
  fetch: () => Promise<T>;
  isSettled: (value: T) => boolean;
  onUpdate: (value: T) => void;
  onError: (error: unknown) => void;
};

export function startPolling<T>(options: PollOptions<T>): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = INITIAL_DELAY_MS;

  async function tick(): Promise<void> {
    try {
      const value = await options.fetch();

      if (cancelled) {
        return;
      }

      options.onUpdate(value);

      if (options.isSettled(value)) {
        return;
      }
    } catch (error) {
      if (cancelled) {
        return;
      }

      options.onError(error);
      delay = MAX_DELAY_MS;
    }

    if (cancelled) {
      return;
    }

    timer = setTimeout(() => {
      void tick();
    }, delay);

    delay = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY_MS);
  }

  void tick();

  return () => {
    cancelled = true;

    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };
}
