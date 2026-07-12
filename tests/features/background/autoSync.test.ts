import { describe, expect, it, vi } from "vitest";
import { createAutoSyncScheduler } from "../../../src/features/background/autoSync";

type Timer = {
  callback: () => void;
  delay: number;
};

describe("auto sync scheduler", () => {
  it("debounces repeated schedules", () => {
    const timers: Timer[] = [];
    const cleared: Timer[] = [];
    const scheduler = createAutoSyncScheduler({
      run: vi.fn(async () => undefined),
      setTimer(callback, delay) {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
      },
      clearTimer(timer) {
        cleared.push(timer as Timer);
      }
    });

    scheduler.schedule();
    scheduler.schedule();

    expect(cleared).toEqual([timers[0]]);
    expect(timers.map((timer) => timer.delay)).toEqual([5000, 5000]);
  });

  it("throttles runs after an execution", async () => {
    let now = 10000;
    const timers: Timer[] = [];
    const run = vi.fn(async () => undefined);
    const scheduler = createAutoSyncScheduler({
      run,
      debounceMs: 100,
      throttleMs: 600,
      now: () => now,
      setTimer(callback, delay) {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
      },
      clearTimer() {
        // test-only timer registry
      }
    });

    scheduler.schedule();
    timers[0]?.callback();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    now = 10100;
    scheduler.schedule();
    timers[1]?.callback();
    expect(timers[2]?.delay).toBe(500);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
