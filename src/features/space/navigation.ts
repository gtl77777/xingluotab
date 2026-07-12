import type { SpaceSummary } from "../../domain/space/schema";

type SpaceNavigationKey = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

export function getSpaceNavigationDirection(event: SpaceNavigationKey): -1 | 0 | 1 {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return 0;
  const hasShortcutModifier = event.altKey || ((event.metaKey || event.ctrlKey) && event.shiftKey);
  if (!hasShortcutModifier) return 0;
  return event.key === "ArrowUp" ? -1 : 1;
}

export function getAdjacentSpaceId(spaces: SpaceSummary[], currentSpaceId: string, direction: -1 | 1) {
  if (spaces.length === 0) return undefined;
  const currentIndex = spaces.findIndex((space) => space.id === currentSpaceId);
  if (currentIndex === -1) return undefined;
  return spaces[(currentIndex + direction + spaces.length) % spaces.length]?.id;
}
