import { defineBackground } from "wxt/sandbox";
import { getUserSetting } from "../src/domain/settings/repository";
import { SPACE_VERSION_STORAGE_KEY } from "../src/domain/space/repository";
import { createAutoSyncScheduler } from "../src/features/background/autoSync";
import {
  handleDashboardCommand,
  openDashboardInOptionsPage,
  redirectNewTabIfNeeded
} from "../src/features/background/dashboardActions";
import { runConfiguredSync } from "../src/features/sync/remoteSync";

export default defineBackground(() => {
  const redirectingNewTabs = new Set<number>();
  const autoSyncScheduler = createAutoSyncScheduler({
    async run() {
      const result = await runConfiguredSync("auto");
      if (result.status === "pulled") {
        try {
          await chrome.runtime.sendMessage({ event: "data_pull_done" });
        } catch {
          // No visible extension page may be listening while the MV3 worker is awake.
        }
      }
    }
  });

  chrome.tabs.onCreated.addListener(async (tab) => {
    await handleNewTabRedirect(tab.id, tab.url ?? tab.pendingUrl ?? "");
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    await handleNewTabRedirect(tabId, changeInfo.url ?? "");
  });

  async function handleNewTabRedirect(tabId: number | undefined, url: string) {
    await redirectNewTabIfNeeded({
      browser: chrome,
      getUserSetting,
      redirectingTabIds: redirectingNewTabs,
      tabId,
      url
    });
  }

  chrome.commands.onCommand.addListener(async (command) => {
    await handleDashboardCommand(command, chrome);
  });

  chrome.action.onClicked.addListener(async () => {
    await openDashboardInOptionsPage(chrome);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.event === "app_created") {
      autoSyncScheduler.schedule();
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SPACE_VERSION_STORAGE_KEY]) {
      autoSyncScheduler.schedule();
    }
  });
});
