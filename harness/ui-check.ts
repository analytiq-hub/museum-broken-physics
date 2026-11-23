// `npm run ui-check`: end-to-end check of the first-person UI in headless
// Chrome with a real pointer lock: click to enter, hold Q to raise the
// instrument, steer its cursor with mouse movement, click a law, release Q.
// Throws (non-zero exit) on the first failed expectation.
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

let failures = 0;
function expect(what: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
}
const q = <T>(page: Page, fn: () => T) => page.evaluate(fn);
/**
 * Waits (up to 10 s) for a condition in the page. UI state updates on the next
 * rendered frame, and frames are slow on CI's software renderer, so never sleep
 * a fixed time and then look.
 */
const eventually = (page: Page, fn: () => boolean, timeout = 10_000) =>
  page.waitForFunction(fn, undefined, { timeout, polling: 50 }).then(
    () => true,
    () => false,
  );
const move = (page: Page, dx: number, dy: number) =>
  page.evaluate(([x, y]) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y })), [dx, dy]);

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on("pageerror", (e) => expect("no page errors", false, e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60_000 });

  expect("click-to-play overlay shows", await q(page, () => !document.querySelector(".overlay")!.classList.contains("hidden")));
  await page.mouse.click(600, 400);
  expect("clicking locks the pointer", await eventually(page, () => document.pointerLockElement !== null));
  expect("overlay hides", await eventually(page, () => document.querySelector(".overlay")!.classList.contains("hidden")));

  await page.keyboard.down("q");
  expect("holding Q raises the instrument", await eventually(page, () => !document.querySelector(".instrument")!.classList.contains("hidden")));
  expect("instrument cursor shows", await eventually(page, () => !document.querySelector(".instrument-cursor")!.classList.contains("hidden")));
  expect("crosshair hides", await eventually(page, () => document.querySelector(".crosshair")!.classList.contains("hidden")));
  expect(
    "instrument says gravity is broken",
    await q(page, () => document.querySelector(".inst-expl")!.textContent!.includes("Here it pulls toward the right wall")),
  );

  // Steer the cursor from the instrument's centre onto "Back wall".
  const [from, to] = await q(page, () => {
    // Must live inside the callback: page.evaluate serializes it to run in the browser.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const target = [...document.querySelectorAll(".instrument button")].find((b) => b.textContent!.includes("Back wall"))!;
    return [centre(document.querySelector(".instrument")!), centre(target)];
  });
  const yawBefore = await q(page, () => window.__game!.getPlayer().yaw);
  await move(page, to.x - from.x, to.y - from.y);
  expect("cursor hovers Back wall", (await q(page, () => document.querySelector(".vhover")?.textContent ?? "")).includes("Back wall"));
  expect("the view doesn't turn while the instrument is up", (await q(page, () => window.__game!.getPlayer().yaw)) === yawBefore);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent("mousedown")));
  expect("clicking sets gravity to the back wall", await eventually(page, () => window.__game!.getState().rules.gravity === "north"));
  expect("one change is spent", (await q(page, () => window.__game!.getState().changesUsed)) === 1);

  await page.keyboard.up("q");
  expect("releasing Q puts the instrument away", await eventually(page, () => document.querySelector(".instrument")!.classList.contains("hidden")));
  expect("pointer stays locked", await q(page, () => document.pointerLockElement !== null));
  await move(page, 80, 0);
  expect("the view turns again", (await q(page, () => window.__game!.getPlayer().yaw)) !== yawBefore);

  // Walk down the corridor into Gallery II, reset it, and walk back: Gallery I keeps its state.
  await page.evaluate(() => window.__game!.setPlayer({ x: -9, z: 2 }, Math.PI / 2, 0));
  await page.keyboard.down("w");
  const WALK = 45_000; // walking runs slower than real time on CI's software renderer
  const arrived = await eventually(page, () => window.__game!.getPlayer().gallery === "pendulum", WALK);
  await page.keyboard.up("w");
  expect("walking west hands the player to Gallery II", arrived);
  expect("Gallery II's laws are on the instrument", await eventually(page, () => window.__game!.getState().exhibit === "pendulum"));
  await page.keyboard.press("r");
  expect("R resets Gallery II", await eventually(page, () => window.__game!.getState().step < 30));
  await page.evaluate(() => window.__game!.setLook(-Math.PI / 2, 0));
  await page.keyboard.down("w");
  const back = await eventually(page, () => window.__game!.getPlayer().gallery === "sideways-gravity", WALK);
  await page.keyboard.up("w");
  expect("walking east hands the player back to Gallery I", back);
  expect("Gallery I kept its state (gravity still toward the back wall)", (await q(page, () => window.__game!.getState().rules.gravity)) === "north");

  // The second corridor: from beyond Gallery II's west door into Gallery III.
  await page.evaluate(() => window.__game!.setPlayer({ x: -27.5, z: 2 }, Math.PI / 2, 0));
  expect("the second corridor belongs to Gallery II's world", (await q(page, () => window.__game!.getPlayer().gallery)) === "pendulum");
  await page.keyboard.down("w");
  const third = await eventually(page, () => window.__game!.getPlayer().gallery === "leaning-pendulum", WALK);
  await page.keyboard.up("w");
  expect("walking west hands the player to Gallery III", third);
  expect(
    "Gallery III's instrument lists both broken laws",
    await eventually(page, () => {
      const s = window.__game!.getState();
      return s.exhibit === "leaning-pendulum" && s.rules.gravity === "north" && (s.rules.damping as number) < 0;
    }),
  );

  // Gallery IV: walk in through the third corridor, aim at a mirror, click it.
  await page.evaluate(() => window.__game!.setPlayer({ x: -46.5, z: 2 }, Math.PI / 2, 0));
  await page.keyboard.down("w");
  const fourth = await eventually(page, () => window.__game!.getPlayer().gallery === "optics", WALK);
  await page.keyboard.up("w");
  expect("walking west hands the player to Gallery IV", fourth);
  await page.evaluate(async () => {
    window.__game!.setPlayer({ x: -58.6, z: 3.6 }, 0, 0);
    await window.__game!.nextFrame(); // the camera follows the player on the next frame
    window.__game!.lookAtButton("mirror-b");
  });
  expect("the crosshair finds the floor mirror", await eventually(page, () => window.__game!.getPlayer().hovered === "mirror-b"));
  await page.mouse.click(600, 400);
  expect(
    "clicking turns the mirror a notch, for free",
    await eventually(page, () => {
      const s = window.__game!.getState();
      return s.rules["mirror-b"] === 15 && s.changesUsed === 0;
    }),
  );
  expect(
    "the instrument shows only the index law (no mirror rows)",
    await q(page, () => document.querySelectorAll(".inst-rule").length === 0 || [...document.querySelectorAll(".inst-rule b")].every((b) => !b.textContent!.includes("Mirror"))),
  );
} finally {
  await browser.close();
  await server.close();
}
if (failures) {
  console.error(`${failures} UI check(s) failed`);
  process.exit(1);
}
