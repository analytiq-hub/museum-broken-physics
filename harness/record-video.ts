// `node harness/record-video.ts`: records a short clip of Young's Double Slit for sharing.
// Drives the real build in headless Chrome, steps the game a fixed amount per video frame
// (so the clip is smooth however slow the machine is), clicks the instrument's real buttons
// with a drawn cursor, and encodes the frames with ffmpeg to harness/out/video/double-slit.mp4.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";

const OUT = "harness/out/video";
const FRAMES = `${OUT}/frames`;
const FPS = 30;
const STEPS_PER_FRAME = 60 / FPS;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

let frame = 0;
let cursor = { x: 640, y: 560 };

/** Steps the game one video frame, moves the drawn cursor, and saves a screenshot. */
async function shoot(page: Page, pressed = false): Promise<void> {
  await page.evaluate(
    async ({ steps, x, y, down }) => {
      const el = document.getElementById("video-cursor")!;
      el.style.transform = `translate(${x}px, ${y}px) scale(${down ? 0.85 : 1})`;
      window.__game!.step(steps);
      await window.__game!.nextFrame();
    },
    { steps: STEPS_PER_FRAME, x: cursor.x, y: cursor.y, down: pressed },
  );
  await page.screenshot({ path: `${FRAMES}/${String(frame++).padStart(4, "0")}.png` });
}

async function hold(page: Page, seconds: number): Promise<void> {
  for (let i = 0; i < seconds * FPS; i++) await shoot(page);
}

/** Glides the cursor to a button, presses it for real, and lets go. */
async function click(page: Page, label: string): Promise<void> {
  const box = await page.getByRole("button", { name: label, exact: true }).boundingBox();
  if (!box) throw new Error(`no button "${label}"`);
  const from = { ...cursor };
  const to = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.55 };
  const n = Math.round(0.7 * FPS);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
    cursor = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
    await page.mouse.move(cursor.x, cursor.y);
    await shoot(page);
  }
  await hold(page, 0.2);
  await page.mouse.click(cursor.x, cursor.y);
  for (let i = 0; i < 4; i++) await shoot(page, true);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`${url}?automation&paused`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 30_000 });
  await page.evaluate(async () => {
    await window.__game!.setCamera("double-slit-screen");
    const el = document.createElement("div");
    el.id = "video-cursor";
    el.style.cssText = "position:fixed;left:0;top:0;z-index:99999;pointer-events:none;transform-origin:0 0;";
    el.innerHTML =
      '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M1 1 L1 24 L7 18.5 L11 28 L15 26.3 L11 17 L19 17 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(el);
  });

  await hold(page, 2);
  await click(page, "Sodium yellow (589 nm)");
  await hold(page, 2.2);
  await click(page, "Water (1.33)");
  await hold(page, 4);

  const state = await page.evaluate(() => window.__game!.getState());
  console.log(`${frame} frames; double-slit ${state.solved ? "solved" : "NOT solved"}`);

  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${FRAMES}/%04d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", `${OUT}/double-slit.mp4`],
    { stdio: "inherit" },
  );
  console.log(`${OUT}/double-slit.mp4`);
} finally {
  await browser.close();
  await server.close();
}
