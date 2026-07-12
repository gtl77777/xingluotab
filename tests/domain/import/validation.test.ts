import { describe, expect, it } from "vitest";
import { createSpaceBackup } from "../../../src/domain/import/backupRepository";
import { validateBackup, validateSingleSpace } from "../../../src/domain/import/validation";
import type { Backup } from "../../../src/domain/sync/schema";

const validBackup: Backup = {
  schemaVersion: 1,
  type: "xingluotab-backup",
  dataVersion: 1700000000000,
  spaceList: [{ id: "space-a", name: "Main" }],
  spaces: {
    "space-a": {
      id: "space-a",
      name: "Main",
      groups: [
        {
          id: "group-a",
          name: "Work",
          tabs: [
            {
              id: "tab-a",
              kind: "record",
              title: "Example",
              url: "https://example.com/"
            }
          ]
        }
      ],
      pins: {}
    }
  }
};

describe("backup validation", () => {
  it("accepts a complete backup object", () => {
    expect(validateBackup(validBackup)).toEqual({ ok: true, value: validBackup, issues: [] });
  });

  it("rejects a complete backup with missing required pins", () => {
    const incompleteSpace = { ...validBackup.spaces["space-a"] } as Partial<Backup["spaces"][string]>;
    delete incompleteSpace.pins;
    const result = validateBackup({
      ...validBackup,
      spaces: { "space-a": incompleteSpace }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((item) => item.code)).toContain("space.pins");
  });

  it("rejects backup with an empty space list", () => {
    const result = validateBackup({ ...validBackup, spaceList: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("backup.spaceList");
  });

  it("rejects a summary without a matching space object", () => {
    const result = validateBackup({
      ...validBackup,
      spaceList: [{ id: "missing", name: "Missing" }]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("space.missing");
  });

  it.each([Number.NaN, -1, 1.5])("rejects an invalid backup data version: %s", (dataVersion) => {
    const result = validateBackup({ ...validBackup, dataVersion });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((item) => item.code)).toContain("backup.dataVersion");
  });

  it("rejects unknown or missing XingLuoTab schema identity", () => {
    const wrongVersion = validateBackup({ ...validBackup, schemaVersion: 2 });
    const missingType = validateBackup({ ...validBackup, type: undefined });

    expect(wrongVersion.ok).toBe(false);
    expect(missingType.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.issues.map((item) => item.code)).toContain("backup.schemaVersion");
    if (!missingType.ok) expect(missingType.issues.map((item) => item.code)).toContain("backup.type");
  });

  it("rejects invalid and unknown pins in a complete backup", () => {
    const result = validateBackup({
      ...validBackup,
      spaces: {
        "space-a": {
          ...validBackup.spaces["space-a"],
          pins: { "group-a": -1, missing: 10 }
        }
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toEqual(
        expect.arrayContaining(["space.pin.value", "space.pin.unknownGroup"])
      );
    }
  });

  it("rejects an unwrapped legacy single-space object", () => {
    const result = validateSingleSpace(validBackup.spaces["space-a"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((item) => item.code)).toContain("spaceBackup.type");
  });

  it("rejects unsafe XingLuoTab single-space tab shapes", () => {
    const spaceBackup = createSpaceBackup(structuredClone(validBackup.spaces["space-a"]!));
    (spaceBackup.space.groups[0]!.tabs[0] as unknown as { url: unknown }).url = 42;
    const result = validateSingleSpace(spaceBackup);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((item) => item.code)).toContain("tab.url");
  });

  it.each(["javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,<script>alert(1)</script>"])(
    "rejects unsafe imported navigation URL: %s",
    (url) => {
      const backup = structuredClone(validBackup);
      backup.spaces["space-a"]!.groups[0]!.tabs[0]!.url = url;
      const completeResult = validateBackup(backup);
      const singleResult = validateSingleSpace(createSpaceBackup(backup.spaces["space-a"]!));

      expect(completeResult.ok).toBe(false);
      expect(singleResult.ok).toBe(false);
      if (!completeResult.ok) expect(completeResult.issues.map((item) => item.code)).toContain("tab.url.unsafe");
      if (!singleResult.ok) expect(singleResult.issues.map((item) => item.code)).toContain("tab.url.unsafe");
    }
  );
});
