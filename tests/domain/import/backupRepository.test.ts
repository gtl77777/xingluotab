import { describe, expect, it } from "vitest";
import {
  exportBackup,
  importBackup,
  importSingleSpace,
  BackupStorageError,
  createSpaceBackup
} from "../../../src/domain/import/backupRepository";
import { SPACE_LIST_STORAGE_KEY, SPACE_VERSION_STORAGE_KEY, spaceStorageKey } from "../../../src/domain/space/repository";
import type { Backup } from "../../../src/domain/sync/schema";
import type { LocalStoragePort } from "../../../src/platform/storage";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

const mainSpace = {
  id: "space-a",
  name: "Main",
  groups: [
    {
      id: "group-a",
      name: "Work",
      tabs: [
        {
          id: "tab-a",
          kind: "record" as const,
          title: "Example",
          url: "https://example.com/"
        }
      ]
    }
  ],
  pins: {
    "group-a": 1700000000001
  }
};

const validBackup: Backup = {
  schemaVersion: 1,
  type: "xingluotab-backup",
  dataVersion: 1700000000000,
  spaceList: [{ id: "space-a", name: "Main", icon: "Chrome" }],
  spaces: {
    "space-a": mainSpace
  }
};

describe("backup repository", () => {
  it("exports a complete backup from storage", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1700000000000",
      [SPACE_LIST_STORAGE_KEY]: json(validBackup.spaceList),
      [spaceStorageKey("space-a")]: json(mainSpace),
      [spaceStorageKey("orphan")]: json({ ...mainSpace, id: "orphan" })
    });

    await expect(exportBackup(storage)).resolves.toEqual(validBackup);
  });

  it("fails export when the stored space list points at missing data", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1700000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "missing", name: "Missing" }])
    });

    await expect(exportBackup(storage)).rejects.toBeInstanceOf(BackupStorageError);
  });

  it("imports a full backup, preserves ids and removes orphan spaces", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1690000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "old", name: "Old" }]),
      [spaceStorageKey("old")]: json({ ...mainSpace, id: "old" }),
      [spaceStorageKey("orphan")]: json({ ...mainSpace, id: "orphan" })
    });

    const result = await importBackup(validBackup, storage);

    expect(result).toEqual({ ok: true, value: validBackup, issues: [] });
    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual(validBackup.spaceList);
    expect(JSON.parse(storage.dump()[spaceStorageKey("space-a")] ?? "null")).toEqual(mainSpace);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1700000000000");
    expect(storage.dump()).not.toHaveProperty(spaceStorageKey("old"));
    expect(storage.dump()).not.toHaveProperty(spaceStorageKey("orphan"));
  });

  it("rejects a full backup with missing required pins", async () => {
    const storage = createMemoryStorage();
    const legacySpace = { ...mainSpace } as Partial<typeof mainSpace>;
    delete legacySpace.pins;

    const result = await importBackup(
      {
        ...validBackup,
        spaces: { "space-a": legacySpace }
      },
      storage
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("space.pins");
  });

  it("does not mutate storage when full backup validation fails", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1690000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "old", name: "Old" }]),
      [spaceStorageKey("old")]: json({ ...mainSpace, id: "old" })
    });
    const before = storage.dump();

    const result = await importBackup({ ...validBackup, spaceList: [] }, storage);

    expect(result.ok).toBe(false);
    expect(storage.dump()).toEqual(before);
  });

  it("rolls back a full backup when a storage write fails midway", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1690000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "old", name: "Old" }]),
      [spaceStorageKey("old")]: json({ ...mainSpace, id: "old" })
    });
    const before = storage.dump();
    let shouldFail = true;
    const failingStorage: LocalStoragePort = {
      ...storage,
      async setString(key, value) {
        if (key === spaceStorageKey("space-a") && shouldFail) {
          shouldFail = false;
          throw new Error("simulated storage failure");
        }
        await storage.setString(key, value);
      }
    };

    await expect(importBackup(validBackup, failingStorage)).rejects.toThrow("simulated storage failure");
    expect(storage.dump()).toEqual(before);
  });

  it("imports a single space as a new space with rebuilt ids and pins", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1690000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "existing", name: "Existing" }]),
      [spaceStorageKey("existing")]: json({ ...mainSpace, id: "existing" })
    });

    const result = await importSingleSpace(createSpaceBackup(mainSpace), {
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

    expect(result.value.summary).toEqual({ id: "imported-space", name: "Main" });
    expect(result.value.space.id).toBe("imported-space");
    expect(result.value.space.groups[0]?.id).toBe("imported-group");
    expect(result.value.space.groups[0]?.tabs[0]?.id).toBe("imported-tab");
    expect(result.value.space.pins).toEqual({ "imported-group": 1700000000001 });
    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual([
      { id: "existing", name: "Existing" },
      { id: "imported-space", name: "Main" }
    ]);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000000");
  });

  it("rolls back a single-space import when its space write fails", async () => {
    const storage = createMemoryStorage({
      [SPACE_VERSION_STORAGE_KEY]: "1690000000000",
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "existing", name: "Existing" }]),
      [spaceStorageKey("existing")]: json({ ...mainSpace, id: "existing" })
    });
    const before = storage.dump();
    let shouldFail = true;
    const failingStorage: LocalStoragePort = {
      ...storage,
      async setString(key, value) {
        if (key === spaceStorageKey("imported-space") && shouldFail) {
          shouldFail = false;
          throw new Error("simulated storage failure");
        }
        await storage.setString(key, value);
      }
    };

    await expect(importSingleSpace(createSpaceBackup(mainSpace), {
      localStorage: failingStorage,
      idFactory: { spaceId: () => "imported-space", groupId: () => "imported-group", tabId: () => "imported-tab" },
      now: () => 1800000000000
    })).rejects.toThrow("simulated storage failure");
    expect(storage.dump()).toEqual(before);
  });

  it("retries single space import when the generated space id already exists", async () => {
    const storage = createMemoryStorage({
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "collision", name: "Existing" }]),
      [spaceStorageKey("collision")]: json({ ...mainSpace, id: "collision" })
    });
    const spaceIds = ["collision", "new-space"];

    const result = await importSingleSpace(createSpaceBackup(mainSpace), {
      localStorage: storage,
      idFactory: {
        spaceId: () => spaceIds.shift() ?? "new-space",
        groupId: () => "new-group",
        tabId: () => "new-tab"
      },
      now: () => 1800000000000
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.space.id).toBe("new-space");
    expect(storage.dump()).toHaveProperty(spaceStorageKey("new-space"));
  });

  it("rejects an unwrapped legacy single-space object", async () => {
    const storage = createMemoryStorage({ [SPACE_LIST_STORAGE_KEY]: json([]) });
    const result = await importSingleSpace({ id: "old-space", name: "Old", groups: [], pins: {} }, { localStorage: storage });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("spaceBackup.type");
    expect(storage.dump()).toEqual({ [SPACE_LIST_STORAGE_KEY]: json([]) });
  });
});
