import type { UserSetting } from "../../domain/settings/schema";

export type DashboardBrowserPort = {
  runtime: {
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
  };
  tabs: {
    create(options: { url: string }): Promise<unknown>;
    update(tabId: number, options: { url: string }): Promise<unknown>;
  };
};

export type RedirectNewTabOptions = {
  browser: DashboardBrowserPort;
  getUserSetting: () => Promise<Pick<UserSetting, "newtab">>;
  redirectingTabIds: Set<number>;
  tabId: number | undefined;
  url: string;
};

export async function openDashboardInNewTab(browser: DashboardBrowserPort) {
  await browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
}

export async function openDashboardInOptionsPage(browser: DashboardBrowserPort) {
  await browser.runtime.openOptionsPage();
}

export async function handleDashboardCommand(command: string, browser: DashboardBrowserPort) {
  if (command === "dashboard") {
    await openDashboardInNewTab(browser);
    return true;
  }

  if (command === "dashboard_single") {
    await openDashboardInOptionsPage(browser);
    return true;
  }

  return false;
}

export async function redirectNewTabIfNeeded({
  browser,
  getUserSetting,
  redirectingTabIds,
  tabId,
  url
}: RedirectNewTabOptions) {
  if (tabId == null || !isNewTabUrl(url) || redirectingTabIds.has(tabId)) return false;

  redirectingTabIds.add(tabId);
  try {
    const setting = await getUserSetting();
    if ((setting.newtab ?? "override") !== "override") return false;

    await browser.tabs.update(tabId, {
      url: browser.runtime.getURL("/options.html")
    });
    return true;
  } finally {
    redirectingTabIds.delete(tabId);
  }
}

export function isNewTabUrl(url: string) {
  return url === "chrome://newtab/" || url === "edge://newtab/";
}
