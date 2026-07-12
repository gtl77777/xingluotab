import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateBrowserTab,
  getOptionsUrl,
  openOptionsInCurrentMode,
  openUrl,
  openUrlsInTabs,
  queryCurrentWindowTabs,
  removeBrowserTabs,
  supportsNativeTabGroups,
  watchCurrentWindowTabs
} from "../../src/platform/browser";

type ChromeMock = typeof chrome;

function createEventMock<TArgs extends unknown[]>() {
  const listeners = new Set<(...args: TArgs) => void>();
  return {
    addListener: vi.fn((listener: (...args: TArgs) => void) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (...args: TArgs) => void) => {
      listeners.delete(listener);
    }),
    emit(...args: TArgs) {
      for (const listener of listeners) listener(...args);
    }
  };
}

function installChromeMock(options: { nativeGroups?: boolean } = {}) {
  let nextTabId = 100;
  const events = {
    onCreated: createEventMock<[chrome.tabs.Tab]>(),
    onRemoved: createEventMock<[number]>(),
    onUpdated: createEventMock<[number, chrome.tabs.TabChangeInfo, chrome.tabs.Tab]>(),
    onMoved: createEventMock<[number, chrome.tabs.TabMoveInfo]>(),
    onAttached: createEventMock<[number, chrome.tabs.TabAttachInfo]>(),
    onDetached: createEventMock<[number, chrome.tabs.TabDetachInfo]>()
  };
  const chromeMock = {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
      openOptionsPage: vi.fn(async () => undefined)
    },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async (input: chrome.tabs.CreateProperties) => ({ id: nextTabId++, ...input })),
      update: vi.fn(async (tabId: number, input: chrome.tabs.UpdateProperties) => ({ id: tabId, ...input })),
      remove: vi.fn(async () => undefined),
      group: options.nativeGroups ? vi.fn(async () => 55) : undefined,
      ...events
    },
    tabGroups: options.nativeGroups
      ? {
          update: vi.fn(async () => undefined)
        }
      : undefined
  } as unknown as ChromeMock;

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: chromeMock
  });

  return { chromeMock, events };
}

describe("browser platform adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "chrome");
  });

  it("builds extension URLs and opens options in configured modes", async () => {
    const { chromeMock } = installChromeMock();

    expect(getOptionsUrl()).toBe("chrome-extension://extension-id/options.html");
    await openOptionsInCurrentMode(true);
    await openOptionsInCurrentMode(false);

    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://extension-id/options.html"
    });
  });

  it("queries and removes current window tabs", async () => {
    const { chromeMock } = installChromeMock();
    vi.mocked(chromeMock.tabs.query).mockResolvedValue([{ id: 1, url: "https://example.com/" } as chrome.tabs.Tab]);

    await expect(queryCurrentWindowTabs()).resolves.toHaveLength(1);
    await activateBrowserTab(9);
    await removeBrowserTabs([]);
    await removeBrowserTabs([1, 2]);

    expect(chromeMock.tabs.query).toHaveBeenCalledWith({ currentWindow: true });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(9, { active: true });
    expect(chromeMock.tabs.remove).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([1, 2]);
  });

  it("opens URLs by creating tabs or replacing the active tab", async () => {
    const { chromeMock } = installChromeMock();
    vi.mocked(chromeMock.tabs.query).mockResolvedValue([{ id: 7 } as chrome.tabs.Tab]);

    await openUrl("https://replace.example/", { replaceCurrent: true });
    await openUrl("https://new.example/", { active: false });

    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, { url: "https://replace.example/" });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: "https://new.example/", active: false });
  });

  it("falls back to tab creation when replacing without an active tab", async () => {
    const { chromeMock } = installChromeMock();
    vi.mocked(chromeMock.tabs.query).mockResolvedValue([]);

    await openUrl("https://new.example/", { replaceCurrent: true });

    expect(chromeMock.tabs.update).not.toHaveBeenCalled();
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: "https://new.example/", active: true });
  });

  it("blocks script-capable navigation schemes before calling browser APIs", async () => {
    const { chromeMock } = installChromeMock();

    await expect(openUrl(" java\nscript:alert(1) ")).rejects.toThrow("Unsafe navigation URL");
    await expect(openUrlsInTabs(["https://safe.example/", "data:text/html,unsafe"])).rejects.toThrow("Unsafe navigation URL");

    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.tabs.update).not.toHaveBeenCalled();
  });

  it("opens URL batches and groups them when native tab groups are available", async () => {
    const { chromeMock } = installChromeMock({ nativeGroups: true });

    await expect(
      openUrlsInTabs(["https://a.example/", "https://b.example/"], {
        active: false,
        groupTitle: "Group"
      })
    ).resolves.toHaveLength(2);

    expect(supportsNativeTabGroups()).toBe(true);
    expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [100, 101] });
    expect(chromeMock.tabGroups?.update).toHaveBeenCalledWith(55, { title: "Group" });
  });

  it("watches and unwatches current window tab events", () => {
    const { events } = installChromeMock();
    const handlers = {
      onRefresh: vi.fn(),
      onRemoved: vi.fn(),
      onUpdated: vi.fn()
    };

    const unwatch = watchCurrentWindowTabs(handlers);
    events.onCreated.emit({ id: 7 } as chrome.tabs.Tab);
    events.onRemoved.emit(8);
    events.onUpdated.emit(7, { title: "Updated" }, { id: 7, title: "Updated" } as chrome.tabs.Tab);
    events.onUpdated.emit(7, { audible: true }, { id: 7, audible: true } as chrome.tabs.Tab);
    unwatch();
    events.onCreated.emit({ id: 9 } as chrome.tabs.Tab);

    expect(handlers.onRefresh).toHaveBeenCalledTimes(1);
    expect(handlers.onRemoved).toHaveBeenCalledWith(8);
    expect(handlers.onUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onUpdated).toHaveBeenCalledWith(7, { title: "Updated" }, expect.objectContaining({ id: 7 }));
    expect(events.onCreated.addListener).toHaveBeenCalledTimes(1);
    expect(events.onCreated.removeListener).toHaveBeenCalledTimes(1);
    expect(events.onUpdated.removeListener).toHaveBeenCalledTimes(1);
  });
});
