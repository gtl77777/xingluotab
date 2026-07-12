import { describe, expect, it } from "vitest";
import {
  createSpace,
  deleteSpace,
  getSpace,
  getSpaceList,
  renameSpace,
  reorderSpace,
  saveSpace,
  saveSpaceTransfer,
  saveSpaceList,
  SPACE_LIST_STORAGE_KEY,
  SPACE_VERSION_STORAGE_KEY,
  spaceStorageKey,
  updateSpaceIcon
} from "../../../src/domain/space/repository";
import type { Space } from "../../../src/domain/space/schema";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

const space: Space = {
  id: "space-a",
  name: "Main",
  groups: [],
  pins: {}
};

describe("space repository", () => {
  it("reads and writes space lists and spaces through an injected storage", async () => {
    const storage = createMemoryStorage();

    await saveSpaceList([{ id: "space-a", name: "Main" }], false, storage);
    await saveSpace(space, true, storage);

    await expect(getSpaceList(storage)).resolves.toEqual([{ id: "space-a", name: "Main" }]);
    await expect(getSpace("space-a", storage)).resolves.toEqual(space);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBeDefined();
  });

  it("creates a space with Date.now compatible ids", async () => {
    const storage = createMemoryStorage();

    await expect(createSpace("Main", 1700000000000, storage)).resolves.toEqual({
      id: "1700000000000",
      name: "Main"
    });

    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual([
      { id: "1700000000000", name: "Main" }
    ]);
    await expect(getSpace("1700000000000", storage)).resolves.toEqual({
      id: "1700000000000",
      name: "Main",
      groups: [],
      pins: {}
    });
  });

  it("deletes a space and removes orphan SPACE_OF entries", async () => {
    const storage = createMemoryStorage({
      [SPACE_LIST_STORAGE_KEY]: json([
        { id: "space-a", name: "Main" },
        { id: "space-b", name: "Archive" }
      ]),
      [spaceStorageKey("space-a")]: json(space),
      [spaceStorageKey("space-b")]: json({ ...space, id: "space-b" }),
      [spaceStorageKey("orphan")]: json({ ...space, id: "orphan" })
    });

    await deleteSpace("space-a", storage);

    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual([{ id: "space-b", name: "Archive" }]);
    expect(storage.dump()).not.toHaveProperty(spaceStorageKey("space-a"));
    expect(storage.dump()).not.toHaveProperty(spaceStorageKey("orphan"));
    expect(storage.dump()).toHaveProperty(spaceStorageKey("space-b"));
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBeDefined();
  });

  it("renames a space in the summary list and stored space payload", async () => {
    const storage = createMemoryStorage({
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "space-a", name: "Main" }]),
      [spaceStorageKey("space-a")]: json(space)
    });

    await expect(renameSpace("space-a", "Renamed", 1800000000000, storage)).resolves.toMatchObject({
      list: [{ id: "space-a", name: "Renamed" }],
      space: { id: "space-a", name: "Renamed" }
    });

    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual([{ id: "space-a", name: "Renamed" }]);
    expect(JSON.parse(storage.dump()[spaceStorageKey("space-a")] ?? "null")).toEqual({ ...space, name: "Renamed" });
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000000");
  });

  it("updates a space icon only on the summary list", async () => {
    const storage = createMemoryStorage({
      [SPACE_LIST_STORAGE_KEY]: json([{ id: "space-a", name: "Main" }]),
      [spaceStorageKey("space-a")]: json(space)
    });

    await expect(updateSpaceIcon("space-a", "Star", 1800000000001, storage)).resolves.toEqual([
      { id: "space-a", name: "Main", icon: "Star" }
    ]);

    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual([
      { id: "space-a", name: "Main", icon: "Star" }
    ]);
    expect(JSON.parse(storage.dump()[spaceStorageKey("space-a")] ?? "null")).toEqual(space);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000001");
  });

  it("moves spaces to the target summary position", async () => {
    const storage = createMemoryStorage({
      [SPACE_LIST_STORAGE_KEY]: json([
        { id: "space-a", name: "Main" },
        { id: "space-b", name: "Archive" },
        { id: "space-c", name: "Later" }
      ])
    });

    await expect(reorderSpace("space-c", "space-a", 1800000000002, storage)).resolves.toEqual([
      { id: "space-c", name: "Later" },
      { id: "space-a", name: "Main" },
      { id: "space-b", name: "Archive" }
    ]);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000002");

    await expect(reorderSpace("space-c", "space-b", 1800000000003, storage)).resolves.toEqual([
      { id: "space-a", name: "Main" },
      { id: "space-b", name: "Archive" },
      { id: "space-c", name: "Later" }
    ]);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000003");

    await expect(reorderSpace("missing", "space-a", 1800000000004, storage)).resolves.toEqual([
      { id: "space-a", name: "Main" },
      { id: "space-b", name: "Archive" },
      { id: "space-c", name: "Later" }
    ]);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000003");
  });

  it("persists both sides of a cross-space transfer and updates the version last", async () => {
    const sourceBefore = { ...space, groups: [{ id: "group-a", name: "A", tabs: [] }] };
    const targetBefore = { ...space, id: "space-b", name: "Archive" };
    const sourceAfter = { ...sourceBefore, groups: [] };
    const targetAfter = { ...targetBefore, groups: sourceBefore.groups };
    const storage = createMemoryStorage({
      [spaceStorageKey(sourceBefore.id)]: json(sourceBefore),
      [spaceStorageKey(targetBefore.id)]: json(targetBefore)
    });

    await saveSpaceTransfer(
      { sourceBefore, targetBefore, sourceAfter, targetAfter },
      1800000000005,
      storage
    );

    await expect(getSpace(sourceBefore.id, storage)).resolves.toEqual(sourceAfter);
    await expect(getSpace(targetBefore.id, storage)).resolves.toEqual(targetAfter);
    expect(storage.dump()[SPACE_VERSION_STORAGE_KEY]).toBe("1800000000005");
  });

  it("rolls back both spaces when a cross-space transfer write fails", async () => {
    const sourceBefore = { ...space, groups: [{ id: "group-a", name: "A", tabs: [] }] };
    const targetBefore = { ...space, id: "space-b", name: "Archive" };
    const sourceAfter = { ...sourceBefore, groups: [] };
    const targetAfter = { ...targetBefore, groups: sourceBefore.groups };
    const memory = createMemoryStorage({
      [spaceStorageKey(sourceBefore.id)]: json(sourceBefore),
      [spaceStorageKey(targetBefore.id)]: json(targetBefore)
    });
    let failSourceWrite = true;
    const storage = {
      ...memory,
      async setString(key: string, value: string) {
        if (key === spaceStorageKey(sourceBefore.id) && failSourceWrite) {
          failSourceWrite = false;
          throw new Error("source write failed");
        }
        await memory.setString(key, value);
      }
    };

    await expect(
      saveSpaceTransfer({ sourceBefore, targetBefore, sourceAfter, targetAfter }, 1800000000006, storage)
    ).rejects.toThrow("source write failed");

    await expect(getSpace(sourceBefore.id, storage)).resolves.toEqual(sourceBefore);
    await expect(getSpace(targetBefore.id, storage)).resolves.toEqual(targetBefore);
    expect(storage.dump()).not.toHaveProperty(SPACE_VERSION_STORAGE_KEY);
  });
});
