import {
  extensionLocalStorage,
  getLocalJson,
  getLocalString,
  setLocalJson,
  setLocalString,
  type LocalStoragePort
} from "../../platform/storage";
import {
  SPACE_LIST_STORAGE_KEY,
  SPACE_STORAGE_KEY_PREFIX,
  SPACE_VERSION_STORAGE_KEY,
  spaceStorageKey
} from "../space/repository";
import type { Space, SpaceSummary } from "../space/schema";
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  type Backup,
  type SpaceBackup
} from "../sync/schema";
import { cloneSingleSpaceForImport, createRuntimeIdFactory, type IdFactory } from "./cloneSpace";
import { validateBackup, validateSingleSpace, type ValidationIssue, type ValidationResult } from "./validation";

export type ImportedSpace = {
  summary: SpaceSummary;
  space: Space;
};

export class BackupStorageError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[]
  ) {
    super(message);
    this.name = "BackupStorageError";
  }
}

export async function exportBackup(localStorage = extensionLocalStorage): Promise<Backup> {
  const version = await readSpaceVersion(localStorage);
  const spaceList = await getLocalJson<SpaceSummary[]>(SPACE_LIST_STORAGE_KEY, [], localStorage);
  const spaces: Record<string, Space> = {};

  for (const summary of spaceList) {
    const space = await getLocalJson<Space | null>(spaceStorageKey(summary.id), null, localStorage);
    if (space) spaces[summary.id] = space;
  }

  const backup: Backup = {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    type: "xingluotab-backup",
    dataVersion: version,
    spaceList,
    spaces
  };
  const result = validateBackup(backup);
  if (!result.ok) throw new BackupStorageError("Stored spaces cannot be exported as a valid backup", result.issues);

  return result.value;
}

export async function importBackup(
  input: unknown,
  localStorage = extensionLocalStorage
): Promise<ValidationResult<Backup>> {
  const result = validateBackup(input);
  if (!result.ok) return result;

  const backup = result.value;
  await withSpaceStorageRollback(localStorage, async () => {
    await setLocalJson(SPACE_LIST_STORAGE_KEY, backup.spaceList, localStorage);

    for (const summary of backup.spaceList) {
      await setLocalJson(spaceStorageKey(summary.id), backup.spaces[summary.id], localStorage);
    }

    await removeOrphanSpaces(
      new Set(backup.spaceList.map((summary) => spaceStorageKey(summary.id))),
      localStorage
    );
    await setLocalString(SPACE_VERSION_STORAGE_KEY, backup.dataVersion.toString(), localStorage);
  });

  return result;
}

export async function importSingleSpace(
  input: unknown,
  options: {
    localStorage?: LocalStoragePort;
    idFactory?: IdFactory;
    now?: () => number;
  } = {}
): Promise<ValidationResult<ImportedSpace>> {
  const result = validateSingleSpace(input);
  if (!result.ok) return result;

  const localStorage = options.localStorage ?? extensionLocalStorage;
  const idFactory = options.idFactory ?? createRuntimeIdFactory();
  const imported = await cloneWithUniqueSpaceId(result.value, localStorage, idFactory);
  const spaceList = await getLocalJson<SpaceSummary[]>(SPACE_LIST_STORAGE_KEY, [], localStorage);

  await withSpaceStorageRollback(localStorage, async () => {
    await setLocalJson(SPACE_LIST_STORAGE_KEY, [...spaceList, imported.summary], localStorage);
    await setLocalJson(spaceStorageKey(imported.space.id), imported.space, localStorage);
    await setLocalString(SPACE_VERSION_STORAGE_KEY, (options.now?.() ?? Date.now()).toString(), localStorage);
  });

  return { ok: true, value: imported, issues: [] };
}

export function createSpaceBackup(space: Space): SpaceBackup {
  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    type: "xingluotab-space",
    space
  };
}

async function cloneWithUniqueSpaceId(source: Space, localStorage: LocalStoragePort, idFactory: IdFactory) {
  const existingSpaceIds = new Set(
    (await getLocalJson<SpaceSummary[]>(SPACE_LIST_STORAGE_KEY, [], localStorage)).map((space) => space.id)
  );

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const imported = cloneSingleSpaceForImport(source, idFactory);
    if (existingSpaceIds.has(imported.summary.id)) continue;
    if (await getLocalString(spaceStorageKey(imported.summary.id), localStorage)) continue;
    return imported;
  }

  throw new BackupStorageError("Unable to allocate a unique imported space id", [
    {
      path: "$.id",
      code: "space.idCollision",
      message: "imported space id conflicts with existing storage"
    }
  ]);
}

async function readSpaceVersion(localStorage: LocalStoragePort) {
  const value = Number(await getLocalString(SPACE_VERSION_STORAGE_KEY, localStorage));
  return Number.isFinite(value) ? value : 0;
}

async function removeOrphanSpaces(validSpaceKeys: Set<string>, localStorage: LocalStoragePort) {
  const keys = await localStorage.getKeys();

  await Promise.all(
    keys
      .filter((key) => key.startsWith(SPACE_STORAGE_KEY_PREFIX))
      .filter((key) => !validSpaceKeys.has(key))
      .map((key) => localStorage.removeItem(key))
  );
}

async function withSpaceStorageRollback<T>(localStorage: LocalStoragePort, operation: () => Promise<T>) {
  const snapshot = await snapshotSpaceStorage(localStorage);
  try {
    return await operation();
  } catch (error) {
    try {
      await restoreSpaceStorage(localStorage, snapshot);
    } catch (rollbackError) {
      throw new Error("Space storage operation failed and rollback was incomplete", {
        cause: { operationError: error, rollbackError }
      });
    }
    throw error;
  }
}

async function snapshotSpaceStorage(localStorage: LocalStoragePort) {
  const keys = (await localStorage.getKeys()).filter(isSpaceStorageKey);
  return new Map(await Promise.all(keys.map(async (key) => [key, await getLocalString(key, localStorage)] as const)));
}

async function restoreSpaceStorage(localStorage: LocalStoragePort, snapshot: Map<string, string>) {
  const currentKeys = (await localStorage.getKeys()).filter(isSpaceStorageKey);
  await Promise.all(currentKeys.filter((key) => !snapshot.has(key)).map((key) => localStorage.removeItem(key)));
  for (const [key, value] of snapshot) {
    await setLocalString(key, value, localStorage);
  }
}

function isSpaceStorageKey(key: string) {
  return (
    key === SPACE_LIST_STORAGE_KEY ||
    key === SPACE_VERSION_STORAGE_KEY ||
    key.startsWith(SPACE_STORAGE_KEY_PREFIX)
  );
}
