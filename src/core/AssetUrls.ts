export type AssetManifest = Record<string, string>;

function safeDecodeAssetSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function assertSafeAssetSegment(segment: string): string {
  const decodedSegment = safeDecodeAssetSegment(segment);
  if (
    segment === "." ||
    segment === ".." ||
    decodedSegment === "." ||
    decodedSegment === ".."
  ) {
    throw new Error(`Invalid asset path segment: ${segment}`);
  }
  return decodedSegment;
}

export function encodeAssetPath(path: string): string {
  return normalizeAssetPath(path)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function normalizeAssetPath(path: string): string {
  const normalizedPath = path
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => assertSafeAssetSegment(segment))
    .join("/");

  if (normalizedPath.length === 0) {
    throw new Error("Asset path must not be empty");
  }

  return normalizedPath;
}

function isAbsoluteUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

export function buildAssetUrl(
  path: string,
  assetManifest: AssetManifest = {},
  baseUrl: string = "",
): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  const normalizedPath = normalizeAssetPath(path);

  const directUrl = assetManifest[normalizedPath];
  if (directUrl) {
    return baseUrl ? `${baseUrl.replace(/\/+$/, "")}${directUrl}` : directUrl;
  }

  return `/${encodeAssetPath(normalizedPath)}`;
}

declare global {
  var __ASSET_MANIFEST__: AssetManifest | undefined;
  var __CDN_BASE__: string | undefined;
}

export function getAssetManifest(): AssetManifest {
  if (
    typeof window !== "undefined" &&
    window.BOOTSTRAP_CONFIG?.assetManifest !== undefined
  ) {
    return window.BOOTSTRAP_CONFIG.assetManifest;
  }
  return globalThis.__ASSET_MANIFEST__ ?? {};
}

// Web workers have no `window`, so they read `__CDN_BASE__` off globalThis,
// which Worker.worker.ts sets from the init message before any asset fetches.
// Without this fallback, asset fetches inside workers (e.g. map binaries)
// would silently bypass the CDN.
export function getCdnBase(): string {
  if (
    typeof window !== "undefined" &&
    window.BOOTSTRAP_CONFIG?.cdnBase !== undefined
  ) {
    return window.BOOTSTRAP_CONFIG.cdnBase;
  }
  const workerCdnBase = globalThis.__CDN_BASE__;
  if (workerCdnBase) {
    return workerCdnBase;
  }
  // No CDN configured at all (a self-hosted deployment with CDN_BASE unset)
  // and we're not on the main thread - buildAssetUrl() would otherwise
  // return a bare root-relative path ("/_assets/..."), which relies on the
  // worker's own self.location as an implicit fetch() base. That base isn't
  // always usable for resolving a relative path (e.g. when the worker
  // script itself was loaded via a blob: URL, which some bundlers do for
  // module workers), so relative fetches inside the worker can throw
  // "Failed to parse URL" instead of just working. Falling back to the
  // worker's own origin makes every worker-side asset fetch an explicit
  // absolute URL instead, sidestepping that resolution entirely. Guarded so
  // this never runs server-side, where neither `self` nor `location` exist.
  if (typeof self !== "undefined" && typeof location !== "undefined") {
    return self.location.origin;
  }
  return "";
}

export function assetUrl(path: string): string {
  return buildAssetUrl(path, getAssetManifest(), getCdnBase());
}

// Rewrites Vite's emitted /assets/... references in the built index.html to
// use the cdnBaseRaw EJS placeholder, so RenderHtml.ts can prefix them with
// CDN_BASE at request time. Scoped to src=/href= attribute values so inline
// scripts containing the literal "/assets/..." can't be mangled. Does NOT
// match /_assets/ (underscore) — source-asset manifest URLs are prefixed via
// buildAssetUrl, not this rewrite. Falls back to "" when cdnBaseRaw is missing
// so a future renderer that forgets to provide it still produces working
// same-origin URLs.
export function rewriteAssetsForCdn(html: string): string {
  return html.replace(
    /(\s(?:src|href)=)(["'])\/assets\//g,
    `$1$2<%- locals.cdnBaseRaw || "" %>/assets/`,
  );
}
