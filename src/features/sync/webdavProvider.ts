import { createClient, type WebDAVClient } from "webdav";
import type { SyncProvider, SyncProviderCredentials } from "./provider";

const WEBDAV_DIR = "/xingluotab";

export type WebDAVClientFactory = (url: string, options: { username: string; password: string }) => WebDAVClient;

export function createWebDAVProvider(clientFactory: WebDAVClientFactory = createClient): SyncProvider {
  return {
    checkCredentials(credentials) {
      if (!credentials.webDAVUrl?.trim() || !credentials.webDAVUsername?.trim() || !credentials.webDAVPassword) {
        return "sync.miss_webdav_credentials";
      }
      return null;
    },
    async getConfig(name, credentials) {
      const client = createConfiguredClient(clientFactory, credentials);
      const path = getBackupPath(name);
      if (!(await client.exists(path))) return null;
      const content = await client.getFileContents(path, { format: "text" });
      return typeof content === "string" ? content : String(content);
    },
    async setConfig(name, data, credentials) {
      const client = createConfiguredClient(clientFactory, credentials);
      if (!(await client.exists(WEBDAV_DIR))) {
        await client.createDirectory(WEBDAV_DIR);
      }
      return client.putFileContents(getBackupPath(name), data, { overwrite: true });
    }
  };
}

function createConfiguredClient(clientFactory: WebDAVClientFactory, credentials: SyncProviderCredentials) {
  return clientFactory((credentials.webDAVUrl ?? "").trim(), {
    username: (credentials.webDAVUsername ?? "").trim(),
    password: credentials.webDAVPassword ?? ""
  });
}

function getBackupPath(name: string) {
  return `${WEBDAV_DIR}/${name}.json`;
}
