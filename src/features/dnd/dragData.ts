export type SpaceDragData = {
  type: "space";
  spaceId: string;
};

export type GroupDragData = {
  type: "group";
  spaceId: string;
  groupId: string;
};

export type TabDragData = {
  type: "tab";
  spaceId: string;
  groupId: string;
  tabId: string;
};

export type SessionTabDragData = {
  type: "session-tab";
  tabId: string;
};

export type XingLuoTabDragData = SpaceDragData | GroupDragData | TabDragData | SessionTabDragData;

export const dndId = {
  space: (spaceId: string) => `space:${spaceId}`,
  group: (spaceId: string, groupId: string) => `group:${spaceId}:${groupId}`,
  // A tab keeps the same sortable identity while its preview moves between groups.
  tab: (spaceId: string, _groupId: string, tabId: string) => `tab:${spaceId}:${tabId}`,
  sessionTab: (tabId: string) => `session-tab:${tabId}`
};

export function isXingLuoTabDragData(value: unknown): value is XingLuoTabDragData {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "space" || type === "group" || type === "tab" || type === "session-tab";
}
