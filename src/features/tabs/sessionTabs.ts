import type { SessionTab } from "../../domain/space/schema";
import { getExtensionRootUrl, queryCurrentWindowTabs } from "../../platform/browser";

type SessionTabOptions = {
  extensionRootUrl?: string;
  idFactory?: () => string;
  includePinned?: boolean;
};

const sessionIdsByBrowserTabId = new Map<number, string>();

export function tabToSessionTab(tab: chrome.tabs.Tab, options: SessionTabOptions = {}): SessionTab | null {
  const url = tab.url || tab.pendingUrl;
  if (!tab.id || !url) return null;
  if (!isSavableTabUrl(url, options.extensionRootUrl ?? getExtensionRootUrl())) return null;
  if (options.includePinned === false && tab.pinned) return null;

  return {
    kind: "session",
    id: options.idFactory?.() ?? getSessionId(tab.id),
    tid: tab.id.toString(),
    title: tab.title ?? "",
    url,
    favIconUrl: tab.favIconUrl,
    pinned: tab.pinned ?? false
  };
}

export function isSavableTabUrl(url: string, extensionRootUrl = getExtensionRootUrl()) {
  if (!url || url.startsWith(extensionRootUrl)) return false;
  const normalized = url.toLowerCase().replace(/\/$/, "");
  return normalized !== "chrome://newtab" && normalized !== "edge://newtab";
}

export async function getCurrentWindowSessionTabs(options: SessionTabOptions = {}) {
  const tabs = await queryCurrentWindowTabs();
  const liveTabIds = new Set(tabs.flatMap((tab) => (tab.id == null ? [] : [tab.id])));
  for (const tabId of sessionIdsByBrowserTabId.keys()) {
    if (!liveTabIds.has(tabId)) sessionIdsByBrowserTabId.delete(tabId);
  }

  return [...tabs].reverse().flatMap((tab) => {
    const sessionTab = tabToSessionTab(tab, options);
    return sessionTab ? [sessionTab] : [];
  });
}

export function sessionToRecord(tab: SessionTab) {
  const { tid: _tid, ...record } = tab;
  return {
    ...record,
    kind: "record" as const
  };
}

function getSessionId(tabId: number) {
  const existing = sessionIdsByBrowserTabId.get(tabId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionIdsByBrowserTabId.set(tabId, id);
  return id;
}
