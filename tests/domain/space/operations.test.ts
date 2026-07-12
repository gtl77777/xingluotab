import { describe, expect, it } from "vitest";
import {
  addGroup,
  appendTabsToGroup,
  deleteGroup,
  deleteTab,
  getGroupCreatedAt,
  moveGroup,
  moveGroupToSpace,
  moveTab,
  moveTabToSpace,
  renameGroup,
  normalizeGroupTags,
  setGroupTags,
  setGroupPinned,
  sortGroupsForDisplay,
  sortGroupsForMode,
  updateTab
} from "../../../src/domain/space/operations";
import type { Space } from "../../../src/domain/space/schema";

const space: Space = {
  id: "space-a",
  name: "Main",
  pins: { "group-b": 20 },
  groups: [
    { id: "group-a", name: "A", tabs: [{ id: "tab-a", kind: "record", title: "A", url: "https://a.example/" }] },
    { id: "group-b", name: "B", tabs: [{ id: "tab-b", kind: "record", title: "B", url: "https://b.example/" }] }
  ]
};

describe("space operations", () => {
  it("adds a dated empty group like the original extension", () => {
    const now = new Date(1710000000000);
    const next = addGroup({ ...space, groups: [], pins: {} }, [], now);

    expect(next.groups).toHaveLength(1);
    expect(next.groups[0]).toMatchObject({
      id: "group_1710000000000",
      createdAt: 1710000000000,
      tabs: []
    });
    expect(next.groups[0]?.name).toBeTruthy();
  });

  it("appends record tabs to a group", () => {
    const next = appendTabsToGroup(space, "group-a", [
      { id: "tab-c", kind: "record", title: "C", url: "https://c.example/" }
    ]);

    expect(next.groups[0]?.tabs.map((tab) => tab.id)).toEqual(["tab-a", "tab-c"]);
  });

  it("deletes groups and clears pins", () => {
    const next = deleteGroup(space, "group-b");

    expect(next.groups.map((group) => group.id)).toEqual(["group-a"]);
    expect(next.pins).toEqual({});
  });

  it("renames groups", () => {
    expect(renameGroup(space, "group-a", "Renamed").groups[0]?.name).toBe("Renamed");
  });

  it("normalizes and stores collection tags", () => {
    expect(normalizeGroupTags([" Work ", "work", "Deep   Focus", ""])).toEqual(["Work", "Deep Focus"]);
    const tagged = setGroupTags(space, "group-a", ["Work", "Reading"]);
    expect(tagged.groups[0]?.tags).toEqual(["Work", "Reading"]);
    expect(setGroupTags(tagged, "group-a", []).groups[0]?.tags).toBeUndefined();
  });

  it("updates record tabs without changing immutable fields", () => {
    const next = updateTab(space, "tab-a", {
      id: "changed",
      kind: "record",
      title: "Renamed",
      url: "https://renamed.example/"
    });

    expect(next.groups[0]?.tabs[0]).toMatchObject({
      id: "tab-a",
      kind: "record",
      title: "Renamed",
      url: "https://renamed.example/"
    });
    expect(updateTab(space, "missing", { title: "Noop" })).toBe(space);
  });

  it("moves a group before another group", () => {
    expect(moveGroup(space, "group-b", "group-a").groups.map((group) => group.id)).toEqual(["group-b", "group-a"]);
    expect(moveGroup(space, "group-a", "group-b").groups.map((group) => group.id)).toEqual(["group-b", "group-a"]);
  });

  it("keeps the space unchanged when moving unknown groups or the same group", () => {
    expect(moveGroup(space, "missing", "group-a")).toBe(space);
    expect(moveGroup(space, "group-a", "missing")).toBe(space);
    expect(moveGroup(space, "group-a", "group-a")).toBe(space);
  });

  it("moves a group to another space and clears source pins", () => {
    const target: Space = {
      id: "space-b",
      name: "Archive",
      pins: {},
      groups: [{ id: "group-c", name: "C", tabs: [] }]
    };

    const result = moveGroupToSpace(space, target, "group-b");

    expect(result.sourceSpace.groups.map((group) => group.id)).toEqual(["group-a"]);
    expect(result.sourceSpace.pins).toEqual({});
    expect(result.targetSpace.groups.map((group) => group.id)).toEqual(["group-c", "group-b"]);
  });

  it("keeps spaces unchanged when moving a missing group across spaces", () => {
    const target: Space = { id: "space-b", name: "Archive", pins: {}, groups: [] };

    expect(moveGroupToSpace(space, target, "missing")).toEqual({ sourceSpace: space, targetSpace: target });
  });

  it("deletes a tab from every group", () => {
    const next = deleteTab(space, "tab-b");

    expect(next.groups[1]?.tabs).toEqual([]);
  });

  it("moves a tab into another group at a target index", () => {
    const next = moveTab(space, "tab-a", "group-b", 0);

    expect(next.groups[0]?.tabs.map((tab) => tab.id)).toEqual([]);
    expect(next.groups[1]?.tabs.map((tab) => tab.id)).toEqual(["tab-a", "tab-b"]);
  });

  it("moves a tab to the first position of a selected group in another space", () => {
    const target: Space = {
      id: "space-b",
      name: "Archive",
      pins: {},
      groups: [
        {
          id: "group-c",
          name: "C",
          tabs: [{ id: "tab-c", kind: "record", title: "C", url: "https://c.example/" }]
        }
      ]
    };

    const result = moveTabToSpace(space, target, "tab-a", "group-c");

    expect(result.sourceSpace.groups[0]?.tabs).toEqual([]);
    expect(result.targetSpace.groups[0]?.tabs.map((tab) => tab.id)).toEqual(["tab-a", "tab-c"]);
  });

  it("keeps spaces unchanged when moving a missing tab across spaces", () => {
    const target: Space = { id: "space-b", name: "Archive", pins: {}, groups: [] };

    expect(moveTabToSpace(space, target, "missing", "missing-group")).toEqual({
      sourceSpace: space,
      targetSpace: target
    });
  });

  it("reorders a tab inside the same group", () => {
    const multiTabSpace: Space = {
      ...space,
      groups: [
        {
          id: "group-a",
          name: "A",
          tabs: [
            { id: "tab-a", kind: "record", title: "A", url: "https://a.example/" },
            { id: "tab-b", kind: "record", title: "B", url: "https://b.example/" },
            { id: "tab-c", kind: "record", title: "C", url: "https://c.example/" }
          ]
        }
      ],
      pins: {}
    };

    expect(moveTab(multiTabSpace, "tab-a", "group-a", 3).groups[0]?.tabs.map((tab) => tab.id)).toEqual([
      "tab-b",
      "tab-c",
      "tab-a"
    ]);
    expect(moveTab(multiTabSpace, "tab-c", "group-a", 0).groups[0]?.tabs.map((tab) => tab.id)).toEqual([
      "tab-c",
      "tab-a",
      "tab-b"
    ]);
    expect(moveTab(multiTabSpace, "tab-b", "group-a", 1)).toBe(multiTabSpace);
  });

  it("keeps the space unchanged when moving unknown tabs or into unknown groups", () => {
    expect(moveTab(space, "missing", "group-a", 0)).toBe(space);
    expect(moveTab(space, "tab-a", "missing", 0)).toBe(space);
  });

  it("pins and unpins groups", () => {
    const pinned = setGroupPinned(space, "group-a", true, 30);
    expect(pinned.pins["group-a"]).toBe(30);
    expect(pinned.groups.map((group) => group.id)).toEqual(["group-b", "group-a"]);

    const unpinned = setGroupPinned(pinned, "group-b", false);
    expect(unpinned.pins).toEqual({ "group-a": 30 });
    expect(unpinned.groups.map((group) => group.id)).toEqual(["group-b", "group-a"]);
  });

  it("sorts pinned groups first", () => {
    expect(sortGroupsForDisplay(space).map((group) => group.id)).toEqual(["group-b", "group-a"]);
  });

  it("supports the four collection sorting modes", () => {
    const sortable: Space = {
      ...space,
      pins: { group_custom: 1 },
      groups: [
        { id: "group_1000000000000", name: "Zebra", tabs: [] },
        { id: "group_3000000000000", name: "alpha", tabs: [] },
        { id: "group_custom", name: "Beta", createdAt: 2000000000000, tabs: [] }
      ]
    };

    expect(sortGroupsForMode(sortable, "manual").map((group) => group.name)).toEqual(["Beta", "alpha", "Zebra"]);
    expect(sortGroupsForMode(sortable, "alphabetical").map((group) => group.name)).toEqual(["alpha", "Beta", "Zebra"]);
    expect(sortGroupsForMode(sortable, "starred").map((group) => group.name)).toEqual(["Beta", "alpha", "Zebra"]);
    expect(sortGroupsForMode(sortable, "created").map((group) => group.name)).toEqual(["alpha", "Beta", "Zebra"]);
    expect(getGroupCreatedAt(sortable.groups[0]!)).toBe(1000000000000);
  });
});
