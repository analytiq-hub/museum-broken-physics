// The "★ 128 · Source on GitHub" line on the title, welcome-back and pause cards.
// The star count is baked in at build time (CI passes it to Vite) and refreshed from
// GitHub's API on load, cached in the browser for an hour (the unauthenticated API
// allows 60 requests an hour per network). Any failure keeps the number we have.
// Pure apart from the fetch and storage it is handed, so it is unit-tested.

export const REPO_URL = "https://github.com/analytiq-hub/museum-broken-physics";
export const REPO_API = "https://api.github.com/repos/analytiq-hub/museum-broken-physics";
/** Below this many stars the line shows no number. */
export const STAR_THRESHOLD = 10;
export const CACHE_KEY = "museum-broken-physics:stars";
export const CACHE_MS = 60 * 60 * 1000;

/** The link's text for a star count (no number below the threshold). */
export function repoText(stars: number): string {
  return stars >= STAR_THRESHOLD ? `★ ${stars.toLocaleString("en-US")} · Source on GitHub` : "Source on GitHub";
}

/** The link itself, for a card. */
export function repoLinkHtml(stars: number): string {
  return `<a class="repo-link" href="${REPO_URL}" target="_blank" rel="noopener">${repoText(stars)}</a>`;
}

interface Cached {
  stars: number;
  at: number;
}

/** A star count cached within the last hour, or null. Storage may be missing or throw (private windows). */
export function cachedStars(storage: Pick<Storage, "getItem"> | undefined, now: number): number | null {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Cached;
    return typeof cached.stars === "number" && now - cached.at < CACHE_MS ? cached.stars : null;
  } catch {
    return null;
  }
}

/**
 * The current star count: from the cache if it's fresh, else from GitHub's API (caching
 * it). Resolves to null if neither works.
 */
export async function fetchStars(fetchFn: typeof fetch, storage: Pick<Storage, "getItem" | "setItem"> | undefined, now: number): Promise<number | null> {
  const cached = cachedStars(storage, now);
  if (cached !== null) return cached;
  try {
    const response = await fetchFn(REPO_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) return null;
    const stars = ((await response.json()) as { stargazers_count?: unknown }).stargazers_count;
    if (typeof stars !== "number") return null;
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify({ stars, at: now } satisfies Cached));
    } catch {
      // No storage: fetch again next time.
    }
    return stars;
  } catch {
    return null;
  }
}
