import { describe, expect, it } from "vitest";
import { buildBrowserFaviconUrl, getFaviconFallback, getFaviconSources } from "../../../src/components/ui/Favicon";

const getExtensionUrl = (path: string) => `chrome-extension://xingluotab-test${path}`;

describe("favicon", () => {
  it("builds the Chromium cached favicon URL for web pages", () => {
    const result = buildBrowserFaviconUrl("https://www.example.com/path?q=1", 32, getExtensionUrl);
    const parsed = new URL(result!);

    expect(parsed.origin).toBe("null");
    expect(parsed.pathname).toBe("/_favicon/");
    expect(parsed.searchParams.get("pageUrl")).toBe("https://www.example.com/path?q=1");
    expect(parsed.searchParams.get("size")).toBe("32");
    expect(parsed.searchParams.get("forceEmptyDefaultFavicon")).toBe("1");
    expect(parsed.searchParams.get("forceLightMode")).toBe("1");
  });

  it("only asks Chromium for HTTP or HTTPS favicons", () => {
    expect(buildBrowserFaviconUrl("about:blank", 32, getExtensionUrl)).toBeUndefined();
    expect(buildBrowserFaviconUrl("file:///tmp/test.html", 32, getExtensionUrl)).toBeUndefined();
    expect(buildBrowserFaviconUrl("not a url", 32, getExtensionUrl)).toBeUndefined();
  });

  it("tries the stored icon before Chromium's cache", () => {
    expect(getFaviconSources("https://cdn.example/icon.png", "https://example.com", getExtensionUrl)).toEqual([
      "https://cdn.example/icon.png",
      "chrome-extension://xingluotab-test/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2F&size=32&forceEmptyDefaultFavicon=1&forceLightMode=1"
    ]);
  });

  it("uses a stable domain initial and tone", () => {
    const first = getFaviconFallback("https://www.example.com/docs", "Example docs");
    const second = getFaviconFallback("https://www.example.com/other", "Another title");

    expect(first).toEqual(second);
    expect(first.kind).toBe("initial");
    expect(first.initial).toBe("E");
    expect(first.tone).toBeGreaterThanOrEqual(0);
    expect(first.tone).toBeLessThan(6);
  });

  it("uses recognisable fallbacks for special pages", () => {
    expect(getFaviconFallback("about:blank", "New tab").kind).toBe("blank");
    expect(getFaviconFallback("edge://settings", "Settings").kind).toBe("browser");
    expect(getFaviconFallback("file:///tmp/test.html", "Local file").kind).toBe("file");
    expect(getFaviconFallback("chrome-extension://abc/options.html", "Extension").kind).toBe("extension");
    expect(getFaviconFallback("http://localhost:3000", "Dev server").kind).toBe("local");
    expect(getFaviconFallback("mailto:user@example.com", "Email").kind).toBe("link");
  });
});
