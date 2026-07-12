import { describe, expect, it, vi } from "vitest";
import type { SessionTab, Space } from "../../../src/domain/space/schema";
import { appendSessionTabsAsGroup, appendSessionTabsToGroup } from "../../../src/features/tabs/saveSessionGroup";

const space: Space = {
  id: "space-a",
  name: "Main",
  groups: [],
  pins: {}
};

const sessionTabs: SessionTab[] = [
  {
    kind: "session",
    id: "tab-a",
    tid: "11",
    title: "A",
    url: "https://a.example/",
    pinned: false
  },
  {
    kind: "session",
    id: "tab-b",
    tid: "12",
    title: "B",
    url: "https://b.example/",
    pinned: true
  }
];

describe("save session group", () => {
  it("appends current session tabs as a record group", () => {
    const result = appendSessionTabsAsGroup(space, sessionTabs, {
      now: () => 1700000000000,
      groupName: "Saved window"
    });

    expect(result.group).toEqual({
      id: "group_1700000000000",
      name: "Saved window",
      createdAt: 1700000000000,
      tabs: [
        {
          id: "tab-a",
          kind: "record",
          title: "A",
          url: "https://a.example/",
          favIconUrl: undefined,
          pinned: false
        },
        {
          id: "tab-b",
          kind: "record",
          title: "B",
          url: "https://b.example/",
          favIconUrl: undefined,
          pinned: true
        }
      ]
    });
    expect(result.space.groups).toEqual([result.group]);
  });

  it("keeps pinned browser tabs open when configured", () => {
    const result = appendSessionTabsAsGroup(space, sessionTabs, {
      keepPinnedBrowserTabs: true
    });

    expect(result.removableBrowserTabIds).toEqual([11]);
  });

  it("can remove pinned browser tabs when configured", () => {
    const result = appendSessionTabsAsGroup(space, sessionTabs, {
      keepPinnedBrowserTabs: false
    });

    expect(result.removableBrowserTabIds).toEqual([11, 12]);
  });

  it("rejects empty session saves", () => {
    expect(() => appendSessionTabsAsGroup(space, [])).toThrow("No session tabs to save");
  });

  it("appends session tabs to an existing group", () => {
    const existing: Space = {
      ...space,
      groups: [{ id: "group-a", name: "A", tabs: [] }]
    };

    const result = appendSessionTabsToGroup(existing, "group-a", [sessionTabs[0]!], {
      keepPinnedBrowserTabs: true
    });

    expect(result.space.groups[0]?.tabs.map((tab) => tab.id)).toEqual(["tab-a"]);
    expect(result.group.tabs.map((tab) => tab.id)).toEqual(["tab-a"]);
    expect(result.removableBrowserTabIds).toEqual([11]);
  });

  it("keeps pinned groups at the end of storage order after saving a window", () => {
    const pinnedSpace: Space = {
      ...space,
      groups: [{ id: "group-pinned", name: "Pinned", tabs: [] }],
      pins: { "group-pinned": 1 }
    };

    const result = appendSessionTabsAsGroup(pinnedSpace, [sessionTabs[0]!], { now: () => 1700000000000 });

    expect(result.space.groups.map((group) => group.id)).toEqual(["group_1700000000000", "group-pinned"]);
  });

  it("uses the legacy numeric date shape for default saved group names", () => {
    const toLocaleString = vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("07/10/2026, 12:34:56");

    const result = appendSessionTabsAsGroup(space, [sessionTabs[0]!], { now: () => 1700000000000 });

    expect(toLocaleString).toHaveBeenCalledWith(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    expect(result.group.name).toBe("07-10-2026, 12:34:56");
  });
});
