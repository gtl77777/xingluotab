import {
  extensionLocalStorage,
  getLocalJson,
  removeLocalItem,
  setLocalJson,
  setLocalString,
  type LocalStoragePort
} from "../../platform/storage";
import { createEmptySpace, type Space, type SpaceSummary } from "./schema";

export const SPACE_LIST_STORAGE_KEY = "xingluotab:space-list";
export const SPACE_VERSION_STORAGE_KEY = "xingluotab:space-version";
export const LAST_SYNC_TIME_STORAGE_KEY = "xingluotab:last-sync-time";
export const SPACE_STORAGE_KEY_PREFIX = "xingluotab:space:";
export const spaceStorageKey = (id: string) => `${SPACE_STORAGE_KEY_PREFIX}${id}`;

export async function getSpaceList(localStorage: LocalStoragePort = extensionLocalStorage) {
  return getLocalJson<SpaceSummary[]>(SPACE_LIST_STORAGE_KEY, [], localStorage);
}

export async function saveSpaceList(
  spaces: SpaceSummary[],
  updateVersion = true,
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  await setLocalJson(SPACE_LIST_STORAGE_KEY, spaces, localStorage);
  if (updateVersion) await touchSpaceVersion(Date.now(), localStorage);
}

export async function getSpace(id: string, localStorage: LocalStoragePort = extensionLocalStorage) {
  return getLocalJson<Space | null>(spaceStorageKey(id), null, localStorage);
}

export async function saveSpace(
  space: Space,
  updateVersion = true,
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  await setLocalJson(spaceStorageKey(space.id), space, localStorage);
  if (updateVersion) await touchSpaceVersion(Date.now(), localStorage);
}

export async function saveSpaceTransfer(
  transfer: {
    sourceBefore: Space;
    targetBefore: Space;
    sourceAfter: Space;
    targetAfter: Space;
  },
  now = Date.now(),
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  const { sourceBefore, targetBefore, sourceAfter, targetAfter } = transfer;
  if (sourceBefore.id === targetBefore.id || sourceAfter.id !== sourceBefore.id || targetAfter.id !== targetBefore.id) {
    throw new Error("Invalid cross-space transfer");
  }

  try {
    await setLocalJson(spaceStorageKey(targetAfter.id), targetAfter, localStorage);
    await setLocalJson(spaceStorageKey(sourceAfter.id), sourceAfter, localStorage);
    await touchSpaceVersion(now, localStorage);
  } catch (error) {
    const rollback = await Promise.allSettled([
      setLocalJson(spaceStorageKey(sourceBefore.id), sourceBefore, localStorage),
      setLocalJson(spaceStorageKey(targetBefore.id), targetBefore, localStorage)
    ]);
    if (rollback.some((result) => result.status === "rejected")) {
      throw new Error("Cross-space transfer failed and could not be fully rolled back", { cause: error });
    }
    throw error;
  }
}

export async function createSpace(
  name: string,
  now = Date.now(),
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  const id = now.toString();
  const summary: SpaceSummary = { id, name };
  const list = await getSpaceList(localStorage);

  await saveSpaceList([...list, summary], false, localStorage);
  await saveSpace(createEmptySpace(id, name), true, localStorage);

  return summary;
}

export async function renameSpace(
  id: string,
  name: string,
  now = Date.now(),
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  const list = await getSpaceList(localStorage);
  const storedSpace = await getSpace(id, localStorage);
  if (!list.some((space) => space.id === id) && !storedSpace) {
    return { list, space: null };
  }

  const nextList = list.map((space) => (space.id === id ? { ...space, name } : space));
  const nextSpace = storedSpace ? { ...storedSpace, name } : null;

  await setLocalJson(SPACE_LIST_STORAGE_KEY, nextList, localStorage);
  if (nextSpace) await setLocalJson(spaceStorageKey(id), nextSpace, localStorage);
  await touchSpaceVersion(now, localStorage);

  return { list: nextList, space: nextSpace };
}

export async function updateSpaceIcon(
  id: string,
  icon: string | undefined,
  now = Date.now(),
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  const list = await getSpaceList(localStorage);
  if (!list.some((space) => space.id === id)) return list;

  const nextList = list.map((space) => (space.id === id ? { ...space, icon } : space));
  await saveSpaceList(nextList, false, localStorage);
  await touchSpaceVersion(now, localStorage);
  return nextList;
}

export async function reorderSpace(
  sourceId: string,
  targetId: string,
  now = Date.now(),
  localStorage: LocalStoragePort = extensionLocalStorage
) {
  const list = await getSpaceList(localStorage);
  const nextList = reorderSpaceList(list, sourceId, targetId);
  if (nextList === list) return list;

  await saveSpaceList(nextList, false, localStorage);
  await touchSpaceVersion(now, localStorage);
  return nextList;
}

export async function deleteSpace(id: string, localStorage: LocalStoragePort = extensionLocalStorage) {
  const list = (await getSpaceList(localStorage)).filter((space) => space.id !== id);
  await setLocalJson(SPACE_LIST_STORAGE_KEY, list, localStorage);
  await removeLocalItem(spaceStorageKey(id), localStorage);
  await removeOrphanSpaces(new Set(list.map((space) => spaceStorageKey(space.id))), localStorage);
  await touchSpaceVersion(Date.now(), localStorage);
}

export async function touchSpaceVersion(now = Date.now(), localStorage: LocalStoragePort = extensionLocalStorage) {
  await setLocalString(SPACE_VERSION_STORAGE_KEY, now.toString(), localStorage);
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

function reorderSpaceList(spaces: SpaceSummary[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return spaces;

  const sourceIndex = spaces.findIndex((space) => space.id === sourceId);
  const targetIndex = spaces.findIndex((space) => space.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) return spaces;

  const nextSpaces = [...spaces];
  const [sourceSpace] = nextSpaces.splice(sourceIndex, 1);
  if (!sourceSpace) return spaces;

  nextSpaces.splice(targetIndex, 0, sourceSpace);
  return nextSpaces;
}
