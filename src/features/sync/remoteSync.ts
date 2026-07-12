import { exportBackup, importBackup } from "../../domain/import/backupRepository";
import {
  LAST_SYNC_TIME_STORAGE_KEY,
  SPACE_VERSION_STORAGE_KEY
} from "../../domain/space/repository";
import { getSyncSetting } from "../../domain/sync/repository";
import type { Backup, SyncSetting } from "../../domain/sync/schema";
import { extensionLocalStorage, getLocalString, setLocalString, type LocalStoragePort } from "../../platform/storage";
import { createGitHubGistProvider } from "./githubGistProvider";
import { createWebDAVProvider } from "./webdavProvider";
import {
  BACKUP_NAME,
  decideSyncDirection,
  parseRemoteBackup,
  serializeBackup,
  type SyncProvider,
  type SyncProviderCredentials
} from "./provider";

export type RemoteSyncStatus = "pushed" | "pulled" | "noop" | "conflict" | "error";

export type RemoteSyncResult = {
  status: RemoteSyncStatus;
  message: string;
  localVersion?: number;
  remoteVersion?: number;
};

export type RemoteSyncProviders = {
  github: SyncProvider;
  webdav: SyncProvider;
};

type RemoteSyncOptions = {
  force?: boolean;
  localStorage?: LocalStoragePort;
  now?: () => number;
};

export async function pushLocalBackup(
  provider: SyncProvider,
  credentials: SyncProviderCredentials,
  options: RemoteSyncOptions = {}
): Promise<RemoteSyncResult> {
  const credentialError = provider.checkCredentials(credentials);
  if (credentialError) return syncError(credentialError);

  try {
    const local = await exportBackup(options.localStorage);
    if (!options.force) {
      const remote = await readRemoteBackup(provider, credentials);
      if (!remote.ok) return syncError(remote.message, local.dataVersion);
      if (remote.value && remote.value.dataVersion > local.dataVersion) {
        return {
          status: "conflict",
          message: "Remote backup is newer",
          localVersion: local.dataVersion,
          remoteVersion: remote.value.dataVersion
        };
      }
    }

    const uploaded = await provider.setConfig(BACKUP_NAME, serializeBackup(local), credentials);
    if (!uploaded) return syncError("Remote upload failed", local.dataVersion);

    return {
      status: "pushed",
      message: "Pushed local backup",
      localVersion: local.dataVersion
    };
  } catch (error) {
    return syncError(error instanceof Error ? error.message : "Unable to push local backup");
  }
}

export async function pullRemoteBackup(
  provider: SyncProvider,
  credentials: SyncProviderCredentials,
  options: RemoteSyncOptions = {}
): Promise<RemoteSyncResult> {
  const credentialError = provider.checkCredentials(credentials);
  if (credentialError) return syncError(credentialError);

  try {
    const localVersion = await readLocalVersion(options.localStorage);
    const remote = await readRemoteBackup(provider, credentials);
    if (!remote.ok) return syncError(remote.message, localVersion);
    if (!remote.value) return syncError("Remote backup not found", localVersion);

    if (!options.force && localVersion > remote.value.dataVersion) {
      return {
        status: "conflict",
        message: "Local backup is newer",
        localVersion,
        remoteVersion: remote.value.dataVersion
      };
    }

    const result = await importBackup(remote.value, options.localStorage);
    if (!result.ok) return syncError("Remote backup failed validation", localVersion, remote.value.dataVersion);

    return {
      status: "pulled",
      message: "Pulled remote backup",
      localVersion,
      remoteVersion: remote.value.dataVersion
    };
  } catch (error) {
    return syncError(error instanceof Error ? error.message : "Unable to pull remote backup");
  }
}

export async function autoSyncBackup(
  provider: SyncProvider,
  credentials: SyncProviderCredentials,
  options: RemoteSyncOptions = {}
): Promise<RemoteSyncResult> {
  const credentialError = provider.checkCredentials(credentials);
  if (credentialError) return syncError(credentialError);

  try {
    const localVersion = await readLocalVersion(options.localStorage);
    const remote = await readRemoteBackup(provider, credentials);
    if (!remote.ok) return syncError(remote.message, localVersion);

    if (remote.value && remote.value.dataVersion > localVersion) {
      const result = await importBackup(remote.value, options.localStorage);
      if (!result.ok) return syncError("Remote backup failed validation", localVersion, remote.value.dataVersion);
      const syncResult: RemoteSyncResult = {
        status: "pulled",
        message: "Auto sync pulled remote backup",
        localVersion,
        remoteVersion: remote.value.dataVersion
      };
      await recordLastSyncTime(options);
      return syncResult;
    }

    const local = await exportBackup(options.localStorage);
    const direction = decideSyncDirection(local, remote.value);
    if (direction === "noop") {
      return {
        status: "noop",
        message: "Backup versions are already equal",
        localVersion: local.dataVersion,
        remoteVersion: remote.value?.dataVersion
      };
    }

    const uploaded = await provider.setConfig(BACKUP_NAME, serializeBackup(local), credentials);
    if (!uploaded) return syncError("Remote upload failed", local.dataVersion, remote.value?.dataVersion);
    const syncResult: RemoteSyncResult = {
      status: "pushed",
      message: "Auto sync pushed local backup",
      localVersion: local.dataVersion,
      remoteVersion: remote.value?.dataVersion
    };
    await recordLastSyncTime(options);
    return syncResult;
  } catch (error) {
    return syncError(error instanceof Error ? error.message : "Unable to auto sync backup");
  }
}

async function recordLastSyncTime(options: RemoteSyncOptions) {
  await setLocalString(
    LAST_SYNC_TIME_STORAGE_KEY,
    (options.now?.() ?? Date.now()).toString(),
    options.localStorage
  );
}

export async function runConfiguredSync(
  mode: "push" | "pull" | "auto",
  options: RemoteSyncOptions & {
    providerMode?: "github" | "webdav" | null;
    setting?: SyncSetting;
    providers?: RemoteSyncProviders;
  } = {}
) {
  const setting = options.setting ?? (await getSyncSetting(options.localStorage));
  const selected = selectSyncProvider(setting, options.providerMode, options.providers);
  if (!selected) return syncError("No remote sync provider enabled");

  if (mode === "push") return pushLocalBackup(selected.provider, selected.credentials, options);
  if (mode === "pull") return pullRemoteBackup(selected.provider, selected.credentials, options);
  return autoSyncBackup(selected.provider, selected.credentials, options);
}

export function selectSyncProvider(
  setting: SyncSetting,
  providerMode?: "github" | "webdav" | null,
  providers: RemoteSyncProviders = createDefaultProviders()
) {
  const mode = providerMode ?? setting.autoSyncMode ?? (setting.enableGithubGistSync ? "github" : null) ?? (setting.enableWebDAVSync ? "webdav" : null);
  if (mode === "github" && setting.enableGithubGistSync) {
    return {
      provider: providers.github,
      credentials: {
        githubToken: setting.githubToken
      }
    };
  }
  if (mode === "webdav" && setting.enableWebDAVSync) {
    return {
      provider: providers.webdav,
      credentials: {
        webDAVUrl: setting.webDAVUrl,
        webDAVUsername: setting.webDAVUsername,
        webDAVPassword: setting.webDAVPassword
      }
    };
  }
  return null;
}

export function createDefaultProviders(): RemoteSyncProviders {
  return {
    github: createGitHubGistProvider(extensionLocalStorage),
    webdav: createWebDAVProvider()
  };
}

async function readRemoteBackup(provider: SyncProvider, credentials: SyncProviderCredentials) {
  const content = await provider.getConfig(BACKUP_NAME, credentials);
  return parseRemoteBackup(content);
}

async function readLocalVersion(localStorage: LocalStoragePort = extensionLocalStorage) {
  const value = Number(await getLocalString(SPACE_VERSION_STORAGE_KEY, localStorage));
  return Number.isFinite(value) ? value : 0;
}

function syncError(message: string, localVersion?: number, remoteVersion?: number): RemoteSyncResult {
  return {
    status: "error",
    message,
    localVersion,
    remoteVersion
  };
}
