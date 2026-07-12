import type { Backup } from "../../domain/sync/schema";
import { validateBackup } from "../../domain/import/validation";

export type SyncProviderCredentials = Record<string, string | undefined>;

export type SyncProvider = {
  checkCredentials(credentials: SyncProviderCredentials): string | null;
  getConfig(name: string, credentials: SyncProviderCredentials): Promise<string | null>;
  setConfig(name: string, data: string, credentials: SyncProviderCredentials): Promise<boolean>;
};

export const BACKUP_NAME = "xingluotab_backup";

export function decideSyncDirection(local: Backup, remote: Backup | null) {
  if (!remote || !remote.dataVersion) return "push-local" as const;
  if (remote.dataVersion > local.dataVersion) return "pull-remote" as const;
  if (remote.dataVersion < local.dataVersion) return "push-local" as const;
  return "noop" as const;
}

export function serializeBackup(backup: Backup) {
  return JSON.stringify(backup, null, 2);
}

export function parseRemoteBackup(content: string | null) {
  if (!content) return { ok: true as const, value: null };

  try {
    const parsed = JSON.parse(content) as unknown;
    const result = validateBackup(parsed);
    if (!result.ok) {
      return { ok: false as const, message: formatValidationIssues(result.issues) };
    }
    return { ok: true as const, value: result.value };
  } catch {
    return { ok: false as const, message: "Remote backup is not valid JSON" };
  }
}

function formatValidationIssues(issues: Array<{ path: string; code: string }>) {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.code}`)
    .join("; ");
}
