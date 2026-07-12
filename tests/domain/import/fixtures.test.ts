import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importSingleSpace } from "../../../src/domain/import/backupRepository";
import { validateBackup, validateSingleSpace } from "../../../src/domain/import/validation";
import { SPACE_LIST_STORAGE_KEY, SPACE_VERSION_STORAGE_KEY, spaceStorageKey } from "../../../src/domain/space/repository";
import type { Backup } from "../../../src/domain/sync/schema";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

const rootDir = resolve(__dirname, "../../..");
const fixturePath = (...parts: string[]) => resolve(rootDir, "fixtures", ...parts);

function readFixture<T = unknown>(...parts: string[]): T {
  return JSON.parse(readFileSync(fixturePath(...parts), "utf8").replace(/^\uFEFF/, "")) as T;
}

describe("import fixtures", () => {
  it("accepts the anonymized full backup fixture at production-like scale", () => {
    const backup = readFixture<Backup>("xingluotab_backup.anonymized.json");
    const result = validateBackup(backup);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const groupCount = result.value.spaceList.reduce((count, summary) => {
      return count + result.value.spaces[summary.id]!.groups.length;
    }, 0);
    const tabCount = result.value.spaceList.reduce((count, summary) => {
      return count + result.value.spaces[summary.id]!.groups.reduce((tabs, group) => tabs + group.tabs.length, 0);
    }, 0);

    expect(result.value.spaceList).toHaveLength(17);
    expect(groupCount).toBe(266);
    expect(tabCount).toBe(937);
  });

  it.each([
    ["empty-space-list.json", "backup.spaceList"],
    ["missing-space-object.json", "space.missing"],
    ["space-without-groups.json", "space.groups"],
    ["tab-without-url.json", "tab.url"],
    ["duplicate-ids.json", "group.duplicateId"]
  ])("rejects invalid full-backup boundary fixture %s", (fileName, expectedCode) => {
    const result = validateBackup(readFixture("xingluotab-boundary", fileName));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(expectedCode);
  });

  it("accepts and clones the valid single-space boundary fixture", async () => {
    const input = readFixture("xingluotab-boundary", "single-space.valid.json");
    const validation = validateSingleSpace(input);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1700000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "existing", name: "Existing" }]),
      [spaceStorageKey("existing")]: json({ id: "existing", name: "Existing", groups: [], pins: {} })
    });
    const result = await importSingleSpace(input, {
      localStorage: storage,
      idFactory: {
        spaceId: () => "imported-space",
        groupId: () => "imported-group",
        tabId: () => "imported-tab"
      },
      now: () => 1800000000000
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.summary.id).toBe("imported-space");
    expect(result.value.space.groups[0]?.id).toBe("imported-group");
    expect(result.value.space.groups[0]?.tabs[0]?.id).toBe("imported-tab");
    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "[]")).toHaveLength(2);
  });
});
