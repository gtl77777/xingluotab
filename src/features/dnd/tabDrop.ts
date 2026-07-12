export type RectLike = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type PointLike = { x: number; y: number };
export type InsertionAxis = "horizontal" | "vertical";

export function getTabInsertionIndex(
  overIndex: number,
  activeRect: RectLike | null,
  overRect: RectLike
) {
  if (!activeRect) return overIndex;

  const activeCenterX = activeRect.left + activeRect.width / 2;
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterX = overRect.left + overRect.width / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  const sameRow = Math.abs(activeCenterY - overCenterY) < Math.max(activeRect.height, overRect.height) / 2;
  const insertAfter = sameRow ? activeCenterX > overCenterX : activeCenterY > overCenterY;

  return overIndex + (insertAfter ? 1 : 0);
}

export function getTabInsertionIndexFromPointer(
  overIndex: number,
  pointer: PointLike | null,
  overRect: RectLike,
  axis: InsertionAxis
) {
  if (!pointer) return overIndex;
  const insertAfter = axis === "vertical"
    ? pointer.y > overRect.top + overRect.height / 2
    : pointer.x > overRect.left + overRect.width / 2;
  return overIndex + (insertAfter ? 1 : 0);
}

export function getSameGroupDropIndex(sourceIndex: number, overIndex: number) {
  if (sourceIndex < 0 || overIndex < 0 || sourceIndex === overIndex) return sourceIndex;
  return sourceIndex < overIndex ? overIndex + 1 : overIndex;
}
