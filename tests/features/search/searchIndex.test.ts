import { describe, expect, it } from "vitest";
import { buildSearchIndex, loadSearchIndex, searchTabs } from "../../../src/features/search/searchIndex";
import { SPACE_LIST_STORAGE_KEY, spaceStorageKey } from "../../../src/domain/space/repository";
import type { Space } from "../../../src/domain/space/schema";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

const workSpace: Space = {
  id: "space-a",
  name: "Work",
  pins: {},
  groups: [
    {
      id: "group-a",
      name: "Docs",
      tabs: [{ id: "tab-a", kind: "record", title: "API Reference", url: "https://docs.example/" }]
    }
  ]
};

const personalSpace: Space = {
  id: "space-b",
  name: "Personal",
  pins: {},
  groups: [
    {
      id: "group-b",
      name: "Reading",
      tabs: [{ id: "tab-b", kind: "record", title: "Travel Notes", url: "https://notes.example/" }]
    }
  ]
};

describe("search index", () => {
  it("builds searchable rows with space and group names", () => {
    const index = buildSearchIndex(
      [
        { id: "space-a", name: "Work" },
        { id: "space-b", name: "Personal" }
      ],
      {
        "space-a": workSpace,
        "space-b": personalSpace
      }
    );

    expect(searchTabs(index, "travel")).toMatchObject([
      {
        tabId: "tab-b",
        spaceName: "Personal",
        groupName: "Reading"
      }
    ]);
    expect(searchTabs(index, "docs")).toHaveLength(1);
    expect(searchTabs(index, "")).toEqual(index);
    expect(searchTabs(index, "apiref").map((record) => record.tabId)).toEqual(["tab-a"]);
  });

  it("keeps results in space-list order regardless of object insertion order", () => {
    const index = buildSearchIndex(
      [
        { id: "space-a", name: "Work" },
        { id: "space-b", name: "Personal" }
      ],
      {
        "space-b": personalSpace,
        "space-a": workSpace
      }
    );

    expect(index.map((record) => record.spaceId)).toEqual(["space-a", "space-b"]);
  });

  it("loads all spaces from storage for global search", async () => {
    const storage = createMemoryStorage({
      [SPACE_LIST_STORAGE_KEY]: json([
        { id: "space-a", name: "Work" },
        { id: "space-b", name: "Personal" }
      ]),
      [spaceStorageKey("space-a")]: json(workSpace),
      [spaceStorageKey("space-b")]: json(personalSpace)
    });

    await expect(loadSearchIndex(storage)).resolves.toHaveLength(2);
  });
});
