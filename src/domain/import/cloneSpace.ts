import type { RecordTab, Space, SpaceSummary, TabGroup } from "../space/schema";

export type IdFactory = {
  spaceId(): string;
  groupId(): string;
  tabId(): string;
};

export function createRuntimeIdFactory(): IdFactory {
  return {
    spaceId: () => Date.now().toString(),
    groupId: () => `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    tabId: () => crypto.randomUUID()
  };
}

export function cloneSingleSpaceForImport(source: Space, idFactory = createRuntimeIdFactory()) {
  const newSpaceId = idFactory.spaceId();
  const groupIdMap = new Map<string, string>();

  const groups: TabGroup[] = source.groups.map((group) => {
    const newGroupId = idFactory.groupId();
    groupIdMap.set(group.id, newGroupId);

    return {
      ...group,
      id: newGroupId,
      tabs: group.tabs.map<RecordTab>((tab) => ({
        ...tab,
        id: idFactory.tabId(),
        kind: "record"
      }))
    };
  });

  const pins: Record<string, number> = {};
  for (const [oldGroupId, timestamp] of Object.entries(source.pins ?? {})) {
    const newGroupId = groupIdMap.get(oldGroupId);
    if (newGroupId) pins[newGroupId] = timestamp;
  }

  const space: Space = {
    ...source,
    id: newSpaceId,
    groups,
    pins
  };
  const summary: SpaceSummary = {
    id: newSpaceId,
    name: source.name
  };

  return { summary, space };
}
