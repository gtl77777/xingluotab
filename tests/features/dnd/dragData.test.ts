import { describe, expect, it } from "vitest";
import { dndId } from "../../../src/features/dnd/dragData";

describe("dndId", () => {
  it("keeps a tab identity stable while it moves between groups", () => {
    expect(dndId.tab("space-a", "group-a", "tab-a")).toBe(
      dndId.tab("space-a", "group-b", "tab-a")
    );
  });

  it("keeps tabs from different spaces distinct", () => {
    expect(dndId.tab("space-a", "group-a", "tab-a")).not.toBe(
      dndId.tab("space-b", "group-a", "tab-a")
    );
  });
});
