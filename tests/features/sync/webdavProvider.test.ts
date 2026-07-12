import { describe, expect, it, vi } from "vitest";
import { createWebDAVProvider, type WebDAVClientFactory } from "../../../src/features/sync/webdavProvider";

function createClientFactory(options: { fileExists?: boolean; dirExists?: boolean; content?: string } = {}) {
  const client = {
    exists: vi.fn(async (path: string) => {
      if (path === "/xingluotab") return options.dirExists ?? false;
      if (path === "/xingluotab/sample_backup.json") return options.fileExists ?? false;
      return false;
    }),
    createDirectory: vi.fn(async () => undefined),
    getFileContents: vi.fn(async () => options.content ?? "{}"),
    putFileContents: vi.fn(async () => true)
  };
  const factory = vi.fn(() => client) as unknown as WebDAVClientFactory;
  return { client, factory };
}

describe("WebDAV sync provider", () => {
  it("requires all WebDAV credentials", () => {
    const { factory } = createClientFactory();
    const provider = createWebDAVProvider(factory);

    expect(provider.checkCredentials({ webDAVUrl: "", webDAVUsername: "user", webDAVPassword: "pass" })).toBe(
      "sync.miss_webdav_credentials"
    );
    expect(
      provider.checkCredentials({
        webDAVUrl: "https://dav.example/",
        webDAVUsername: "user",
        webDAVPassword: "pass"
      })
    ).toBeNull();
  });

  it("reads the fixed backup path", async () => {
    const { client, factory } = createClientFactory({ fileExists: true, content: "{\"version\":1}" });
    const provider = createWebDAVProvider(factory);

    await expect(
      provider.getConfig("sample_backup", {
        webDAVUrl: "https://dav.example/",
        webDAVUsername: "user",
        webDAVPassword: "pass"
      })
    ).resolves.toBe("{\"version\":1}");

    expect(client.exists).toHaveBeenCalledWith("/xingluotab/sample_backup.json");
    expect(client.getFileContents).toHaveBeenCalledWith("/xingluotab/sample_backup.json", { format: "text" });
  });

  it("returns null when the remote backup does not exist", async () => {
    const { client, factory } = createClientFactory({ fileExists: false });
    const provider = createWebDAVProvider(factory);

    await expect(
      provider.getConfig("sample_backup", {
        webDAVUrl: "https://dav.example/",
        webDAVUsername: "user",
        webDAVPassword: "pass"
      })
    ).resolves.toBeNull();

    expect(client.getFileContents).not.toHaveBeenCalled();
  });

  it("propagates authentication and network failures", async () => {
    const read = createClientFactory();
    read.client.exists.mockRejectedValueOnce(new Error("Invalid response: 401 Unauthorized"));
    const readProvider = createWebDAVProvider(read.factory);
    const credentials = {
      webDAVUrl: "https://dav.example/",
      webDAVUsername: "user",
      webDAVPassword: "pass"
    };

    await expect(readProvider.getConfig("sample_backup", credentials)).rejects.toThrow("401 Unauthorized");

    const upload = createClientFactory({ dirExists: true });
    upload.client.putFileContents.mockRejectedValueOnce(new Error("Network unavailable"));
    const uploadProvider = createWebDAVProvider(upload.factory);

    await expect(uploadProvider.setConfig("sample_backup", "{}", credentials)).rejects.toThrow("Network unavailable");
  });

  it("creates the fixed directory before upload", async () => {
    const { client, factory } = createClientFactory({ dirExists: false });
    const provider = createWebDAVProvider(factory);

    await expect(
      provider.setConfig("sample_backup", "{}", {
        webDAVUrl: "https://dav.example/",
        webDAVUsername: "user",
        webDAVPassword: "pass"
      })
    ).resolves.toBe(true);

    expect(client.createDirectory).toHaveBeenCalledWith("/xingluotab");
    expect(client.putFileContents).toHaveBeenCalledWith("/xingluotab/sample_backup.json", "{}", { overwrite: true });
  });
});
