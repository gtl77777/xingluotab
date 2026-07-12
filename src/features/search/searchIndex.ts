import { defaultFilter } from "cmdk";
import { getSpace, getSpaceList } from "../../domain/space/repository";
import type { Space, SpaceSummary } from "../../domain/space/schema";
import type { LocalStoragePort } from "../../platform/storage";

export type SearchRecord = {
  tabId: string;
  title: string;
  url: string;
  favIconUrl?: string;
  groupId: string;
  groupName: string;
  spaceId: string;
  spaceName: string;
};

export function buildSearchIndex(spaceList: SpaceSummary[], spaces: Record<string, Space>) {
  const rows: SearchRecord[] = [];
  const spaceNames = new Map(spaceList.map((space) => [space.id, space.name]));

  for (const summary of spaceList) {
    const spaceId = summary.id;
    const space = spaces[spaceId];
    if (!space) continue;

    for (const group of space.groups) {
      for (const tab of group.tabs) {
        rows.push({
          tabId: tab.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          groupId: group.id,
          groupName: group.name,
          spaceId,
          spaceName: spaceNames.get(spaceId) ?? space.name
        });
      }
    }
  }

  return rows;
}

export function searchTabs(index: SearchRecord[], query: string) {
  const text = query.trim();
  if (!text) return index;

  return index
    .map((record, originalIndex) => ({
      originalIndex,
      record,
      score: defaultFilter(record.title || record.url, text, [record.url, record.groupName, record.spaceName])
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
    .map((result) => result.record);
}

export async function loadSearchIndex(localStorage?: LocalStoragePort) {
  const spaceList = await getSpaceList(localStorage);
  const loadedSpaces = await Promise.all(
    spaceList.map(async (summary) => {
      const space = await getSpace(summary.id, localStorage);
      return [summary.id, space] as const;
    })
  );
  const spaces = Object.fromEntries(loadedSpaces.filter((entry): entry is readonly [string, Space] => entry[1] != null));

  return buildSearchIndex(spaceList, spaces);
}
