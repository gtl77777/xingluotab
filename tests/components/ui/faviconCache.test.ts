import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBrowserFaviconUrl,
  FaviconCache,
  type FaviconSourceLoader,
  type LoadedFaviconResource
} from "../../../src/components/ui/faviconCache";

const getExtensionUrl = (path: string) => `chrome-extension://xingluotab-test${path}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("favicon cache", () => {
  it("resolves the stored source without loading the browser fallback", async () => {
    const storedSource = "https://cdn.example/icon.png";
    const loadedSources: string[] = [];
    const cache = new FaviconCache({
      loader: async (source) => {
        loadedSources.push(source);
        return { width: 32, height: 32 };
      }
    });

    const result = await cache.prepare(storedSource, "https://example.com/page", getExtensionUrl);

    expect(result).toEqual({ source: storedSource, width: 32, height: 32, previewSafe: true });
    expect(cache.peek(storedSource, "https://example.com/page", getExtensionUrl)).toEqual(result);
    expect(loadedSources).toEqual([storedSource]);
  });

  it("falls back to Chromium's cache after a stored source fails", async () => {
    const storedSource = "https://cdn.example/missing.png";
    const pageUrl = "https://example.com/page";
    const browserSource = buildBrowserFaviconUrl(pageUrl, 32, getExtensionUrl)!;
    const sentinelSource = buildBrowserFaviconUrl("https://xingluotab-favicon.invalid/", 32, getExtensionUrl)!;
    const loadedSources: string[] = [];
    const cache = new FaviconCache({
      loader: async (source) => {
        loadedSources.push(source);
        if (source === storedSource) return undefined;
        return { width: 32, height: 32, fingerprint: source === sentinelSource ? 2 : 1 };
      }
    });

    const result = await cache.prepare(storedSource, pageUrl, getExtensionUrl);

    expect(result?.source).toBe(browserSource);
    expect(result?.previewSafe).toBe(true);
    expect(loadedSources).toEqual([storedSource, browserSource, sentinelSource]);
  });

  it("rejects Chromium's generic default favicon", async () => {
    const fingerprint = 42;
    const cache = new FaviconCache({
      loader: async () => ({ width: 32, height: 32, fingerprint })
    });

    const result = await cache.prepare(undefined, "https://example.com/page", getExtensionUrl);

    expect(result).toBeUndefined();
    expect(cache.peek(undefined, "https://example.com/page", getExtensionUrl)).toBeUndefined();
  });

  it("does not put oversized remote images on the scrolling preview path", async () => {
    const source = "https://cdn.example/large-icon.png";
    const cache = new FaviconCache({
      loader: async () => ({ width: 512, height: 512 })
    });

    const result = await cache.prepare(source, undefined);

    expect(result).toEqual({ source, width: 512, height: 512, previewSafe: false });
  });

  it("requires a local thumbnail before previewing a high-resolution remote icon", async () => {
    const source = "https://cdn.example/product-icon.png";
    const cache = new FaviconCache({
      loader: async () => ({ width: 288, height: 288 })
    });

    const result = await cache.prepare(source, undefined);

    expect(result).toEqual({ source, width: 288, height: 288, previewSafe: false });
  });

  it("serves a retained local thumbnail for a large remote icon", async () => {
    const source = "https://cdn.example/large-product-icon.png";
    const displaySource = "blob:xingluotab-large-product-icon";
    const cache = new FaviconCache({
      loader: async () => ({
        width: 288,
        height: 288,
        displaySource,
        displayPixels: 64 * 64
      })
    });

    const result = await cache.prepare(source, undefined);

    expect(result).toEqual({ source, displaySource, width: 288, height: 288, previewSafe: true });
  });

  it("releases local thumbnails when the retained-resource LRU evicts them", async () => {
    const released: string[] = [];
    const firstSource = "https://cdn.example/first-large-icon.png";
    const secondSource = "https://cdn.example/second-large-icon.png";
    const cache = new FaviconCache({
      maxRetainedEntries: 1,
      loader: async (source) => ({
        width: 288,
        height: 288,
        displaySource: `blob:${source}`,
        displayPixels: 64 * 64,
        release: () => released.push(source)
      })
    });

    await cache.prepare(firstSource, undefined);
    await cache.prepare(secondSource, undefined);

    expect(released).toEqual([firstSource]);
    expect(cache.peek(firstSource, undefined)).toEqual({
      source: firstSource,
      width: 288,
      height: 288,
      previewSafe: false
    });
    expect(cache.peek(secondSource, undefined)?.displaySource).toBe(`blob:${secondSource}`);
  });

  it("drops a broken local thumbnail without invalidating the remote source", async () => {
    let loadCount = 0;
    let releaseCount = 0;
    const source = "https://cdn.example/large-icon-with-broken-thumbnail.png";
    const cache = new FaviconCache({
      loader: async () => {
        loadCount += 1;
        return {
          width: 288,
          height: 288,
          displaySource: "blob:broken-thumbnail",
          displayPixels: 64 * 64,
          release: () => {
            releaseCount += 1;
          }
        };
      }
    });

    await expect(cache.prepare(source, undefined)).resolves.toMatchObject({
      source,
      displaySource: "blob:broken-thumbnail",
      previewSafe: true
    });
    cache.invalidateDisplaySource(source);

    expect(cache.peek(source, undefined)).toEqual({
      source,
      width: 288,
      height: 288,
      previewSafe: false
    });
    expect(loadCount).toBe(1);
    expect(releaseCount).toBe(1);
  });

  it("only generates a 64px local thumbnail for oversized remote sources", async () => {
    const images: MockImage[] = [];
    class MockImage {
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = "auto";
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private source = "";

      constructor() {
        images.push(this);
      }

      set src(value: string) {
        this.source = value;
        const size = value.includes("small-icon") ? 32 : 288;
        this.naturalWidth = size;
        this.naturalHeight = size;
        queueMicrotask(() => this.onload?.());
      }

      get src() {
        return this.source;
      }

      decode() {
        return Promise.resolve();
      }
    }

    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: vi.fn()
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(new Blob(["thumbnail"]))),
      toDataURL: vi.fn(() => "data:image/png;base64,dGh1bWJuYWls")
    };
    const createElement = vi.fn(() => canvas);
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("document", { createElement });
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:large-thumbnail");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const largeSource = "https://cdn.example/large-icon.png";
    const largeCache = new FaviconCache();
    await expect(largeCache.prepare(largeSource, undefined)).resolves.toMatchObject({
      source: largeSource,
      displaySource: "blob:large-thumbnail",
      previewSafe: true
    });
    expect(images).toHaveLength(2);
    expect(images[0]?.crossOrigin).toBeNull();
    expect(images[1]?.crossOrigin).toBe("anonymous");
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
    expect(createObjectUrl).toHaveBeenCalledOnce();

    const smallSource = "https://cdn.example/small-icon.png";
    const smallCache = new FaviconCache();
    await expect(smallCache.prepare(smallSource, undefined)).resolves.toEqual({
      source: smallSource,
      width: 32,
      height: 32,
      previewSafe: true
    });
    expect(images).toHaveLength(3);
    expect(createElement).toHaveBeenCalledOnce();

    largeCache.invalidateDisplaySource(largeSource);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:large-thumbnail");
  });

  it("coalesces concurrent loads of a shared stored source", async () => {
    let finishLoad: ((result: LoadedFaviconResource) => void) | undefined;
    let loadCount = 0;
    const loader: FaviconSourceLoader = () => {
      loadCount += 1;
      return new Promise((resolve) => {
        finishLoad = resolve;
      });
    };
    const cache = new FaviconCache({ loader });
    const source = "https://cdn.example/shared.png";

    const first = cache.prepare(source, "https://one.example", getExtensionUrl);
    const second = cache.prepare(source, "https://two.example", getExtensionUrl);
    finishLoad?.({ width: 32, height: 32 });

    await expect(first).resolves.toMatchObject({ source });
    await expect(second).resolves.toMatchObject({ source });
    expect(loadCount).toBe(1);
  });

  it("reuses a ready stored source synchronously for another page", async () => {
    let loadCount = 0;
    const source = "https://cdn.example/shared-product-icon.png";
    const cache = new FaviconCache({
      loader: async () => {
        loadCount += 1;
        return { width: 32, height: 32 };
      }
    });

    const first = await cache.prepare(source, "https://example.com/document-one", getExtensionUrl);
    const second = cache.peek(source, "https://example.com/document-two", getExtensionUrl);

    expect(first).toEqual({ source, width: 32, height: 32, previewSafe: true });
    expect(second).toEqual(first);
    await expect(cache.prepare(source, "https://example.com/document-two", getExtensionUrl)).resolves.toEqual(first);
    expect(loadCount).toBe(1);
  });

  it("invalidates a broken ready source and advances to the fallback", async () => {
    const storedSource = "https://cdn.example/stale.png";
    const pageUrl = "https://example.com/page";
    const browserSource = buildBrowserFaviconUrl(pageUrl, 32, getExtensionUrl)!;
    const sentinelSource = buildBrowserFaviconUrl("https://xingluotab-favicon.invalid/", 32, getExtensionUrl)!;
    const cache = new FaviconCache({
      loader: async (source) => ({
        width: 32,
        height: 32,
        fingerprint: source === browserSource ? 1 : source === sentinelSource ? 2 : undefined
      })
    });

    await expect(cache.prepare(storedSource, pageUrl, getExtensionUrl)).resolves.toMatchObject({ source: storedSource });
    cache.invalidateSource(storedSource);
    await expect(cache.prepare(storedSource, pageUrl, getExtensionUrl)).resolves.toMatchObject({ source: browserSource });
  });

  it("retries missing sources after the negative-cache TTL", async () => {
    let now = 100;
    let loadCount = 0;
    const source = "https://cdn.example/later.png";
    const cache = new FaviconCache({
      now: () => now,
      missingTtlMs: 1_000,
      loader: async () => {
        loadCount += 1;
        return loadCount === 1 ? undefined : { width: 32, height: 32 };
      }
    });

    await expect(cache.prepare(source, undefined)).resolves.toBeUndefined();
    await expect(cache.prepare(source, undefined)).resolves.toBeUndefined();
    expect(loadCount).toBe(1);

    now += 1_001;
    await expect(cache.prepare(source, undefined)).resolves.toMatchObject({ source });
    expect(loadCount).toBe(2);
  });
});
