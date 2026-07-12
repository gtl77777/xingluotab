import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentWindowSessionTabs, sessionToRecord, tabToSessionTab } from "../../../src/features/tabs/sessionTabs";

const extensionRootUrl = "chrome-extension://extension-id/";

describe("session tabs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "chrome");
  });

  it("maps a browser tab to a session tab", () => {
    expect(
      tabToSessionTab(
        {
          id: 7,
          title: "Example",
          url: "https://example.test/",
          favIconUrl: "https://example.test/favicon.ico",
          pinned: false
        } as chrome.tabs.Tab,
        { extensionRootUrl, idFactory: () => "session-id" }
      )
    ).toEqual({
      kind: "session",
      id: "session-id",
      tid: "7",
      title: "Example",
      url: "https://example.test/",
      favIconUrl: "https://example.test/favicon.ico",
      pinned: false
    });
  });

  it("shows a loading tab as soon as pendingUrl is available", () => {
    expect(
      tabToSessionTab(
        { id: 8, pendingUrl: "https://loading.example/", title: "" } as chrome.tabs.Tab,
        { extensionRootUrl, idFactory: () => "loading-session" }
      )
    ).toMatchObject({
      id: "loading-session",
      tid: "8",
      title: "",
      url: "https://loading.example/"
    });
  });

  it("matches the 1.0 policy for browser internal pages, extension pages and pinned tabs", () => {
    expect(
      tabToSessionTab({ id: 1, url: "edge://newtab/", pinned: false } as chrome.tabs.Tab, { extensionRootUrl })
    ).toBeNull();
    expect(tabToSessionTab({ id: 4, url: "about:blank", pinned: false } as chrome.tabs.Tab, { extensionRootUrl })).not.toBeNull();
    expect(
      tabToSessionTab({ id: 5, url: "chrome://extensions/", pinned: false } as chrome.tabs.Tab, { extensionRootUrl })
    ).not.toBeNull();
    expect(
      tabToSessionTab({ id: 2, url: `${extensionRootUrl}options.html`, pinned: false } as chrome.tabs.Tab, {
        extensionRootUrl
      })
    ).toBeNull();
    expect(
      tabToSessionTab({ id: 3, url: "https://example.test/", pinned: true } as chrome.tabs.Tab, {
        extensionRootUrl,
        includePinned: false
      })
    ).toBeNull();
  });

  it("converts session tabs to record tabs without the browser tab id", () => {
    expect(
      sessionToRecord({
        kind: "session",
        id: "tab-id",
        tid: "12",
        title: "Example",
        url: "https://example.test/",
        pinned: true
      })
    ).toEqual({
      kind: "record",
      id: "tab-id",
      title: "Example",
      url: "https://example.test/",
      pinned: true
    });
  });

  it("reverses browser order and preserves session ids across tab updates", async () => {
    let tabs = [
      { id: 1, title: "First", url: "https://first.example/" },
      { id: 2, title: "Second", url: "https://second.example/" }
    ] as chrome.tabs.Tab[];
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: { getURL: (path: string) => `chrome-extension://extension-id${path}` },
        tabs: { query: vi.fn(async () => tabs) }
      }
    });

    const firstRead = await getCurrentWindowSessionTabs();
    tabs = [{ ...tabs[0]!, title: "First updated" }, tabs[1]!] as chrome.tabs.Tab[];
    const secondRead = await getCurrentWindowSessionTabs();

    expect(firstRead.map((tab) => tab.tid)).toEqual(["2", "1"]);
    expect(secondRead.find((tab) => tab.tid === "1")?.title).toBe("First updated");
    expect(secondRead.find((tab) => tab.tid === "1")?.id).toBe(firstRead.find((tab) => tab.tid === "1")?.id);
  });
});
