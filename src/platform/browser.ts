export function getExtensionRootUrl() {
  return chrome.runtime.getURL("/");
}

export function getOptionsUrl() {
  return chrome.runtime.getURL("/options.html");
}

export async function openOptionsInCurrentMode(single: boolean) {
  if (single) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  await chrome.tabs.create({ url: getOptionsUrl() });
}

export function supportsNativeTabGroups() {
  return typeof chrome.tabs.group === "function" && typeof chrome.tabGroups !== "undefined";
}

export async function queryCurrentWindowTabs() {
  return chrome.tabs.query({ currentWindow: true });
}

export async function removeBrowserTabs(tabIds: number[]) {
  if (tabIds.length === 0) return;
  await chrome.tabs.remove(tabIds);
}

export async function activateBrowserTab(tabId: number) {
  await chrome.tabs.update(tabId, { active: true });
}

export async function openUrl(url: string, options: { active?: boolean; replaceCurrent?: boolean } = {}) {
  assertSafeNavigationUrl(url);
  if (options.replaceCurrent) {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab?.id != null) {
      await chrome.tabs.update(currentTab.id, { url });
      return;
    }
  }

  await chrome.tabs.create({ url, active: options.active ?? true });
}

export async function openUrlsInTabs(urls: string[], options: { active?: boolean; groupTitle?: string } = {}) {
  urls.forEach(assertSafeNavigationUrl);
  const createdTabs = [];
  for (const url of urls) {
    createdTabs.push(await chrome.tabs.create({ url, active: options.active ?? true }));
  }

  if (options.groupTitle && supportsNativeTabGroups()) {
    const tabIds = createdTabs.map((tab) => tab.id).filter((id): id is number => id != null);
    if (tabIds.length > 0) {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: options.groupTitle });
    }
  }

  return createdTabs;
}

export type CurrentWindowTabWatchHandlers = {
  onRefresh: () => void;
  onRemoved: (tabId: number) => void;
  onUpdated: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void;
};

export function watchCurrentWindowTabs(handlers: CurrentWindowTabWatchHandlers) {
  const refreshListener = () => handlers.onRefresh();
  const removedListener = (tabId: number) => handlers.onRemoved(tabId);
  const updatedListener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (
      changeInfo.status === "complete" ||
      changeInfo.title !== undefined ||
      changeInfo.pinned !== undefined ||
      changeInfo.url !== undefined ||
      changeInfo.favIconUrl !== undefined
    ) {
      handlers.onUpdated(tabId, changeInfo, tab);
    }
  };

  chrome.tabs.onCreated.addListener(refreshListener);
  chrome.tabs.onRemoved.addListener(removedListener);
  chrome.tabs.onUpdated.addListener(updatedListener);
  chrome.tabs.onMoved.addListener(refreshListener);
  chrome.tabs.onAttached.addListener(refreshListener);
  chrome.tabs.onDetached.addListener(refreshListener);

  return () => {
    chrome.tabs.onCreated.removeListener(refreshListener);
    chrome.tabs.onRemoved.removeListener(removedListener);
    chrome.tabs.onUpdated.removeListener(updatedListener);
    chrome.tabs.onMoved.removeListener(refreshListener);
    chrome.tabs.onAttached.removeListener(refreshListener);
    chrome.tabs.onDetached.removeListener(refreshListener);
  };
}
import { assertSafeNavigationUrl } from "../lib/safeUrl";
