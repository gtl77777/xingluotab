import { describe, expect, it, vi } from "vitest";
import {
  handleDashboardCommand,
  isNewTabUrl,
  openDashboardInOptionsPage,
  redirectNewTabIfNeeded,
  type DashboardBrowserPort
} from "../../../src/features/background/dashboardActions";

function createBrowserPort(): DashboardBrowserPort {
  return {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
      openOptionsPage: vi.fn(async () => undefined)
    },
    tabs: {
      create: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined)
    }
  };
}

describe("dashboard background actions", () => {
  it("opens the dashboard in a new tab for the dashboard command", async () => {
    const browser = createBrowserPort();

    await expect(handleDashboardCommand("dashboard", browser)).resolves.toBe(true);

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://extension-id/options.html"
    });
  });

  it("opens the dashboard in the browser options page for single-window commands and action clicks", async () => {
    const browser = createBrowserPort();

    await expect(handleDashboardCommand("dashboard_single", browser)).resolves.toBe(true);
    await openDashboardInOptionsPage(browser);

    expect(browser.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
  });

  it("ignores unknown commands", async () => {
    const browser = createBrowserPort();

    await expect(handleDashboardCommand("unknown", browser)).resolves.toBe(false);

    expect(browser.tabs.create).not.toHaveBeenCalled();
    expect(browser.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it("redirects Edge and Chrome new tab pages when enabled", async () => {
    const browser = createBrowserPort();
    const redirectingTabIds = new Set<number>();

    await expect(
      redirectNewTabIfNeeded({
        browser,
        getUserSetting: async () => ({ newtab: "override" }),
        redirectingTabIds,
        tabId: 7,
        url: "edge://newtab/"
      })
    ).resolves.toBe(true);

    expect(browser.tabs.update).toHaveBeenCalledWith(7, {
      url: "chrome-extension://extension-id/options.html"
    });
    expect(redirectingTabIds.size).toBe(0);
  });

  it("does not redirect when disabled, already redirecting, missing tab id, or non-newtab url", async () => {
    const browser = createBrowserPort();
    const redirectingTabIds = new Set<number>([9]);

    await expect(
      redirectNewTabIfNeeded({
        browser,
        getUserSetting: async () => ({ newtab: "none" }),
        redirectingTabIds,
        tabId: 7,
        url: "chrome://newtab/"
      })
    ).resolves.toBe(false);
    await expect(
      redirectNewTabIfNeeded({
        browser,
        getUserSetting: async () => ({ newtab: "override" }),
        redirectingTabIds,
        tabId: 9,
        url: "chrome://newtab/"
      })
    ).resolves.toBe(false);
    await expect(
      redirectNewTabIfNeeded({
        browser,
        getUserSetting: async () => ({ newtab: "override" }),
        redirectingTabIds,
        tabId: undefined,
        url: "chrome://newtab/"
      })
    ).resolves.toBe(false);
    await expect(
      redirectNewTabIfNeeded({
        browser,
        getUserSetting: async () => ({ newtab: "override" }),
        redirectingTabIds,
        tabId: 10,
        url: "https://example.com/"
      })
    ).resolves.toBe(false);

    expect(browser.tabs.update).not.toHaveBeenCalled();
  });

  it("classifies supported new tab URLs", () => {
    expect(isNewTabUrl("chrome://newtab/")).toBe(true);
    expect(isNewTabUrl("edge://newtab/")).toBe(true);
    expect(isNewTabUrl("about:blank")).toBe(false);
  });
});
