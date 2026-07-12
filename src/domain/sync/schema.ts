import type { Space, SpaceSummary } from "../space/schema";

export const CURRENT_BACKUP_SCHEMA_VERSION = 1 as const;

export type Backup = {
  schemaVersion: typeof CURRENT_BACKUP_SCHEMA_VERSION;
  type: "xingluotab-backup";
  dataVersion: number;
  spaceList: SpaceSummary[];
  spaces: Record<string, Space>;
};

export type SpaceBackup = {
  schemaVersion: typeof CURRENT_BACKUP_SCHEMA_VERSION;
  type: "xingluotab-space";
  space: Space;
};

export type SyncSetting = {
  enableGithubGistSync: boolean;
  githubToken: string;
  enableWebDAVSync: boolean;
  webDAVUrl: string;
  webDAVUsername: string;
  webDAVPassword: string;
  autoSyncMode: "github" | "webdav" | "none" | null;
};

export const defaultSyncSetting: SyncSetting = {
  enableGithubGistSync: false,
  githubToken: "",
  enableWebDAVSync: false,
  webDAVUrl: "",
  webDAVUsername: "",
  webDAVPassword: "",
  autoSyncMode: null
};
