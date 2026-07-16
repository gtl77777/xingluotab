import { FileText, Link2, Puzzle, Settings2, Square, Terminal } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  buildBrowserFaviconUrl,
  getFaviconCacheRevision,
  getFaviconSources,
  invalidateFaviconDisplaySource,
  invalidateFaviconSource,
  peekReadyFavicon,
  prepareFavicon,
  prepareFavicons,
  type PrepareFaviconsOptions,
  type RuntimeGetUrl
} from "./faviconCache";

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

const FAVICON_TONE_COUNT = 6;

export async function preloadFavicons(
  items: Array<{ src?: string; url?: string }>,
  options: number | PrepareFaviconsOptions = {}
) {
  return prepareFavicons(items, typeof options === "number" ? { timeoutMs: options } : options);
}

export { buildBrowserFaviconUrl, getFaviconCacheRevision, getFaviconSources };
export type { RuntimeGetUrl };

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
  const [readyState, setReadyState] = useState(() => ({
    signature: sourceSignature,
    result: peekReadyFavicon(src, url)
  }));
  const sourceGeneration = useRef(0);
  const ready = readyState.signature === sourceSignature
    ? readyState.result
    : peekReadyFavicon(src, url);

  useEffect(() => {
    sourceGeneration.current += 1;
    const generation = sourceGeneration.current;
    const cached = peekReadyFavicon(src, url);
    setReadyState({ signature: sourceSignature, result: cached });
    if (cached || sources.length === 0) return;
    let cancelled = false;
    void prepareFavicon(src, url).then((result) => {
      if (!cancelled && generation === sourceGeneration.current) {
        setReadyState({ signature: sourceSignature, result });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sourceSignature, sources, src, url]);

  const browserFaviconSource = buildBrowserFaviconUrl(url);
  const sourceIndex = ready ? Math.max(0, sources.indexOf(ready.source)) : 0;
  const displaySource = ready?.displaySource ?? ready?.source;
  const fallback = getFaviconFallback(url, title);

  return (
    <span
      className="relative flex h-full w-full items-center justify-center"
      data-favicon-browser-cache={browserFaviconSource ? "available" : undefined}
      data-favicon-source-index={sourceIndex}
    >
      <FaviconFallbackTile fallback={fallback} hidden={Boolean(ready)} />
      {ready && displaySource ? (
        <img
          key={displaySource}
          src={displaySource}
          alt=""
          title={title}
          draggable={false}
          className="absolute aspect-square h-[62.5%] w-[62.5%] max-h-5 max-w-5 rounded-[3px] object-contain"
          loading="eager"
          decoding="async"
          onError={() => {
            const failedSource = ready.source;
            if (ready.displaySource) {
              invalidateFaviconDisplaySource(failedSource);
            } else {
              invalidateFaviconSource(failedSource);
            }
            setReadyState({ signature: sourceSignature, result: undefined });
            const generation = sourceGeneration.current;
            void prepareFavicon(src, url).then((result) => {
              if (generation === sourceGeneration.current) {
                setReadyState({ signature: sourceSignature, result });
              }
            });
          }}
        />
      ) : null}
    </span>
  );
}

export const FaviconPreview = memo(function FaviconPreview({
  src,
  title,
  url,
  showWarmIcon = false,
  cacheRevision = 0
}: FaviconProps & { showWarmIcon?: boolean; cacheRevision?: number }) {
  const fallback = useMemo(() => getFaviconFallback(url, title), [title, url]);
  const ready = showWarmIcon ? peekReadyFavicon(src, url) : undefined;
  return (
    <span
      className="relative flex h-full w-full items-center justify-center"
      data-favicon-preview="true"
      data-favicon-preview-source={ready?.previewSafe ? "warm" : "fallback"}
      data-favicon-cache-revision={cacheRevision}
    >
      <FaviconFallbackTile fallback={fallback} hidden={Boolean(ready?.previewSafe)} />
      {ready?.previewSafe ? (
        <img
          src={ready.displaySource ?? ready.source}
          alt=""
          title={title}
          draggable={false}
          loading="eager"
          decoding="async"
          data-favicon-warm-preview="true"
          className="absolute aspect-square h-[62.5%] w-[62.5%] max-h-5 max-w-5 rounded-[3px] object-contain"
          onError={(event) => {
            if (ready.displaySource) {
              invalidateFaviconDisplaySource(ready.source);
            } else {
              invalidateFaviconSource(ready.source);
            }
            event.currentTarget.hidden = true;
            const fallbackElement = event.currentTarget.previousElementSibling;
            fallbackElement?.classList.remove("opacity-0");
            fallbackElement?.classList.add("opacity-100");
          }}
        />
      ) : null}
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
