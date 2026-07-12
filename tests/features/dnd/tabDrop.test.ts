import { describe, expect, it } from "vitest";
import { getSameGroupDropIndex, getTabInsertionIndex, getTabInsertionIndexFromPointer, type RectLike } from "../../../src/features/dnd/tabDrop";

const target: RectLike = { top: 100, left: 200, width: 120, height: 56 };

describe("getTabInsertionIndex", () => {
  it("uses horizontal centers for cards in the same grid row", () => {
    expect(getTabInsertionIndex(2, { top: 100, left: 150, width: 120, height: 56 }, target)).toBe(2);
    expect(getTabInsertionIndex(2, { top: 100, left: 270, width: 120, height: 56 }, target)).toBe(3);
  });

  it("uses vertical centers when the dragged card is on another row", () => {
    expect(getTabInsertionIndex(2, { top: 30, left: 200, width: 120, height: 56 }, target)).toBe(2);
    expect(getTabInsertionIndex(2, { top: 170, left: 200, width: 120, height: 56 }, target)).toBe(3);
  });

  it("defaults to inserting before when no translated active rectangle exists", () => {
    expect(getTabInsertionIndex(2, null, target)).toBe(2);
  });

  it("uses the final pointer half for deterministic grid and list drops", () => {
    expect(getTabInsertionIndexFromPointer(2, { x: 220, y: 150 }, target, "horizontal")).toBe(2);
    expect(getTabInsertionIndexFromPointer(2, { x: 300, y: 110 }, target, "horizontal")).toBe(3);
    expect(getTabInsertionIndexFromPointer(2, { x: 210, y: 110 }, target, "vertical")).toBe(2);
    expect(getTabInsertionIndexFromPointer(2, { x: 210, y: 150 }, target, "vertical")).toBe(3);
  });

  it("always moves an item onto an adjacent same-group target", () => {
    expect(getSameGroupDropIndex(0, 1)).toBe(2);
    expect(getSameGroupDropIndex(1, 0)).toBe(0);
    expect(getSameGroupDropIndex(1, 2)).toBe(3);
    expect(getSameGroupDropIndex(2, 1)).toBe(1);
  });
});
