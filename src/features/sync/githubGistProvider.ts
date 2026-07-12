import { extensionLocalStorage, getLocalString, removeLocalItem, setLocalString, type LocalStoragePort } from "../../platform/storage";
import { BACKUP_NAME, type SyncProvider, type SyncProviderCredentials } from "./provider";

export const GITHUB_GIST_CACHE_KEY = `github:${BACKUP_NAME}`;
const GITHUB_API = "https://api.github.com";

type FetchLike = typeof fetch;

type GitHubGist = {
  id?: unknown;
  description?: unknown;
  files?: Record<string, { content?: unknown; raw_url?: unknown; truncated?: unknown } | undefined>;
};

export function createGitHubGistProvider(
  localStorage: LocalStoragePort = extensionLocalStorage,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)
): SyncProvider {
  return {
    checkCredentials(credentials) {
      return getToken(credentials) ? null : "sync.nogithubToken";
    },
    async getConfig(name, credentials) {
      const gist = await findGist(name, credentials, localStorage, fetchImpl);
      if (!gist) return null;
      return readGistFileContent(gist, getBackupFileName(name), fetchImpl);
    },
    async setConfig(name, data, credentials) {
      const gist = await findGist(name, credentials, localStorage, fetchImpl);
      const fileName = getBackupFileName(name);

      if (getGistId(gist)) {
        const response = await githubRequest(fetchImpl, `/gists/${getGistId(gist)}`, credentials, {
          method: "PATCH",
          body: JSON.stringify({
            files: {
              [fileName]: { content: data }
            }
          })
        });
        if (!response.ok) throw new Error(`GitHub gist update failed: ${response.status}`);
        return true;
      }

      const response = await githubRequest(fetchImpl, "/gists", credentials, {
        method: "POST",
        body: JSON.stringify({
          description: name,
          public: false,
          files: {
            [fileName]: { content: data }
          }
        })
      });
      if (!response.ok) throw new Error(`GitHub gist create failed: ${response.status}`);

      const created = (await response.json()) as GitHubGist;
      const id = getGistId(created);
      if (id) await setLocalString(GITHUB_GIST_CACHE_KEY, id, localStorage);
      return Boolean(id);
    }
  };
}

async function findGist(
  name: string,
  credentials: SyncProviderCredentials,
  localStorage: LocalStoragePort,
  fetchImpl: FetchLike
) {
  const cachedId = await getLocalString(GITHUB_GIST_CACHE_KEY, localStorage);
  if (cachedId) {
    const cached = await getGistById(cachedId, credentials, localStorage, fetchImpl);
    if (cached) return cached;
  }

  for (let page = 1; page <= 3; page += 1) {
    const response = await githubRequest(fetchImpl, `/gists?per_page=30&page=${page}`, credentials);
    if (!response.ok) throw new Error(`GitHub gist list failed: ${response.status}`);
    const gists = (await response.json()) as unknown;
    if (!Array.isArray(gists)) return null;

    for (const candidate of gists) {
      if (!isGist(candidate) || candidate.description !== name) continue;
      const id = getGistId(candidate);
      if (id) await setLocalString(GITHUB_GIST_CACHE_KEY, id, localStorage);
      return candidate;
    }
  }

  return null;
}

async function getGistById(
  id: string,
  credentials: SyncProviderCredentials,
  localStorage: LocalStoragePort,
  fetchImpl: FetchLike
) {
  const response = await githubRequest(fetchImpl, `/gists/${id}`, credentials);
  if (response.status === 404) {
    await removeLocalItem(GITHUB_GIST_CACHE_KEY, localStorage);
    return null;
  }
  if (!response.ok) throw new Error(`GitHub gist read failed: ${response.status}`);
  const gist = (await response.json()) as unknown;
  return isGist(gist) ? gist : null;
}

async function githubRequest(
  fetchImpl: FetchLike,
  path: string,
  credentials: SyncProviderCredentials,
  init: RequestInit = {}
) {
  const customHeaders = normalizeHeaders(init.headers);
  return fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getToken(credentials)}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...customHeaders
    }
  });
}

function getToken(credentials: SyncProviderCredentials) {
  return credentials.githubToken?.trim() ?? "";
}

function getBackupFileName(name: string) {
  return `${name}.json`;
}

async function readGistFileContent(gist: GitHubGist, fileName: string, fetchImpl: FetchLike) {
  const file = gist.files?.[fileName];
  if (!file) return null;

  if (file.truncated !== true && typeof file.content === "string") return file.content;
  if (typeof file.raw_url !== "string" || !file.raw_url) {
    if (file.truncated === true) throw new Error("GitHub gist file is truncated and has no raw URL");
    return null;
  }

  const response = await fetchImpl(file.raw_url);
  if (!response.ok) throw new Error(`GitHub gist file download failed: ${response.status}`);
  return response.text();
}

function getGistId(gist: GitHubGist | null) {
  return typeof gist?.id === "string" && gist.id.length > 0 ? gist.id : null;
}

function isGist(value: unknown): value is GitHubGist {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHeaders(headers: HeadersInit | undefined) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}
