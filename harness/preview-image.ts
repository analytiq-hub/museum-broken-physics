// `node harness/preview-image.ts`: renders link-preview (Open Graph) candidates
// at 1200×630 from the real build, HUD hidden, with the title laid over, into
// harness/out/preview/. Copy the chosen one to public/og-image.jpg.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const OUT = "harness/out/preview";
const S = 60;
const SHOTS: { name: string; setup: string }[] = [
  { name: "window", setup: `await g.setCamera("window");` },
  { name: "overview", setup: `await g.setCamera("overview"); g.setRule("gravity","north"); g.settle();` },
  { name: "optics", setup: `await g.setCamera("optics"); g.setRule("index",1.5); g.setRule("mirror-b",120); g.step(${2 * S});` },
  { name: "leaning", setup: `await g.setCamera("leaning"); g.step(${10.6 * S});` },
  { name: "pendulum", setup: `await g.setCamera("pendulum"); g.step(${24 * S});` },
];

mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const shot of SHOTS) {
    await page.goto(`${url}?automation&paused`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60_000 });
    await page.evaluate(`(async () => { const g = window.__game; ${shot.setup} await g.nextFrame(); })()`);
    await page.addStyleTag({ content: ".hud,.instrument,.crosshair,.instrument-cursor{display:none!important}" });
    await page.evaluate(() => {
      const t = document.createElement("div");
      t.style.cssText =
        "position:fixed;left:48px;bottom:44px;color:#fff4dc;font:700 54px Georgia,serif;text-shadow:0 2px 18px rgba(0,0,0,.85)";
      t.innerHTML = `The Museum of Broken Physics<div style="font:italic 26px Georgia,serif;color:#e9c46a;margin-top:8px">Gravity, energy and light have broken. Put them right.</div>`;
      document.body.appendChild(t);
    });
    await page.evaluate(() => window.__game!.nextFrame());
    const file = `${OUT}/${shot.name}.jpg`;
    await page.screenshot({ path: file, type: "jpeg", quality: 82 });
    console.log(file);
  }
} finally {
  await browser.close();
  await server.close();
}
