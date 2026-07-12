import type { Collision, CollisionDetection } from "@dnd-kit/core";

type Coordinates = { x: number; y: number };
type RectLike = { left: number; right: number; top: number; bottom: number };

export type BufferedCollisionOptions = {
  intervalMs?: number;
  switchDelayMs?: number;
  movementThresholdPx?: number;
  now?: () => number;
};

export type BufferedCollisionController = {
  detect: CollisionDetection;
  reset: () => void;
  getLatestCollision: () => Collision | null;
  getLatestPointer: () => Coordinates | null;
  setSuspended: (suspended: boolean) => void;
  isLatestPointerWithin: (rect: RectLike) => boolean;
};

const DEFAULT_INTERVAL_MS = 40;
const DEFAULT_SWITCH_DELAY_MS = 45;
const DEFAULT_MOVEMENT_THRESHOLD_PX = 12;

export function createBufferedCollisionDetection(
  baseDetection: CollisionDetection,
  options: BufferedCollisionOptions = {}
): BufferedCollisionController {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const switchDelayMs = options.switchDelayMs ?? DEFAULT_SWITCH_DELAY_MS;
  const movementThresholdSquared = (options.movementThresholdPx ?? DEFAULT_MOVEMENT_THRESHOLD_PX) ** 2;
  const now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());

  let activeId: string | number | null = null;
  let accepted: Collision[] = [];
  let pending: Collision[] = [];
  let pendingSince = 0;
  let hasPending = false;
  let lastComputedAt = Number.NEGATIVE_INFINITY;
  let lastComputedPointer: Coordinates | null = null;
  let latestPointer: Coordinates | null = null;
  let latestCollision: Collision | null = null;
  let isSuspended = false;

  const resetState = () => {
    activeId = null;
    accepted = [];
    pending = [];
    pendingSince = 0;
    hasPending = false;
    lastComputedAt = Number.NEGATIVE_INFINITY;
    lastComputedPointer = null;
    latestPointer = null;
    latestCollision = null;
  };

  const detect: CollisionDetection = (args) => {
    const nextActiveId = args.active.id;
    if (activeId !== nextActiveId) {
      resetState();
      activeId = nextActiveId;
    }

    latestPointer = args.pointerCoordinates;
    if (isSuspended && args.pointerCoordinates) {
      accepted = [];
      pending = [];
      hasPending = false;
      latestCollision = null;
      return accepted;
    }
    if (!args.pointerCoordinates) {
      accepted = baseDetection(args);
      latestCollision = accepted[0] ?? null;
      hasPending = false;
      return accepted;
    }

    const timestamp = now();
    const movedFarEnough = lastComputedPointer
      ? squaredDistance(lastComputedPointer, args.pointerCoordinates) >= movementThresholdSquared
      : true;
    if (!movedFarEnough && timestamp - lastComputedAt < intervalMs) return accepted;

    lastComputedAt = timestamp;
    lastComputedPointer = args.pointerCoordinates;
    const candidate = baseDetection(args);
    latestCollision = candidate[0] ?? null;
    const candidateId = firstCollisionId(candidate);
    const acceptedId = firstCollisionId(accepted);

    if (candidateId === acceptedId) {
      accepted = candidate;
      hasPending = false;
      return accepted;
    }

    // The first real target should still respond immediately. Only switching
    // away from an already accepted target needs dwell time.
    if (acceptedId == null && candidateId != null) {
      accepted = candidate;
      hasPending = false;
      return accepted;
    }

    if (!hasPending || firstCollisionId(pending) !== candidateId) {
      pending = candidate;
      pendingSince = timestamp;
      hasPending = true;
      return accepted;
    }

    if (timestamp - pendingSince < switchDelayMs) return accepted;
    accepted = pending;
    hasPending = false;
    return accepted;
  };

  return {
    detect,
    reset: resetState,
    getLatestCollision() {
      return latestCollision;
    },
    getLatestPointer() {
      return latestPointer ? { ...latestPointer } : null;
    },
    setSuspended(suspended) {
      isSuspended = suspended;
      if (suspended) {
        accepted = [];
        pending = [];
        hasPending = false;
        latestCollision = null;
      } else {
        lastComputedAt = Number.NEGATIVE_INFINITY;
        lastComputedPointer = null;
      }
    },
    isLatestPointerWithin(rect) {
      if (!latestPointer) return true;
      return (
        latestPointer.x >= rect.left &&
        latestPointer.x <= rect.right &&
        latestPointer.y >= rect.top &&
        latestPointer.y <= rect.bottom
      );
    }
  };
}

function firstCollisionId(collisions: Collision[]) {
  return collisions[0]?.id ?? null;
}

function squaredDistance(left: Coordinates, right: Coordinates) {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
}
