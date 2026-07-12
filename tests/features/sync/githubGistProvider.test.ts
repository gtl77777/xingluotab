import { describe, expect, it, vi } from "vitest";
import { createGitHubGistProvider, GITHUB_GIST_CACHE_KEY } from "../../../src/features/sync/githubGistProvider";
import { createMemoryStorage } from "../../helpers/memoryStorage";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("GitHub Gist sync provider", () => {
  it("requires a token", () => {
    const provider = createGitHubGistProvider(createMemoryStorage(), vi.fn() as unknown as typeof fetch);

    expect(provider.checkCredentials({ githubToken: "" })).toBe("sync.nogithubToken");
    expect(provider.checkCredentials({ githubToken: "token" })).toBeNull();
  });

  it("reads a cached gist file", async () => {
    const storage = createMemoryStorage({ [GITHUB_GIST_CACHE_KEY]: "gist-id" });
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: "gist-id",
        description: "sample_backup",
        files: {
          "sample_backup.json": { content: "{\"version\":1}" }
        }
      })
    ) as unknown as typeof fetch;
    const provider = createGitHubGistProvider(storage, fetchImpl);

    await expect(provider.getConfig("sample_backup", { githubToken: "token" })).resolves.toBe("{\"version\":1}");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.github.com/gists/gist-id", expect.any(Object));
  });

  it("downloads the raw file when GitHub truncates a large gist", async () => {
    const storage = createMemoryStorage({ [GITHUB_GIST_CACHE_KEY]: "gist-id" });
    const rawUrl = "https://gist.githubusercontent.com/example/raw/sample_backup.json";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === rawUrl) return new Response("{\"version\":2}");
      return jsonResponse({
        id: "gist-id",
        description: "sample_backup",
        files: {
          "sample_backup.json": { content: "{\"version\":", raw_url: rawUrl, truncated: true }
        }
      });
    }) as unknown as typeof fetch;
    const provider = createGitHubGistProvider(storage, fetchImpl);

    await expect(provider.getConfig("sample_backup", { githubToken: "token" })).resolves.toBe("{\"version\":2}");
    expect(fetchImpl).toHaveBeenCalledWith(rawUrl);
  });

  it("creates a private gist when no matching gist exists", async () => {
    const storage = createMemoryStorage();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/gists?")) return jsonResponse([]);
      expect(init?.method).toBe("POST");
      return jsonResponse({ id: "created-id" });
    }) as unknown as typeof fetch;
    const provider = createGitHubGistProvider(storage, fetchImpl);

    await expect(provider.setConfig("sample_backup", "{}", { githubToken: "token" })).resolves.toBe(true);

    expect(storage.dump()[GITHUB_GIST_CACHE_KEY]).toBe("created-id");
    const createCall = vi.mocked(fetchImpl).mock.calls.find(([url]) => String(url) === "https://api.github.com/gists");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      description: "sample_backup",
      public: false,
      files: {
        "sample_backup.json": { content: "{}" }
      }
    });
  });

  it("propagates GitHub upload failures with the HTTP status", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/gists?")) return jsonResponse([]);
      return jsonResponse({}, 403);
    }) as unknown as typeof fetch;
    const provider = createGitHubGistProvider(createMemoryStorage(), fetchImpl);

    await expect(provider.setConfig("sample_backup", "{}", { githubToken: "token" })).rejects.toThrow(
      "GitHub gist create failed: 403"
    );
  });
});
