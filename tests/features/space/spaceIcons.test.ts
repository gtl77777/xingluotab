import dynamicIconImports from "lucide-react/dynamicIconImports";
import { describe, expect, it } from "vitest";
import {
  isKnownSpaceIcon,
  normalizeSpaceIconName,
  SPACE_ICON_NAMES
} from "../../../src/features/space/spaceIcons";

describe("space icons", () => {
  it("matches the 1.0 whitelist with 304 unique loadable icons", () => {
    expect(SPACE_ICON_NAMES).toHaveLength(304);
    expect(new Set(SPACE_ICON_NAMES).size).toBe(304);
    expect(SPACE_ICON_NAMES.every((name) => typeof dynamicIconImports[name] === "function")).toBe(true);
  });

  it("accepts whitelist keys and normalizes legacy PascalCase keys", () => {
    expect(isKnownSpaceIcon("activity")).toBe(true);
    expect(isKnownSpaceIcon("not-a-real-icon")).toBe(false);
    expect(normalizeSpaceIconName("BookOpen")).toBe("book-open");
    expect(normalizeSpaceIconName("not-a-real-icon")).toBeUndefined();
  });
});
