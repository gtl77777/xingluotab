import type { Collision, CollisionDetection } from "@dnd-kit/core";
import { describe, expect, it, vi } from "vitest";
import { createBufferedCollisionDetection } from "../../../src/features/dnd/bufferedCollision";

describe("createBufferedCollisionDetection", () => {
  it("reuses the accepted result inside the response interval", () => {
    let timestamp = 0;
    let candidate = collision("group:a");
    const base = vi.fn(() => candidate) as unknown as CollisionDetection;
    const controller = createBufferedCollisionDetection(base, {
      intervalMs: 40,
      switchDelayMs: 45,
      movementThresholdPx: 12,
      now: () => timestamp
    });

    expect(controller.detect(args(0, 0))[0]?.id).toBe("group:a");
    candidate = collision("tab:b");
    timestamp = 20;
    expect(controller.detect(args(3, 4))[0]?.id).toBe("group:a");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("requires a stable dwell before switching targets", () => {
    let timestamp = 0;
    let candidate = collision("group:a");
    const controller = createBufferedCollisionDetection(() => candidate, {
      intervalMs: 40,
      switchDelayMs: 45,
      movementThresholdPx: 12,
      now: () => timestamp
    });

    expect(controller.detect(args(0, 0))[0]?.id).toBe("group:a");
    candidate = collision("tab:b");
    timestamp = 10;
    expect(controller.detect(args(20, 0))[0]?.id).toBe("group:a");
    timestamp = 60;
    expect(controller.detect(args(21, 0))[0]?.id).toBe("tab:b");
  });

  it("recomputes early after meaningful pointer travel", () => {
    let timestamp = 0;
    const base = vi.fn(() => collision("group:a")) as unknown as CollisionDetection;
    const controller = createBufferedCollisionDetection(base, {
      intervalMs: 40,
      movementThresholdPx: 12,
      now: () => timestamp
    });

    controller.detect(args(0, 0));
    timestamp = 5;
    controller.detect(args(13, 0));
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("tracks the latest pointer for safe drop validation and resets between drags", () => {
    let timestamp = 0;
    const controller = createBufferedCollisionDetection(() => collision("group:a"), {
      now: () => timestamp
    });

    controller.detect(args(40, 30));
    expect(controller.getLatestCollision()?.id).toBe("group:a");
    expect(controller.getLatestPointer()).toEqual({ x: 40, y: 30 });
    expect(controller.isLatestPointerWithin({ left: 20, right: 60, top: 20, bottom: 40 })).toBe(true);
    expect(controller.isLatestPointerWithin({ left: 0, right: 10, top: 0, bottom: 10 })).toBe(false);

    controller.reset();
    timestamp = 10;
    expect(controller.getLatestCollision()).toBeNull();
    expect(controller.getLatestPointer()).toBeNull();
    expect(controller.isLatestPointerWithin({ left: 0, right: 0, top: 0, bottom: 0 })).toBe(true);
  });

  it("pauses hit testing while the content is scrolling", () => {
    const base = vi.fn(() => collision("group:a")) as unknown as CollisionDetection;
    const controller = createBufferedCollisionDetection(base);

    controller.setSuspended(true);
    expect(controller.detect(args(20, 20))).toEqual([]);
    expect(controller.getLatestCollision()).toBeNull();
    expect(base).not.toHaveBeenCalled();

    controller.setSuspended(false);
    expect(controller.detect(args(20, 20))[0]?.id).toBe("group:a");
    expect(base).toHaveBeenCalledTimes(1);
  });
});

function collision(id: string): Collision[] {
  return [{ id }];
}

function args(x: number, y: number) {
  return {
    active: { id: "active" },
    pointerCoordinates: { x, y },
    collisionRect: {},
    droppableRects: new Map(),
    droppableContainers: []
  } as never;
}
