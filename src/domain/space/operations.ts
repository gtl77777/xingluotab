import type { RecordTab, Space, TabGroup } from "./schema";

export function addGroup(space: Space, tabs: RecordTab[] = [], now = new Date()) {
  const name = now
    .toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    .replace(/\//g, "-");
  const group: TabGroup = {
    id: `group_${now.getTime().toString()}`,
    name,
    createdAt: now.getTime(),
    tabs: tabs.map((tab) => ({
      ...tab,
      kind: "record" as const
    }))
  };
  return sortSpaceGroups({
    ...space,
    groups: [...space.groups, group]
  });
}

export function appendTabsToGroup(space: Space, groupId: string, tabs: RecordTab[]) {
  return updateGroup(space, groupId, (group) => ({
    ...group,
    tabs: [...group.tabs, ...tabs]
  }));
}

export function deleteGroup(space: Space, groupId: string) {
  const { [groupId]: _removed, ...pins } = space.pins;
  return {
    ...space,
    groups: space.groups.filter((group) => group.id !== groupId),
    pins
  };
}

export function renameGroup(space: Space, groupId: string, name: string) {
  return updateGroup(space, groupId, (group) => ({ ...group, name }));
}

export function normalizeGroupTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const normalized = tag.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export function setGroupTags(space: Space, groupId: string, tags: string[]) {
  const normalized = normalizeGroupTags(tags);
  return updateGroup(space, groupId, (group) => ({
    ...group,
    ...(normalized.length > 0 ? { tags: normalized } : { tags: undefined })
  }));
}

export function updateTab(space: Space, tabId: string, update: Partial<RecordTab>) {
  let changed = false;
  const groups = space.groups.map((group) => ({
    ...group,
    tabs: group.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      changed = true;
      return { ...tab, ...update, id: tab.id, kind: "record" as const };
    })
  }));

  return changed ? { ...space, groups } : space;
}

export function moveGroup(space: Space, sourceGroupId: string, targetGroupId: string) {
  if (sourceGroupId === targetGroupId) return space;

  const sourceIndex = space.groups.findIndex((group) => group.id === sourceGroupId);
  const targetIndex = space.groups.findIndex((group) => group.id === targetGroupId);
  if (sourceIndex === -1 || targetIndex === -1) return space;

  const groups = [...space.groups];
  const [sourceGroup] = groups.splice(sourceIndex, 1);
  if (!sourceGroup) return space;

  groups.splice(targetIndex, 0, sourceGroup);

  return {
    ...space,
    groups
  };
}

export function moveTabToSpace(
  sourceSpace: Space,
  targetSpace: Space,
  tabId: string,
  targetGroupId: string,
  targetIndex = 0
) {
  if (sourceSpace.id === targetSpace.id) {
    return { sourceSpace, targetSpace };
  }

  const sourceGroup = sourceSpace.groups.find((group) => group.tabs.some((tab) => tab.id === tabId));
  const tab = sourceGroup?.tabs.find((item) => item.id === tabId);
  const targetGroup = targetSpace.groups.find((group) => group.id === targetGroupId);
  if (!sourceGroup || !tab || !targetGroup) return { sourceSpace, targetSpace };

  const insertIndex = clampIndex(targetIndex, targetGroup.tabs.length);

  return {
    sourceSpace: {
      ...sourceSpace,
      groups: sourceSpace.groups.map((group) =>
        group.id === sourceGroup.id
          ? { ...group, tabs: group.tabs.filter((item) => item.id !== tabId) }
          : group
      )
    },
    targetSpace: {
      ...targetSpace,
      groups: targetSpace.groups.map((group) =>
        group.id === targetGroupId
          ? {
              ...group,
              tabs: [...group.tabs.slice(0, insertIndex), tab, ...group.tabs.slice(insertIndex)]
            }
          : group
      )
    }
  };
}

export function moveGroupToSpace(sourceSpace: Space, targetSpace: Space, groupId: string) {
  if (sourceSpace.id === targetSpace.id) {
    return { sourceSpace, targetSpace };
  }

  const group = sourceSpace.groups.find((item) => item.id === groupId);
  if (!group) return { sourceSpace, targetSpace };

  const { [groupId]: _removed, ...sourcePins } = sourceSpace.pins;
  return {
    sourceSpace: {
      ...sourceSpace,
      groups: sourceSpace.groups.filter((item) => item.id !== groupId),
      pins: sourcePins
    },
    targetSpace: sortSpaceGroups({
      ...targetSpace,
      groups: [...targetSpace.groups, group]
    })
  };
}

export function deleteTab(space: Space, tabId: string) {
  return {
    ...space,
    groups: space.groups.map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => tab.id !== tabId)
    }))
  };
}

export function moveTab(space: Space, tabId: string, targetGroupId: string, targetIndex: number) {
  let movedTab: RecordTab | undefined;
  let sourceGroupId: string | undefined;
  let sourceIndex = -1;

  for (const group of space.groups) {
    const tabIndex = group.tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex === -1) continue;
    movedTab = group.tabs[tabIndex];
    sourceGroupId = group.id;
    sourceIndex = tabIndex;
    break;
  }

  if (!movedTab || !sourceGroupId || !space.groups.some((group) => group.id === targetGroupId)) {
    return space;
  }

  const targetGroup = space.groups.find((group) => group.id === targetGroupId)!;
  const targetTabsWithoutMoved = targetGroup.tabs.filter((tab) => tab.id !== tabId);
  const adjustedIndex =
    sourceGroupId === targetGroupId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertIndex = clampIndex(adjustedIndex, targetTabsWithoutMoved.length);
  if (sourceGroupId === targetGroupId && insertIndex === sourceIndex) return space;

  return {
    ...space,
    groups: space.groups.map((group) => {
      const withoutMovedTab = group.tabs.filter((tab) => tab.id !== tabId);
      if (group.id !== targetGroupId) {
        return { ...group, tabs: withoutMovedTab };
      }

      return {
        ...group,
        tabs: [
          ...withoutMovedTab.slice(0, insertIndex),
          movedTab,
          ...withoutMovedTab.slice(insertIndex)
        ]
      };
    })
  };
}

export function setGroupPinned(space: Space, groupId: string, pinned: boolean, now = Date.now()) {
  const pins = { ...space.pins };
  if (pinned) pins[groupId] = now;
  else delete pins[groupId];
  return sortSpaceGroups({ ...space, pins });
}

export function sortGroupsForDisplay(space: Space) {
  return sortGroupsForStorage(space).reverse();
}

export type GroupSortMode = "manual" | "alphabetical" | "starred" | "created";

export function sortGroupsForMode(space: Space, mode: GroupSortMode) {
  const manualOrder = sortGroupsForDisplay(space);
  if (mode === "manual") return manualOrder;

  const indexed = manualOrder.map((group, index) => ({ group, index }));
  if (mode === "alphabetical") {
    return indexed
      .sort((left, right) => left.group.name.localeCompare(right.group.name, undefined, { numeric: true, sensitivity: "base" }) || left.index - right.index)
      .map(({ group }) => group);
  }
  if (mode === "starred") {
    return indexed
      .sort((left, right) => Number(space.pins[right.group.id] != null) - Number(space.pins[left.group.id] != null) || left.index - right.index)
      .map(({ group }) => group);
  }

  return indexed
    .sort((left, right) => getGroupCreatedAt(right.group) - getGroupCreatedAt(left.group) || left.index - right.index)
    .map(({ group }) => group);
}

export function getGroupCreatedAt(group: TabGroup) {
  if (typeof group.createdAt === "number" && Number.isFinite(group.createdAt)) return group.createdAt;
  const timestamp = group.id.match(/(?:^|_)(\d{10,})(?:_|$)/)?.[1];
  return timestamp ? Number(timestamp) : 0;
}

function sortSpaceGroups(space: Space) {
  return {
    ...space,
    groups: sortGroupsForStorage(space)
  };
}

export function sortGroupsForStorage(space: Space) {
  return [...space.groups].sort((a, b) => {
    const aPin = space.pins[a.id];
    const bPin = space.pins[b.id];
    if (aPin != null && bPin != null) return aPin - bPin;
    if (aPin != null) return 1;
    if (bPin != null) return -1;
    return 0;
  });
}

function updateGroup(space: Space, groupId: string, update: (group: TabGroup) => TabGroup) {
  return {
    ...space,
    groups: space.groups.map((group) => (group.id === groupId ? update(group) : group))
  };
}

function clampIndex(index: number, max: number) {
  if (!Number.isFinite(index)) return max;
  return Math.max(0, Math.min(Math.trunc(index), max));
}
