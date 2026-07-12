import { FileText, Link2, Puzzle, Settings2, Square, Terminal } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

type FaviconProps = {
  src?: string;
  title: string;
  url?: string;
};

export type FaviconFallback = {
  kind: "initial" | "blank" | "browser" | "file" | "extension" | "local" | "link";
  initial?: string;
  tone: number;
};

type RuntimeGetUrl = (path: string) => string;

const FAVICON_TONE_COUNT = 6;
const DEFAULT_FAVICON_SENTINEL_URL = "https://xingluotab-favicon.invalid/";
let defaultBrowserFaviconFingerprint: Promise<number | undefined> | undefined;
const browserFaviconDefaultState = new Map<string, Promise<boolean>>();
const faviconPreloadCache = new Map<string, Promise<void>>();

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

export async function preloadFavicons(
  items: Array<{ src?: string; url?: string }>,
  timeoutMs = 180
) {
  if (typeof Image === "undefined") return;
  const sources = [...new Set(items.flatMap((item) => getFaviconSources(item.src, item.url)))];
  if (sources.length === 0) return;

  let cursor = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      const source = sources[cursor++];
      if (source) await preloadFaviconSource(source);
    }
  };
  const preload = Promise.all(Array.from({ length: Math.min(8, sources.length) }, () => worker()));
  await Promise.race([
    preload,
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, timeoutMs))
  ]);
}

function preloadFaviconSource(source: string) {
  const cached = faviconPreloadCache.get(source);
  if (cached) return cached;
  const result = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = source;
  });
  if (faviconPreloadCache.size >= 4096) {
    const oldest = faviconPreloadCache.keys().next().value;
    if (oldest) faviconPreloadCache.delete(oldest);
  }
  faviconPreloadCache.set(source, result);
  return result;
}

export function getFaviconFallback(pageUrl: string | undefined, title: string): FaviconFallback {
  try {
    const parsed = new URL(pageUrl ?? "");
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "about:") return { kind: "blank", tone: 0 };
    if (protocol === "edge:" || protocol === "chrome:") return { kind: "browser", tone: 0 };
    if (protocol === "file:") return { kind: "file", tone: 3 };
    if (["chrome-extension:", "edge-extension:", "moz-extension:"].includes(protocol)) {
      return { kind: "extension", tone: 1 };
    }
    if (protocol === "http:" || protocol === "https:") {
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "localhost" || isIpAddress(hostname)) return { kind: "local", tone: 2 };
      const displayHostname = hostname.replace(/^www\./, "");
      return {
        kind: "initial",
        initial: firstDisplayCharacter(displayHostname) ?? firstDisplayCharacter(title) ?? "?",
        tone: stableHash(hostname) % FAVICON_TONE_COUNT
      };
    }
  } catch {
    // Fall through to the generic link treatment.
  }
  return { kind: "link", tone: stableHash(pageUrl || title) % FAVICON_TONE_COUNT };
}

export function Favicon({ src, title, url }: FaviconProps) {
  const sources = useMemo(() => getFaviconSources(src, url), [src, url]);
  const sourceSignature = sources.join("\n");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadedSource, setLoadedSource] = useState<string>();
  const sourceGeneration = useRef(0);

  useEffect(() => {
    sourceGeneration.current += 1;
    setSourceIndex(0);
    setLoadedSource(undefined);
  }, [sourceSignature]);

  const activeSource = sources[sourceIndex];
  const browserFaviconSource = buildBrowserFaviconUrl(url);
  const loaded = Boolean(activeSource && loadedSource === activeSource);
  const fallback = getFaviconFallback(url, title);

  return (
    <span
      className="relative flex h-full w-full items-center justify-center"
      data-favicon-browser-cache={browserFaviconSource ? "available" : undefined}
      data-favicon-source-index={sourceIndex}
    >
      <FaviconFallbackTile fallback={fallback} hidden={loaded} />
      {activeSource ? (
        <img
          key={activeSource}
          src={activeSource}
          alt=""
          title={title}
          draggable={false}
          className={[
            "absolute aspect-square h-[62.5%] w-[62.5%] max-h-5 max-w-5 rounded-[3px] object-contain transition-opacity duration-150",
            loaded ? "opacity-100" : "opacity-0"
          ].join(" ")}
          onLoad={(event) => {
            if (activeSource !== browserFaviconSource) {
              setLoadedSource(activeSource);
              return;
            }

            const generation = sourceGeneration.current;
            void isDefaultBrowserFavicon(activeSource, event.currentTarget).then((isDefault) => {
              if (generation !== sourceGeneration.current) return;
              if (isDefault) {
                setLoadedSource(undefined);
                setSourceIndex((current) => current + 1);
                return;
              }
              setLoadedSource(activeSource);
            });
          }}
          loading="lazy"
          decoding="async"
          onError={() => {
            setLoadedSource(undefined);
            setSourceIndex((current) => current + 1);
          }}
        />
      ) : null}
    </span>
  );
}

export const FaviconPreview = memo(function FaviconPreview({ title, url }: Pick<FaviconProps, "title" | "url">) {
  const fallback = useMemo(() => getFaviconFallback(url, title), [title, url]);
  return (
    <span
      className="relative flex h-full w-full items-center justify-center"
      data-favicon-preview="true"
    >
      <FaviconFallbackTile fallback={fallback} hidden={false} />
    </span>
  );
});

function FaviconFallbackTile({ fallback, hidden }: { fallback: FaviconFallback; hidden: boolean }) {
  const iconClassName = "h-1/2 w-1/2 stroke-[1.8]";
  return (
    <span
      aria-hidden="true"
      data-favicon-fallback={fallback.kind}
      className={[
        `favicon-fallback favicon-fallback-tone-${fallback.tone}`,
        hidden ? "opacity-0" : "opacity-100"
      ].join(" ")}
    >
      {fallback.kind === "initial" ? <span>{fallback.initial}</span> : null}
      {fallback.kind === "blank" ? <Square className={iconClassName} /> : null}
      {fallback.kind === "browser" ? <Settings2 className={iconClassName} /> : null}
      {fallback.kind === "file" ? <FileText className={iconClassName} /> : null}
      {fallback.kind === "extension" ? <Puzzle className={iconClassName} /> : null}
      {fallback.kind === "local" ? <Terminal className={iconClassName} /> : null}
      {fallback.kind === "link" ? <Link2 className={iconClassName} /> : null}
    </span>
  );
}

function firstDisplayCharacter(value: string) {
  const character = Array.from(value.trim()).find((item) => /[\p{L}\p{N}]/u.test(item));
  return character?.toLocaleUpperCase();
}

function isIpAddress(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDefaultBrowserFaviconFingerprint() {
  if (!defaultBrowserFaviconFingerprint) {
    const source = buildBrowserFaviconUrl(DEFAULT_FAVICON_SENTINEL_URL);
    defaultBrowserFaviconFingerprint = source
      ? loadImageFingerprint(source)
      : Promise.resolve(undefined);
  }
  return defaultBrowserFaviconFingerprint;
}

function isDefaultBrowserFavicon(source: string, image: HTMLImageElement) {
  const cached = browserFaviconDefaultState.get(source);
  if (cached) return cached;

  const result = Promise.all([fingerprintImageWhenIdle(image), getDefaultBrowserFaviconFingerprint()]).then(
    ([fingerprint, defaultFingerprint]) => fingerprint !== undefined && fingerprint === defaultFingerprint
  );
  if (browserFaviconDefaultState.size >= 2048) {
    const oldest = browserFaviconDefaultState.keys().next().value;
    if (oldest) browserFaviconDefaultState.delete(oldest);
  }
  browserFaviconDefaultState.set(source, result);
  return result;
}

function fingerprintImageWhenIdle(image: HTMLImageElement) {
  return new Promise<number | undefined>((resolve) => {
    const run = () => resolve(fingerprintImage(image));
    const requestIdle = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (callback: () => void) => number;
      }
    ).requestIdleCallback;
    if (requestIdle) {
      requestIdle(run);
      return;
    }
    setTimeout(run, 500);
  });
}

function loadImageFingerprint(source: string) {
  return new Promise<number | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(fingerprintImage(image));
    image.onerror = () => resolve(undefined);
    image.src = source;
  });
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
