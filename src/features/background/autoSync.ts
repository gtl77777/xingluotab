export type AutoSyncSchedulerOptions = {
  run: () => Promise<unknown>;
  debounceMs?: number;
  throttleMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

export function createAutoSyncScheduler({
  run,
  debounceMs = 5000,
  throttleMs = 6000,
  now = Date.now,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>)
}: AutoSyncSchedulerOptions) {
  let timer: unknown = null;
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let running = false;

  async function execute() {
    timer = null;
    const delay = Math.max(0, throttleMs - (now() - lastRunAt));
    if (delay > 0) {
      timer = setTimer(() => void execute(), delay);
      return;
    }

    if (running) {
      timer = setTimer(() => void execute(), throttleMs);
      return;
    }

    running = true;
    try {
      await run();
      lastRunAt = now();
    } finally {
      running = false;
    }
  }

  return {
    schedule() {
      if (timer != null) clearTimer(timer);
      timer = setTimer(() => void execute(), debounceMs);
    },
    cancel() {
      if (timer != null) clearTimer(timer);
      timer = null;
    }
  };
}
