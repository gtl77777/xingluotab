import { describe, expect, it, vi } from "vitest";
import { importBackup } from "../../../src/domain/import/backupRepository";
import { LAST_SYNC_TIME_STORAGE_KEY, SPACE_LIST_STORAGE_KEY, SPACE_VERSION_STORAGE_KEY, spaceStorageKey } from "../../../src/domain/space/repository";
import type { Backup, SyncSetting } from "../../../src/domain/sync/schema";
import { defaultSyncSetting } from "../../../src/domain/sync/schema";
import {
  autoSyncBackup,
  pullRemoteBackup,
  pushLocalBackup,
  runConfiguredSync,
  selectSyncProvider
} from "../../../src/features/sync/remoteSync";
import type { SyncProvider } from "../../../src/features/sync/provider";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

const localBackup: Backup = {
  schemaVersion: 1,
  type: "xingluotab-backup",
  dataVersion: 1700000000000,
  spaceList: [{ id: "space-a", name: "Main" }],
  spaces: {
    "space-a": {
      id: "space-a",
      name: "Main",
      pins: {},
      groups: [
        {
          id: "group-a",
          name: "A",
          tabs: [{ id: "tab-a", kind: "record", title: "A", url: "https://a.example/" }]
        }
      ]
    }
  }
};

const remoteBackup: Backup = {
  schemaVersion: 1,
  type: "xingluotab-backup",
  dataVersion: 1800000000000,
  spaceList: [{ id: "space-b", name: "Remote" }],
  spaces: {
    "space-b": {
      id: "space-b",
      name: "Remote",
      pins: {},
      groups: [
        {
          id: "group-b",
          name: "B",
          tabs: [{ id: "tab-b", kind: "record", title: "B", url: "https://b.example/" }]
        }
      ]
    }
  }
};

function createLocalStorage() {
  return createMemoryStorage({
    [SPACE_VERSION_STORAGE_KEY]: localBackup.dataVersion.toString(),
    [SPACE_LIST_STORAGE_KEY]: json(localBackup.spaceList),
    [spaceStorageKey("space-a")]: json(localBackup.spaces["space-a"])
  });
}

function createProvider(remote: Backup | null): SyncProvider & { uploaded: string[] } {
  const uploaded: string[] = [];
  return {
    uploaded,
    checkCredentials: vi.fn(() => null),
    getConfig: vi.fn(async () => (remote ? JSON.stringify(remote) : null)),
    setConfig: vi.fn(async (_name, data) => {
      uploaded.push(data);
      return true;
    })
  };
}

describe("remote sync", () => {
  it("returns a conflict when pushing over a newer remote backup", async () => {
    const storage = createLocalStorage();
    const provider = createProvider(remoteBackup);

    await expect(pushLocalBackup(provider, {}, { localStorage: storage })).resolves.toMatchObject({
      status: "conflict",
      localVersion: localBackup.dataVersion,
      remoteVersion: remoteBackup.dataVersion
    });
    expect(provider.uploaded).toEqual([]);
  });

  it("force pushes the local backup", async () => {
    const storage = createLocalStorage();
    const provider = createProvider(remoteBackup);

    await expect(pushLocalBackup(provider, {}, { force: true, localStorage: storage })).resolves.toMatchObject({
      status: "pushed",
      localVersion: localBackup.dataVersion
    });
    expect(JSON.parse(provider.uploaded[0] ?? "null")).toEqual(localBackup);
  });

  it("pulls and imports a newer remote backup", async () => {
    const storage = createLocalStorage();
    const provider = createProvider(remoteBackup);

    await expect(pullRemoteBackup(provider, {}, { localStorage: storage })).resolves.toMatchObject({
      status: "pulled",
      remoteVersion: remoteBackup.dataVersion
    });
    expect(JSON.parse(storage.dump()[SPACE_LIST_STORAGE_KEY] ?? "null")).toEqual(remoteBackup.spaceList);
    expect(JSON.parse(storage.dump()[spaceStorageKey("space-b")] ?? "null")).toEqual(remoteBackup.spaces["space-b"]);
  });

  it("detects pull conflicts when local version is newer", async () => {
    const storage = createLocalStorage();
    const olderRemote = { ...remoteBackup, dataVersion: localBackup.dataVersion - 1 };
    const provider = createProvider(olderRemote);

    await expect(pullRemoteBackup(provider, {}, { localStorage: storage })).resolves.toMatchObject({
      status: "conflict",
      localVersion: localBackup.dataVersion,
      remoteVersion: olderRemote.dataVersion
    });
  });

  it("auto sync pulls newer remote data or pushes local data", async () => {
    const pullStorage = createLocalStorage();
    await expect(
      autoSyncBackup(createProvider(remoteBackup), {}, { localStorage: pullStorage, now: () => 1900000000000 })
    ).resolves.toMatchObject({ status: "pulled" });
    expect(pullStorage.dump()[LAST_SYNC_TIME_STORAGE_KEY]).toBe("1900000000000");

    const pushStorage = createLocalStorage();
    const provider = createProvider(null);
    await expect(autoSyncBackup(provider, {}, { localStorage: pushStorage, now: () => 1900000000001 })).resolves.toMatchObject({
      status: "pushed"
    });
    expect(provider.uploaded).toHaveLength(1);
    expect(pushStorage.dump()[LAST_SYNC_TIME_STORAGE_KEY]).toBe("1900000000001");
  });

  it("does not change the last sync time when auto sync is a noop", async () => {
    const storage = createLocalStorage();
    await storage.setString(LAST_SYNC_TIME_STORAGE_KEY, "previous");

    await expect(
      autoSyncBackup(createProvider(localBackup), {}, { localStorage: storage, now: () => 1900000000002 })
    ).resolves.toMatchObject({ status: "noop" });
    expect(storage.dump()[LAST_SYNC_TIME_STORAGE_KEY]).toBe("previous");
  });

  it("selects configured providers and runs configured sync", async () => {
    const storage = createLocalStorage();
    await importBackup(localBackup, storage);
    const github = createProvider(null);
    const webdav = createProvider(null);
    const setting: SyncSetting = {
      ...defaultSyncSetting,
      enableGithubGistSync: true,
      githubToken: "token",
      autoSyncMode: "github"
    };

    expect(selectSyncProvider(setting, null, { github, webdav })?.provider).toBe(github);
    await expect(
      runConfiguredSync("push", {
        setting,
        providers: { github, webdav },
        localStorage: storage
      })
    ).resolves.toMatchObject({ status: "pushed" });
  });
});
