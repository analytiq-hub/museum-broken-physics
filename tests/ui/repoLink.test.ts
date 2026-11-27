import { describe, expect, it, vi } from "vitest";
import { CACHE_KEY, CACHE_MS, REPO_URL, cachedStars, fetchStars, repoLinkHtml, repoText } from "../../src/ui/repoLink";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}
const ok = (body: unknown) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("repo link", () => {
  it("shows the count from 10 stars, with thousands separators; below that, just the link", () => {
    expect(repoText(0)).toBe("Source on GitHub");
    expect(repoText(9)).toBe("Source on GitHub");
    expect(repoText(10)).toBe("★ 10 · Source on GitHub");
    expect(repoText(1234)).toBe("★ 1,234 · Source on GitHub");
  });

  it("links to the repo in a new tab", () => {
    expect(repoLinkHtml(50)).toBe(`<a class="repo-link" href="${REPO_URL}" target="_blank" rel="noopener">★ 50 · Source on GitHub</a>`);
  });

  it("fetches the count and caches it for an hour", async () => {
    const storage = memoryStorage();
    const fetchFn = ok({ stargazers_count: 42 });
    expect(await fetchStars(fetchFn, storage, 1000)).toBe(42);
    expect(JSON.parse(storage.data[CACHE_KEY])).toEqual({ stars: 42, at: 1000 });
    // Within the hour: from the cache, no request.
    expect(await fetchStars(fetchFn, storage, 1000 + CACHE_MS - 1)).toBe(42);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // After it: fetched again.
    await fetchStars(fetchFn, storage, 1000 + CACHE_MS);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("any failure gives null (the card keeps the built-in count)", async () => {
    const storage = memoryStorage();
    const failing = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchStars(failing, storage, 0)).toBeNull();
    const limited = vi.fn<typeof fetch>(async () => new Response("rate limited", { status: 403 })) as unknown as typeof fetch;
    expect(await fetchStars(limited, storage, 0)).toBeNull();
    expect(await fetchStars(ok({ message: "Not Found" }), storage, 0)).toBeNull();
    expect(storage.data[CACHE_KEY]).toBeUndefined();
  });

  it("copes with no storage, storage that throws, and a corrupt cache", async () => {
    expect(await fetchStars(ok({ stargazers_count: 7 }), undefined, 0)).toBe(7);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(await fetchStars(ok({ stargazers_count: 8 }), throwing, 0)).toBe(8);
    expect(cachedStars(memoryStorage({ [CACHE_KEY]: "{not json" }), 0)).toBeNull();
  });
});
