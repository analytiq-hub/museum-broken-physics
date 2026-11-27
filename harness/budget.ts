// Download budgets, checked after every `npm run build` (and so in CI): the
// museum should grow to dozens of rooms without a longer first load.
//
// - First load: the entry chunk, everything it imports statically, its CSS, and
//   the first two rooms (built at startup), gzipped.
// - Each room's own chunk, gzipped (shared code isn't counted twice).
// - Shared assets (textures, HDRI) in public/assets, as files: already compressed.
//
// Reads Vite's manifest (dist/.vite/manifest.json). Exits non-zero over budget.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const BUDGET = {
  firstLoadJs: 2300 * KB,
  roomChunk: 150 * KB,
  sharedAssets: 8 * KB * KB,
};
/** The rooms built at startup (src/galleries/rooms.ts: the first and its neighbour). */
const STARTUP_ROOMS = ["sidewaysGallery", "pendulumGallery"];

interface Chunk {
  file: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}
const manifest = JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8")) as Record<string, Chunk>;
const gz = (file: string) => gzipSync(readFileSync(join("dist", file))).length;

/** A chunk and everything it imports statically. */
function closure(key: string, seen = new Set<string>()): Set<string> {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dep of manifest[key].imports ?? []) closure(dep, seen);
  return seen;
}

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry)!;
const first = closure(entryKey);
const roomKeys = Object.keys(manifest).filter((k) => /src\/galleries\/\w+Gallery\.ts$/.test(k));
for (const key of roomKeys) if (STARTUP_ROOMS.some((name) => key.includes(name))) closure(key, first);
const files = new Set<string>();
for (const key of first) {
  files.add(manifest[key].file);
  for (const css of manifest[key].css ?? []) files.add(css);
}
const firstLoad = [...files].reduce((sum, f) => sum + gz(f), 0);

let failed = false;
const report = (what: string, size: number, budget: number) => {
  const ok = size <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "OVER"} ${what}: ${(size / KB).toFixed(0)} KB (budget ${(budget / KB).toFixed(0)} KB)`);
};

report("first load, JS + CSS gzipped", firstLoad, BUDGET.firstLoadJs);
for (const key of roomKeys) {
  // A room's own code: its chunk and the chunks only it needs (not already in the first load).
  const own = [...closure(key)].filter((k) => !first.has(k) || k === key);
  const size = own.reduce((sum, k) => sum + gz(manifest[k].file), 0);
  report(`room ${key.replace(/^.*\//, "").replace(/\.ts$/, "")}, gzipped`, size, BUDGET.roomChunk);
}
const assetBytes = (dir: string): number =>
  readdirSync(dir).reduce((sum, f) => {
    const p = join(dir, f);
    return sum + (statSync(p).isDirectory() ? assetBytes(p) : statSync(p).size);
  }, 0);
report("shared assets (public/assets)", assetBytes("public/assets"), BUDGET.sharedAssets);

if (failed) {
  console.error("Over budget. See docs/plan.md (Milestone 9) before raising a budget.");
  process.exit(1);
}
