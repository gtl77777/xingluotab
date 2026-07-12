import { describe, expect, it } from "vitest";
import { getAdjacentSpaceId, getSpaceNavigationDirection } from "../../../src/features/space/navigation";

const spaces = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" }
];

describe("space keyboard navigation", () => {
  it("wraps to the previous and next space", () => {
    expect(getAdjacentSpaceId(spaces, "a", -1)).toBe("c");
    expect(getAdjacentSpaceId(spaces, "c", 1)).toBe("a");
    expect(getAdjacentSpaceId(spaces, "missing", 1)).toBeUndefined();
  });

  it("recognizes legacy Alt and platform Shift shortcuts", () => {
    expect(getSpaceNavigationDirection({ altKey: true, ctrlKey: false, key: "ArrowUp", metaKey: false, shiftKey: false })).toBe(-1);
    expect(getSpaceNavigationDirection({ altKey: false, ctrlKey: true, key: "ArrowDown", metaKey: false, shiftKey: true })).toBe(1);
    expect(getSpaceNavigationDirection({ altKey: false, ctrlKey: false, key: "ArrowDown", metaKey: true, shiftKey: true })).toBe(1);
    expect(getSpaceNavigationDirection({ altKey: false, ctrlKey: true, key: "ArrowDown", metaKey: false, shiftKey: false })).toBe(0);
  });
});
