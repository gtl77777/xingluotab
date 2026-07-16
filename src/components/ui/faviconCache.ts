type RuntimeGetUrl = (path: string) => string;

export type FaviconReadyResult = {
  source: string;
  displaySource?: string;
  width: number;
  height: number;
  previewSafe: boolean;
};

type FaviconResolution = Omit<FaviconReadyResult, "displaySource">;

export type LoadedFaviconResource = {
  width: number;
  height: number;
  fingerprint?: number;
  displaySource?: string;
  displayPixels?: number;
  release?: () => void;
  retained?: unknown;
};

export type FaviconSourceLoader = (source: string) => Promise<LoadedFaviconResource | undefined>;

type ResourceEntry =
  | { state: "loading"; promise: Promise<ResourceReady | undefined>; lastUsed: number }
  | ({ state: "ready"; lastUsed: number } & ResourceReady)
  | { state: "missing"; retryAfter: number; lastUsed: number };

type ResourceReady = LoadedFaviconResource & {
  source: string;
  retainedPixels: number;
};

type ResolutionEntry =
  | { state: "loading"; promise: Promise<FaviconResolution | undefined>; lastUsed: number }
  | { state: "ready"; result: FaviconResolution; lastUsed: number }
  | { state: "missing"; retryAfter: number; lastUsed: number };

export type FaviconCacheOptions = {
  loader?: FaviconSourceLoader;
  now?: () => number;
  missingTtlMs?: number;
  maxResourceEntries?: number;
  maxResolutionEntries?: number;
  maxRetainedEntries?: number;
  maxRetainedPixels?: number;
  maxRetainedPixelsPerImage?: number;
  maxPreviewPixels?: number;
};

export type PrepareFaviconsOptions = {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  getUrl?: RuntimeGetUrl;
};

const DEFAULT_FAVICON_SENTINEL_URL = "https://xingluotab-favicon.invalid/";
const DEFAULT_MISSING_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RESOURCE_ENTRIES = 2048;
const DEFAULT_MAX_RESOLUTION_ENTRIES = 4096;
const DEFAULT_MAX_RETAINED_ENTRIES = 512;
const DEFAULT_MAX_RETAINED_PIXELS = 2_000_000;
const DEFAULT_MAX_RETAINED_PIXELS_PER_IMAGE = 128 * 128;
const DEFAULT_MAX_PREVIEW_PIXELS = 128 * 128;
const DEFAULT_LOAD_TIMEOUT_MS = 10_000;
const THUMBNAIL_LOAD_TIMEOUT_MS = 3_000;
const FAVICON_THUMBNAIL_SIZE = 64;
const FAVICON_THUMBNAIL_TRIGGER_SIZE = 128;
const MAX_THUMBNAIL_SOURCE_PIXELS = 1024 * 1024;

export function buildBrowserFaviconUrl(pageUrl: string | undefined, size = 32, getUrl?: RuntimeGetUrl) {
  if (!pageUrl) return undefined;
  try {
    const parsedPageUrl = new URL(pageUrl);
    if (parsedPageUrl.protocol !== "http:" && parsedPageUrl.protocol !== "https:") return undefined;
    const runtimeGetUrl = getUrl ?? globalThis.chrome?.runtime?.getURL?.bind(globalThis.chrome.runtime);
    if (!runtimeGetUrl) return undefined;
    const faviconUrl = new URL(runtimeGetUrl("/_favicon/"));
    faviconUrl.searchParams.set("pageUrl", parsedPageUrl.toString());
    faviconUrl.searchParams.set("size", String(size));
    faviconUrl.searchParams.set("forceEmptyDefaultFavicon", "1");
    faviconUrl.searchParams.set("forceLightMode", "1");
    return faviconUrl.toString();
  } catch {
    return undefined;
  }
}

export function getFaviconSources(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
  const browserFaviconUrl = buildBrowserFaviconUrl(pageUrl, 32, getUrl);
  return [...new Set([src?.trim() || undefined, browserFaviconUrl].filter((value): value is string => Boolean(value)))];
}

function getResolutionKey(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
  const sources = getFaviconSources(src, pageUrl, getUrl);
  return sources.length > 0 ? sources.map((source) => `${source.length}:${source}`).join("|") : undefined;
}

export class FaviconCache {
  private readonly loader: FaviconSourceLoader;
  private readonly now: () => number;
  private readonly missingTtlMs: number;
  private readonly maxResourceEntries: number;
  private readonly maxResolutionEntries: number;
  private readonly maxRetainedEntries: number;
  private readonly maxRetainedPixels: number;
  private readonly maxRetainedPixelsPerImage: number;
  private readonly maxPreviewPixels: number;
  private readonly resources = new Map<string, ResourceEntry>();
  private readonly resolutions = new Map<string, ResolutionEntry>();
  private retainedEntries = 0;
  private retainedPixels = 0;
  private revision = 0;

  constructor(options: FaviconCacheOptions = {}) {
    this.loader = options.loader ?? loadFaviconSource;
    this.now = options.now ?? Date.now;
    this.missingTtlMs = options.missingTtlMs ?? DEFAULT_MISSING_TTL_MS;
    this.maxResourceEntries = options.maxResourceEntries ?? DEFAULT_MAX_RESOURCE_ENTRIES;
    this.maxResolutionEntries = options.maxResolutionEntries ?? DEFAULT_MAX_RESOLUTION_ENTRIES;
    this.maxRetainedEntries = options.maxRetainedEntries ?? DEFAULT_MAX_RETAINED_ENTRIES;
    this.maxRetainedPixels = options.maxRetainedPixels ?? DEFAULT_MAX_RETAINED_PIXELS;
    this.maxRetainedPixelsPerImage = options.maxRetainedPixelsPerImage ?? DEFAULT_MAX_RETAINED_PIXELS_PER_IMAGE;
    this.maxPreviewPixels = options.maxPreviewPixels ?? DEFAULT_MAX_PREVIEW_PIXELS;
  }

  getRevision() {
    return this.revision;
  }

  peek(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
    const key = getResolutionKey(src, pageUrl, getUrl);
    if (!key) return undefined;
    const entry = this.getResolutionEntry(key);
    if (entry?.state === "ready") {
      return this.presentResult(entry.result);
    }
    if (entry) return undefined;

    const sharedResult = this.resolveCachedSources(src, pageUrl, getUrl);
    if (!sharedResult) return undefined;
    this.setResolutionEntry(key, { state: "ready", result: sharedResult, lastUsed: this.now() });
    return this.presentResult(sharedResult);
  }

  prepare(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
    const key = getResolutionKey(src, pageUrl, getUrl);
    if (!key) return Promise.resolve(undefined);
    const cached = this.getResolutionEntry(key);
    if (cached?.state === "ready") {
      return Promise.resolve(this.presentResult(cached.result));
    }
    if (cached?.state === "loading") {
      return cached.promise.then((result) => this.presentResult(result));
    }
    if (cached?.state === "missing") return Promise.resolve(undefined);

    const promise = this.resolveSources(src, pageUrl, getUrl).then((result) => {
      const now = this.now();
      if (result) {
        this.setResolutionEntry(key, { state: "ready", result, lastUsed: now });
      } else {
        this.setResolutionEntry(key, { state: "missing", retryAfter: now + this.missingTtlMs, lastUsed: now });
      }
      this.revision += 1;
      return result;
    });
    this.setResolutionEntry(key, { state: "loading", promise, lastUsed: this.now() });
    return promise.then((result) => this.presentResult(result));
  }

  async prepareMany(
    items: Array<{ src?: string; url?: string }>,
    { concurrency = 4, timeoutMs = 180, signal, getUrl }: PrepareFaviconsOptions = {}
  ) {
    if (signal?.aborted || timeoutMs <= 0) return;
    const uniqueItems = new Map<string, { src?: string; url?: string }>();
    for (const item of items) {
      const key = getResolutionKey(item.src, item.url, getUrl);
      if (key && !uniqueItems.has(key)) uniqueItems.set(key, item);
    }
    const queue = [...uniqueItems.values()];
    if (queue.length === 0) return;

    let cursor = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    signal?.addEventListener("abort", stop, { once: true });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        stopped = true;
        resolve();
      }, timeoutMs);
    });
    const worker = async () => {
      while (!stopped && cursor < queue.length) {
        const item = queue[cursor++];
        if (item) await this.prepare(item.src, item.url, getUrl);
      }
    };
    const work = Promise.all(
      Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, () => worker())
    ).then(() => undefined);

    await Promise.race([work, timeoutPromise]);
    stopped = true;
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener("abort", stop);
  }

  invalidateSource(source: string) {
    const now = this.now();
    this.setResourceEntry(source, {
      state: "missing",
      retryAfter: now + this.missingTtlMs,
      lastUsed: now
    });
    for (const [key, entry] of this.resolutions) {
      if (entry.state === "ready" && entry.result.source === source) this.resolutions.delete(key);
    }
    this.revision += 1;
  }

  invalidateDisplaySource(source: string) {
    const entry = this.resources.get(source);
    if (!entry || entry.state !== "ready" || !entry.displaySource) return;
    this.releaseRetainedResource(entry);
    this.resources.set(source, {
      ...entry,
      displaySource: undefined,
      displayPixels: undefined,
      release: undefined,
      retained: undefined,
      retainedPixels: 0,
      lastUsed: this.now()
    });
    this.revision += 1;
  }

  private async resolveSources(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
    const browserSource = buildBrowserFaviconUrl(pageUrl, 32, getUrl);
    for (const source of getFaviconSources(src, pageUrl, getUrl)) {
      const resource = await this.ensureResource(source);
      if (!resource) continue;
      if (source === browserSource && await this.isDefaultBrowserFavicon(resource, getUrl)) continue;
      return {
        source,
        width: resource.width,
        height: resource.height,
        previewSafe: source === browserSource || resource.width * resource.height <= this.maxPreviewPixels
      } satisfies FaviconResolution;
    }
    return undefined;
  }

  private resolveCachedSources(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
    const browserSource = buildBrowserFaviconUrl(pageUrl, 32, getUrl);
    for (const source of getFaviconSources(src, pageUrl, getUrl)) {
      const resource = this.getResourceEntry(source);
      if (!resource || resource.state !== "ready") continue;
      if (source === browserSource && resource.fingerprint !== undefined) {
        const sentinelSource = buildBrowserFaviconUrl(DEFAULT_FAVICON_SENTINEL_URL, 32, getUrl);
        const sentinel = sentinelSource ? this.getResourceEntry(sentinelSource) : undefined;
        if (!sentinel || sentinel.state !== "ready" || sentinel.fingerprint === undefined) continue;
        if (sentinel.fingerprint === resource.fingerprint) continue;
      }
      return {
        source,
        width: resource.width,
        height: resource.height,
        previewSafe: source === browserSource || resource.width * resource.height <= this.maxPreviewPixels
      } satisfies FaviconResolution;
    }
    return undefined;
  }

  private async isDefaultBrowserFavicon(resource: ResourceReady, getUrl?: RuntimeGetUrl) {
    if (resource.fingerprint === undefined) return false;
    const sentinelSource = buildBrowserFaviconUrl(DEFAULT_FAVICON_SENTINEL_URL, 32, getUrl);
    if (!sentinelSource) return false;
    const sentinel = await this.ensureResource(sentinelSource);
    return sentinel?.fingerprint !== undefined && sentinel.fingerprint === resource.fingerprint;
  }

  private ensureResource(source: string) {
    const cached = this.getResourceEntry(source);
    if (cached?.state === "ready") return Promise.resolve(cached);
    if (cached?.state === "loading") return cached.promise;
    if (cached?.state === "missing") return Promise.resolve(undefined);

    const promise = this.loader(source)
      .catch(() => undefined)
      .then((loaded) => {
        const now = this.now();
        if (!loaded || loaded.width <= 0 || loaded.height <= 0) {
          loaded?.release?.();
          this.setResourceEntry(source, {
            state: "missing",
            retryAfter: now + this.missingTtlMs,
            lastUsed: now
          });
          return undefined;
        }
        const pixels = loaded.width * loaded.height;
        const displayPixels = loaded.displaySource
          ? loaded.displayPixels ?? Math.min(pixels, FAVICON_THUMBNAIL_SIZE * FAVICON_THUMBNAIL_SIZE)
          : 0;
        const retainDisplay = Boolean(loaded.displaySource && displayPixels <= this.maxRetainedPixelsPerImage);
        const retainImage = Boolean(!retainDisplay && loaded.retained && pixels <= this.maxRetainedPixelsPerImage);
        if (loaded.displaySource && !retainDisplay) loaded.release?.();
        const retained = retainDisplay ? loaded.displaySource : retainImage ? loaded.retained : undefined;
        const ready: ResourceEntry = {
          state: "ready",
          source,
          width: loaded.width,
          height: loaded.height,
          fingerprint: loaded.fingerprint,
          displaySource: retainDisplay ? loaded.displaySource : undefined,
          displayPixels: retainDisplay ? displayPixels : undefined,
          release: retainDisplay ? loaded.release : undefined,
          retained,
          retainedPixels: retainDisplay ? displayPixels : retainImage ? pixels : 0,
          lastUsed: now
        };
        this.setResourceEntry(source, ready);
        this.trimRetainedResources();
        const stored = this.resources.get(source);
        return stored?.state === "ready" ? stored : ready;
      });
    this.setResourceEntry(source, { state: "loading", promise, lastUsed: this.now() });
    return promise;
  }

  private getResourceEntry(source: string) {
    const entry = this.resources.get(source);
    if (!entry) return undefined;
    if (entry.state === "missing" && entry.retryAfter <= this.now()) {
      this.resources.delete(source);
      return undefined;
    }
    this.resources.delete(source);
    entry.lastUsed = this.now();
    this.resources.set(source, entry);
    return entry;
  }

  private getResolutionEntry(key: string) {
    const entry = this.resolutions.get(key);
    if (!entry) return undefined;
    if (entry.state === "missing" && entry.retryAfter <= this.now()) {
      this.resolutions.delete(key);
      return undefined;
    }
    this.resolutions.delete(key);
    entry.lastUsed = this.now();
    this.resolutions.set(key, entry);
    return entry;
  }

  private presentResult(result: FaviconResolution | undefined): FaviconReadyResult | undefined {
    if (!result) return undefined;
    const resource = this.getResourceEntry(result.source);
    if (resource?.state === "ready" && resource.displaySource) {
      return { ...result, displaySource: resource.displaySource, previewSafe: true } satisfies FaviconReadyResult;
    }
    return result;
  }

  private setResourceEntry(source: string, entry: ResourceEntry) {
    const previous = this.resources.get(source);
    if (previous?.state === "ready" && previous.retained) {
      this.releaseRetainedResource(previous);
    }
    this.resources.delete(source);
    this.resources.set(source, entry);
    if (entry.state === "ready" && entry.retained) {
      this.retainedEntries += 1;
      this.retainedPixels += entry.retainedPixels;
    }
    this.trimMap(this.resources, this.maxResourceEntries, (removed) => {
      if (removed.state === "ready" && removed.retained) {
        this.releaseRetainedResource(removed);
      }
    });
  }

  private setResolutionEntry(key: string, entry: ResolutionEntry) {
    this.resolutions.delete(key);
    this.resolutions.set(key, entry);
    this.trimMap(this.resolutions, this.maxResolutionEntries);
  }

  private trimRetainedResources() {
    if (this.retainedEntries <= this.maxRetainedEntries && this.retainedPixels <= this.maxRetainedPixels) return;
    for (const [source, entry] of this.resources) {
      if (entry.state !== "ready" || !entry.retained) continue;
      this.releaseRetainedResource(entry);
      this.resources.set(source, {
        ...entry,
        displaySource: undefined,
        displayPixels: undefined,
        release: undefined,
        retained: undefined,
        retainedPixels: 0
      });
      if (this.retainedEntries <= this.maxRetainedEntries && this.retainedPixels <= this.maxRetainedPixels) break;
    }
  }

  private releaseRetainedResource(entry: ResourceReady) {
    if (!entry.retained) return;
    this.retainedEntries -= 1;
    this.retainedPixels -= entry.retainedPixels;
    entry.release?.();
  }

  private trimMap<T extends { state: string }>(map: Map<string, T>, maximum: number, onRemove?: (entry: T) => void) {
    while (map.size > maximum) {
      const removable = [...map].find(([, entry]) => entry.state !== "loading");
      if (!removable) return;
      map.delete(removable[0]);
      onRemove?.(removable[1]);
    }
  }
}

async function loadFaviconSource(source: string): Promise<LoadedFaviconResource | undefined> {
  if (typeof Image === "undefined") return undefined;
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (result: LoadedFaviconResource | undefined) => {
      if (settled) {
        result?.release?.();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeout = setTimeout(() => finish(undefined), DEFAULT_LOAD_TIMEOUT_MS);
    image.decoding = "async";
    image.onload = () => {
      const complete = async () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const shouldCreateThumbnail =
          isRemoteFaviconSource(source) &&
          (width > FAVICON_THUMBNAIL_TRIGGER_SIZE || height > FAVICON_THUMBNAIL_TRIGGER_SIZE) &&
          width * height <= MAX_THUMBNAIL_SOURCE_PIXELS;
        const thumbnailImage = shouldCreateThumbnail
          ? await loadCorsFaviconSource(source)
          : undefined;
        const thumbnail = thumbnailImage
          ? await createFaviconThumbnail(thumbnailImage)
          : undefined;
        finish({
          width,
          height,
          fingerprint: isBrowserFaviconSource(source) ? fingerprintImage(image) : undefined,
          displaySource: thumbnail?.source,
          displayPixels: thumbnail?.pixels,
          release: thumbnail?.release,
          retained: thumbnail ? undefined : image
        });
      };
      if (typeof image.decode === "function") {
        void image.decode().catch(() => undefined).then(complete);
      } else {
        void complete();
      }
    };
    image.onerror = () => finish(undefined);
    image.src = source;
  });
}

function loadCorsFaviconSource(source: string) {
  return new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeout = setTimeout(() => finish(undefined), THUMBNAIL_LOAD_TIMEOUT_MS);
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (typeof image.decode === "function") {
        void image.decode().catch(() => undefined).then(() => finish(image));
      } else {
        finish(image);
      }
    };
    image.onerror = () => finish(undefined);
    image.src = source;
  });
}

async function createFaviconThumbnail(image: HTMLImageElement) {
  if (typeof document === "undefined") return undefined;
  try {
    const scale = Math.min(1, FAVICON_THUMBNAIL_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const blob = typeof canvas.toBlob === "function"
      ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      : null;
    if (blob && typeof URL.createObjectURL === "function") {
      const source = URL.createObjectURL(blob);
      return {
        source,
        pixels: width * height,
        release: () => URL.revokeObjectURL(source)
      };
    }
    return {
      source: canvas.toDataURL("image/png"),
      pixels: width * height,
      release: undefined
    };
  } catch {
    return undefined;
  }
}

function isRemoteFaviconSource(source: string) {
  try {
    const protocol = new URL(source).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isBrowserFaviconSource(source: string) {
  try {
    const parsed = new URL(source);
    return parsed.pathname === "/_favicon/" && parsed.protocol.endsWith("-extension:");
  } catch {
    return false;
  }
}

function fingerprintImage(image: HTMLImageElement) {
  try {
    if (image.naturalWidth === 0 || image.naturalHeight === 0) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (const channel of pixels) {
      hash ^= channel;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  } catch {
    return undefined;
  }
}

const faviconCache = new FaviconCache();

export function peekReadyFavicon(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
  return faviconCache.peek(src, pageUrl, getUrl);
}

export function prepareFavicon(src: string | undefined, pageUrl: string | undefined, getUrl?: RuntimeGetUrl) {
  return faviconCache.prepare(src, pageUrl, getUrl);
}

export function prepareFavicons(items: Array<{ src?: string; url?: string }>, options?: PrepareFaviconsOptions) {
  return faviconCache.prepareMany(items, options);
}

export function invalidateFaviconSource(source: string) {
  faviconCache.invalidateSource(source);
}

export function invalidateFaviconDisplaySource(source: string) {
  faviconCache.invalidateDisplaySource(source);
}

export function getFaviconCacheRevision() {
  return faviconCache.getRevision();
}

export type { RuntimeGetUrl };
