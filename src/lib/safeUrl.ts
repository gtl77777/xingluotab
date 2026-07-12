const BLOCKED_NAVIGATION_SCHEMES = ["javascript:", "data:", "vbscript:"];

export function isSafeNavigationUrl(value: string) {
  const normalizedPrefix = value
    .trim()
    .slice(0, 64)
    .replace(/[\u0000-\u0020]/g, "")
    .toLocaleLowerCase();

  return normalizedPrefix.length > 0 && !BLOCKED_NAVIGATION_SCHEMES.some((scheme) => normalizedPrefix.startsWith(scheme));
}

export function assertSafeNavigationUrl(value: string) {
  if (!isSafeNavigationUrl(value)) throw new Error("Unsafe navigation URL");
  return value;
}
