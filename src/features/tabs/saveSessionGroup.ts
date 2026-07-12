import { appendTabsToGroup, sortGroupsForStorage } from "../../domain/space/operations";
import type { RecordTab, SessionTab, Space, TabGroup } from "../../domain/space/schema";
import { sessionToRecord } from "./sessionTabs";

export type AppendSessionGroupOptions = {
  now?: () => number;
  groupName?: string;
  keepPinnedBrowserTabs?: boolean;
};

export type AppendSessionGroupResult = {
  space: Space;
  group: TabGroup;
  removableBrowserTabIds: number[];
};

export function appendSessionTabsAsGroup(
  space: Space,
  sessionTabs: SessionTab[],
  options: AppendSessionGroupOptions = {}
): AppendSessionGroupResult {
  if (sessionTabs.length === 0) {
    throw new Error("No session tabs to save");
  }

  const now = options.now?.() ?? Date.now();
  const group: TabGroup = {
    id: `group_${now}`,
    name: options.groupName ?? formatSessionGroupName(now),
    createdAt: now,
    tabs: sessionTabs.map(sessionToRecord).map(normalizeRecordTab)
  };
  const removableBrowserTabIds = getRemovableBrowserTabIds(sessionTabs, options.keepPinnedBrowserTabs ?? true);

  return {
    group,
    removableBrowserTabIds,
    space: {
      ...space,
      groups: sortGroupsForStorage({ ...space, groups: [...space.groups, group] })
    }
  };
}

export function appendSessionTabsToGroup(
  space: Space,
  groupId: string,
  sessionTabs: SessionTab[],
  options: Pick<AppendSessionGroupOptions, "keepPinnedBrowserTabs"> = {}
): AppendSessionGroupResult {
  if (sessionTabs.length === 0) {
    throw new Error("No session tabs to save");
  }

  const tabs = sessionTabs.map(sessionToRecord).map(normalizeRecordTab);
  const group = space.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("Group not found");

  return {
    group: {
      ...group,
      tabs: [...group.tabs, ...tabs]
    },
    removableBrowserTabIds: getRemovableBrowserTabIds(sessionTabs, options.keepPinnedBrowserTabs ?? true),
    space: appendTabsToGroup(space, groupId, tabs)
  };
}

function normalizeRecordTab(tab: RecordTab): RecordTab {
  return {
    id: tab.id,
    kind: "record",
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    pinned: tab.pinned
  };
}

function formatSessionGroupName(now: number) {
  return new Date(now)
    .toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    .replace(/\//g, "-");
}

function getRemovableBrowserTabIds(sessionTabs: SessionTab[], keepPinnedBrowserTabs: boolean) {
  return sessionTabs
    .filter((tab) => !(keepPinnedBrowserTabs && tab.pinned))
    .map((tab) => Number(tab.tid))
    .filter((tabId) => Number.isFinite(tabId));
}
