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
    "instrument says where gravity pulls here",
    await q(page, () => document.querySelector(".inst-expl")!.textContent!.includes("Gravity pulls toward the right wall here")),
  );
  expect(
    "…but not what the law should be (not yet discovered)",
    await q(page, () => {
      const text = document.querySelector(".instrument")!.textContent!;
      return text.includes("Law unknown") && !text.includes("The law") && !text.includes("Restore") && !document.querySelector(".instrument .nominal");
    }),
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

  // Esc releases the pointer lock (simulated here, as headless Chrome has no real Esc handling): the game pauses.
  await page.evaluate(() => document.exitPointerLock());
  expect("Esc pauses: the card says Paused", await eventually(page, () => document.querySelector(".overlay h1")?.textContent === "Paused"));
  const frozenAt = await q(page, () => window.__game!.getState().step);
  await page.waitForTimeout(1500);
  expect("while paused, the simulation doesn't advance", (await q(page, () => window.__game!.getState().step)) === frozenAt);
  await page.mouse.click(600, 400);
  expect("clicking the card resumes (pointer locked again)", await eventually(page, () => document.pointerLockElement !== null && !window.__game!.isPaused()));
  const advanced = await page
    .waitForFunction((n) => window.__game!.getState().step > n + 10, frozenAt, { timeout: 30_000, polling: 100 })
    .then(() => true, () => false);
  expect("after resuming, the simulation advances", advanced);

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

  // The second corridor: from beyond Gallery II's west door into Gallery III, the Bouncing Hall.
  await page.evaluate(() => window.__game!.setPlayer({ x: -27.5, z: 2 }, Math.PI / 2, 0));
  expect("the second corridor belongs to Gallery II's world", (await q(page, () => window.__game!.getPlayer().gallery)) === "pendulum");
  await page.keyboard.down("w");
  const third = await eventually(page, () => window.__game!.getPlayer().gallery === "bouncing", WALK);
  await page.keyboard.up("w");
  expect("walking west hands the player to Gallery III, the Bouncing Hall", third);

  // Gallery III: aim at the lever, pull it.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("bouncing", { x: -79.6, z: -0.2 }, 0, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("pulled");
  });
  expect("the crosshair finds the lever", await eventually(page, () => window.__game!.getPlayer().hovered === "pulled"));
  // Let the ball in the claw fall asleep first: a sleeping ball once ignored the lever.
  expect("the ball rests in the claw", await eventually(page, () => window.__game!.getState().settled, 30_000));
  await page.mouse.click(600, 400);
  expect(
    "clicking the lever drops the ball, for free",
    await eventually(
      page,
      () => {
        const s = window.__game!.getState();
        return s.rules.lever === "pulled" && s.changesUsed === 0 && s.bodies.ball.pos[1] < 1.5;
      },
      30_000,
    ),
  );
  await page.evaluate(() => window.__game!.lookAtButton("pulled")); // the handle swung down: aim at it again
  expect(
    "the crosshair says the lever is pulled",
    await eventually(page, () => document.querySelector(".crosshair .hint")?.textContent === "The lever is pulled", 30_000),
  );

  // The third corridor, into Gallery IV, the Leaning Pendulum: Floor 1's last room.
  await page.evaluate(() => window.__game!.setPlayer({ x: -48.5, z: 2 }, Math.PI / 2, 0)); // 2 m into the corridor
  await page.keyboard.down("w");
  const fourth = await eventually(page, () => window.__game!.getPlayer().gallery === "leaning-pendulum", WALK);
  await page.keyboard.up("w");
  expect("walking west hands the player to Gallery IV", fourth);
  expect(
    "Gallery IV's instrument lists both broken laws",
    await eventually(page, () => {
      const s = window.__game!.getState();
      return s.exhibit === "leaning-pendulum" && s.rules.gravity === "north" && (s.rules.damping as number) < 0;
    }),
  );

  // The Grand Stair: the HUD at its foot, then climb the second half of the flight to Floor 2
  // (the whole climb can outlast a slow CI machine's patience).
  await page.evaluate(() => window.__game!.setPlayerIn("stairwell", { x: -1.2, z: 2 }, Math.PI / 2, 0));
  expect(
    "the stairs are a passage, not a gallery",
    await eventually(page, () => document.querySelector(".hud .keys")!.textContent!.startsWith("Floor 1 · Mechanics · Galleries restored")),
    await q(page, () => document.querySelector(".hud")!.textContent!.replace(/\s+/g, " ")),
  );
  await page.evaluate(() => window.__game!.setPlayerIn("stairwell", { x: -6, y: 2.4, z: 2 }, Math.PI / 2, 0)); // halfway up
  await page.keyboard.down("w");
  const upstairs = await eventually(page, () => window.__game!.getPlayer().gallery === "optics", 2 * WALK);
  await page.keyboard.up("w");
  expect("climbing the stairs and walking on reaches Floor 2's first gallery", upstairs, `at ${JSON.stringify(await q(page, () => window.__game!.getPlayer().feet))}`);
  expect("Floor 2 is 4.8 m up", Math.abs((await q(page, () => window.__game!.getPlayer().feet.y)) - 4.8) < 0.2);
  expect("the HUD says Floor 2", await eventually(page, () => document.querySelector(".hud .keys")!.textContent!.startsWith("Floor 2")));

  // Gallery V: aim at a mirror, click it.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("optics", { x: -58.6, z: 3.6 }, 0, 0);
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

  // Gallery VI: click an organ pipe to sound it, click again to stop it.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("singing-glass", { x: -96.8, z: -1.2 }, 0.25, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("2");
  });
  expect("the player is handed to Gallery VI", await eventually(page, () => window.__game!.getPlayer().gallery === "singing-glass"));
  expect("the crosshair finds the third pipe", await eventually(page, () => window.__game!.getPlayer().hovered === "2"));
  await page.mouse.click(600, 400);
  expect("clicking a pipe sounds it, for free", await eventually(page, () => window.__game!.getState().rules.pipe === "2" && window.__game!.getState().changesUsed === 0, 30_000));
  expect("the crosshair offers to stop it", await eventually(page, () => document.querySelector(".crosshair .hint")?.textContent === "Click: stop the third pipe", 30_000));
  await page.mouse.click(600, 400);
  expect("clicking it again stops it", await eventually(page, () => window.__game!.getState().rules.pipe === "none", 30_000));

  // Gallery VII: press a key on the Chladni oscillator, then release it.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("chladni", { x: -5.5, z: 1.5 }, 0, -0.5);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("2");
  });
  expect("the player is handed to Gallery VII", await eventually(page, () => window.__game!.getPlayer().gallery === "chladni"));
  expect("the crosshair finds the third key", await eventually(page, () => window.__game!.getPlayer().hovered === "2"));
  await page.mouse.click(600, 400);
  expect("pressing a key sounds its note, for free", await eventually(page, () => window.__game!.getState().rules.note === "2" && window.__game!.getState().changesUsed === 0, 30_000));
  await page.mouse.click(600, 400);
  expect("pressing it again releases it", await eventually(page, () => window.__game!.getState().rules.note === "none", 30_000));
  // Gallery VIII: click the furnace's mirror to aim the beam at the ice.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("furnace", { x: -5.2, z: 0.4 }, 0, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("mirror");
  });
  expect("the player is handed to Gallery VIII", await eventually(page, () => window.__game!.getPlayer().gallery === "furnace"));
  expect("the crosshair finds the furnace mirror", await eventually(page, () => window.__game!.getPlayer().hovered === "mirror"));
  await page.mouse.click(600, 400);
  expect("clicking the mirror aims the beam at the ice, for free", await eventually(page, () => window.__game!.getState().rules.mirror === "ice" && window.__game!.getState().changesUsed === 0, 30_000));
  // Gallery IX: switch the observer lamp on: the bands vanish.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("double-slit", { x: -2.5, z: -0.2 }, Math.PI / 2, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("observer");
  });
  expect("the player is handed to Gallery IX", await eventually(page, () => window.__game!.getPlayer().gallery === "double-slit"));
  expect("the crosshair finds the observer lamp", await eventually(page, () => window.__game!.getPlayer().hovered === "observer"));
  await page.mouse.click(600, 400);
  expect("clicking it switches the observer on, for free", await eventually(page, () => window.__game!.getState().rules.observer === "on" && window.__game!.getState().changesUsed === 0, 30_000));
  // Gallery X, on Floor 3: click the radium source to slide it along.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("rutherford", { x: -1.6, z: -2.4 }, Math.PI * 0.75, -0.3);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("source");
  });
  expect("the player is handed to Gallery X, on Floor 3", await eventually(page, () => window.__game!.getPlayer().gallery === "rutherford"));
  expect("the HUD says Floor 3", await eventually(page, () => document.querySelector(".hud .keys")!.textContent!.startsWith("Floor 3")));
  expect("the crosshair finds the source", await eventually(page, () => window.__game!.getPlayer().hovered === "source"));
  await page.mouse.click(600, 400);
  expect("clicking slides the source along, for free", await eventually(page, () => window.__game!.getState().rules.source === "1" && window.__game!.getState().changesUsed === 0, 30_000));
  // Gallery XI: turn the oven's wheel to light it.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("stern-gerlach", { x: -2.2, z: 0.2 }, 0, -0.4);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("oven");
  });
  expect("the player is handed to Gallery XI", await eventually(page, () => window.__game!.getPlayer().gallery === "stern-gerlach"));
  expect("the HUD numbers it Gallery XI", await eventually(page, () => document.querySelector(".hud .keys")!.textContent!.includes("Gallery XI ")));
  expect("the crosshair finds the oven", await eventually(page, () => window.__game!.getPlayer().hovered === "oven"));
  await page.mouse.click(600, 400);
  expect("turning the wheel lights the oven, for free", await eventually(page, () => window.__game!.getState().rules.oven === "on" && window.__game!.getState().changesUsed === 0, 30_000));
  // Gallery XII: pull the lever to drop the marble into the well.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("tunnel", { x: -4.4, z: 0.4 }, 0, -0.2);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("pulled");
  });
  expect("the player is handed to Gallery XII", await eventually(page, () => window.__game!.getPlayer().gallery === "tunnel"));
  expect("the crosshair finds the tunnel's lever", await eventually(page, () => window.__game!.getPlayer().hovered === "pulled"));
  await page.mouse.click(600, 400);
  expect("pulling it drops the marble, for free", await eventually(page, () => window.__game!.getState().rules.lever === "pulled" && window.__game!.getState().changesUsed === 0, 30_000));
  // Gallery XIII: fire the flash lamp.
  await page.evaluate(async () => {
    await window.__game!.setPlayerIn("slow-light", { x: -2.2, z: -0.6 }, 0, -0.3);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("lamp");
  });
  expect("the player is handed to Gallery XIII", await eventually(page, () => window.__game!.getPlayer().gallery === "slow-light"));
  expect("the crosshair finds the flash lamp", await eventually(page, () => window.__game!.getPlayer().hovered === "lamp"));
  await page.mouse.click(600, 400);
  expect("clicking fires the lamp, for free", await eventually(page, () => window.__game!.getState().rules.lamp === "1" && window.__game!.getState().changesUsed === 0, 30_000));
  await page.evaluate(() => window.__game!.setPlayerIn("singing-glass", { x: -96.8, z: -1.2 }, 0.25, 0));

  // Streaming: only the room the player is in and its neighbours are built.
  expect(
    "in Gallery VI, only it and its neighbours are built",
    JSON.stringify(await q(page, () => window.__game!.getLoaded())) === JSON.stringify(["optics", "singing-glass", "chladni"]),
    (await q(page, () => window.__game!.getLoaded())).join(", "),
  );
  // Solve Gallery I, leave it far behind (it is freed), come back: it is still solved.
  await page.evaluate(async () => {
    await window.__game!.setPlayer({ x: 0, z: 6 }, 0, 0);
    for (const direction of ["north", "west", "down"]) {
      window.__game!.setRule("gravity", direction);
      window.__game!.settle();
    }
    window.__game!.step(120);
  });
  expect("Gallery I is solved", await q(page, () => window.__game!.getState().solved && window.__game!.getPlayer().gallery === "sideways-gravity"));
  expect(
    "around Gallery I, Galleries I and II are built",
    JSON.stringify(await q(page, () => window.__game!.getLoaded())) === JSON.stringify(["sideways-gravity", "pendulum"]),
  );
  await page.evaluate(() => window.__game!.setPlayerIn("stairwell", { x: -1.2, z: 2 }, Math.PI / 2, 0));
  expect(
    "jumping to the Grand Stair frees Galleries I and II",
    await eventually(page, () => {
      const loaded = window.__game!.getLoaded();
      return loaded.length <= 3 && !loaded.includes("sideways-gravity") && !loaded.includes("pendulum");
    }),
    (await q(page, () => window.__game!.getLoaded())).join(", "),
  );
  await page.evaluate(() => window.__game!.setPlayer({ x: 0, z: 6 }, 0, 0));
  expect(
    "coming back, Gallery I is rebuilt still solved, its door open",
    await eventually(page, () => {
      const s = window.__game!.getState();
      return s.exhibit === "sideways-gravity" && s.solved && s.bodies.door.pos[1] < 0;
    }, 30_000),
    await q(page, () => JSON.stringify({ s: window.__game!.getState(), g: window.__game!.getGameState(), loaded: window.__game!.getLoaded() })),
  );

  await page.close(); // the desktop page's rendering would slow the next pages' input handling

  // --- Saved progress: a returning visitor with Galleries I and II solved, last seen in III.
  const visit = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await visit.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return; // seed once; later loads see what the game saved
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "museum-broken-physics/progress",
      JSON.stringify({ version: 1, solved: { "sideways-gravity": { rules: {} }, pendulum: { rules: {} } }, gallery: "leaning-pendulum" }),
    );
  });
  const vp = await visit.newPage();
  vp.on("pageerror", (e) => expect("no page errors (saved visit)", false, e.message));
  await vp.goto(url);
  await vp.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60_000 });
  expect("a returning visitor is welcomed back", await q(vp, () => document.querySelector(".overlay h1")?.textContent === "Welcome back"));
  expect("the visitor's ticket shows two galleries stamped", await q(vp, () => document.querySelectorAll(".overlay .stamp.done").length === 2));
  await vp.screenshot({ path: "harness/out/screens/60-welcome-back.png" });
  await vp.click('[data-visit="continue"]');
  expect(
    "Continue puts the visitor back in Gallery IV with I and II solved",
    await eventually(vp, () => {
      const solved = Object.keys(window.__game!.getGameState());
      return window.__game!.getPlayer().gallery === "leaning-pendulum" && solved.length === 2 && !window.__game!.getState().solved;
    }),
  );
  // Wait for the game's own "lock" handler (the card hides), not just the browser granting the lock.
  expect(
    "…and the game holds the pointer",
    await eventually(vp, () => document.pointerLockElement !== null && document.querySelector(".overlay")!.classList.contains("hidden")),
  );
  // Jump back to Gallery II: it is rebuilt solved, its laws put right.
  await vp.evaluate(() => window.__game!.setPlayer({ x: -26.5, z: 2 }, -Math.PI / 2, 0));
  expect(
    "Gallery II comes back solved, its laws put right",
    await eventually(vp, () => {
      const s = window.__game!.getState();
      return window.__game!.getPlayer().gallery === "pendulum" && s.solved && s.rules.damping === 0.15 && s.changesUsed === 0;
    }),
  );
  expect(
    "moving between galleries saves where the visitor is",
    await q(vp, () => JSON.parse(localStorage.getItem("museum-broken-physics/progress")!).gallery === "pendulum"),
  );
  await vp.evaluate(() => document.exitPointerLock()); // what Esc does; headless Chrome ignores the key
  expect(
    "the pause card carries the ticket",
    await eventually(vp, () => document.querySelectorAll(".overlay .stamp.done").length === 2),
  );
  // Reload and start over: the save is cleared and the museum is new.
  await vp.reload();
  await vp.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60_000 });
  expect("reloading offers to continue again", await q(vp, () => document.querySelector(".overlay h1")?.textContent === "Welcome back"));
  await vp.click('[data-visit="new"]');
  expect(
    "Start a new visit begins at Gallery I with nothing solved",
    await eventually(vp, () => window.__game!.getPlayer().gallery === "sideways-gravity" && Object.keys(window.__game!.getGameState()).length === 0),
  );
  expect("…and forgets the saved visit", await q(vp, () => localStorage.getItem("museum-broken-physics/progress") === null));
  await visit.close();

  // --- Touch: an emulated phone (landscape), real touch events via the DevTools protocol.
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tp = await phone.newPage();
  tp.on("pageerror", (e) => expect("no page errors (touch)", false, e.message));
  await tp.goto(url);
  await tp.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60_000 });
  const cdp = await phone.newCDPSession(tp);
  // Events carry their own timestamps, like a real touchscreen's, so a slow software-rendered
  // frame between injecting "down" and "up" doesn't stretch a tap into a long press.
  let clock = Date.now() / 1000;
  const touchAt = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[]) => {
    clock = Math.max(clock + 0.05, Date.now() / 1000);
    return cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points, timestamp: clock });
  };
  const tapScreen = async (x: number, y: number, id: number) => {
    const t = Date.now() / 1000;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id }], timestamp: t });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t + 0.06 });
    clock = Math.max(clock, t + 0.06);
  };
  expect("touch mode switches on for a touchscreen", await q(tp, () => document.body.classList.contains("touch")));
  expect("the start screen explains touch controls", await q(tp, () => document.querySelector(".overlay")!.textContent!.includes("Left thumb")));
  await tp.tap(".overlay");
  expect("tapping enters the museum", await eventually(tp, () => document.querySelector(".overlay")!.classList.contains("hidden")));
  expect("the touch buttons appear", await q(tp, () => !document.querySelector(".touch-ui")!.classList.contains("hidden")));
  await tp.screenshot({ path: "harness/out/screens/50-touch.png" });

  // Walk: left thumb pushes the joystick up (forward) and holds.
  const zBefore = await q(tp, () => window.__game!.getPlayer().feet.z);
  await touchAt("touchStart", [{ x: 140, y: 300, id: 1 }]);
  await touchAt("touchMove", [{ x: 140, y: 240, id: 1 }]);
  const walked = await eventually(tp, () => window.__game!.getPlayer().feet.z < 6.6, WALK);
  await touchAt("touchEnd", []);
  expect("the joystick walks the player forward", walked, `z ${zBefore.toFixed(2)} → ${(await q(tp, () => window.__game!.getPlayer().feet.z)).toFixed(2)}`);

  // Look: right thumb drags left, turning the view left.
  const yawBefore2 = await q(tp, () => window.__game!.getPlayer().yaw);
  await touchAt("touchStart", [{ x: 650, y: 200, id: 2 }]);
  for (const x of [620, 590, 560]) await touchAt("touchMove", [{ x, y: 200, id: 2 }]);
  await touchAt("touchEnd", []);
  expect("dragging on the right turns the view", await eventually(tp, () => window.__game!.getPlayer().yaw !== 0), `yaw ${yawBefore2} → ${(await q(tp, () => window.__game!.getPlayer().yaw)).toFixed(3)}`);

  // Laws: open the instrument, tap a law, close it.
  await tp.tap('[data-touch="laws"]');
  expect("Laws opens the instrument", await eventually(tp, () => !document.querySelector(".instrument")!.classList.contains("hidden")));
  await tp.screenshot({ path: "harness/out/screens/51-touch-instrument.png" });
  await tp.locator(".instrument button", { hasText: "Back wall" }).tap();
  expect("tapping a law on the instrument changes it", await eventually(tp, () => window.__game!.getState().rules.gravity === "north"));
  await tp.tap('[data-touch="laws"]');
  expect("Laws again puts the instrument away", await eventually(tp, () => document.querySelector(".instrument")!.classList.contains("hidden")));

  // Pause button: freezes the game; tapping the card resumes.
  await tp.tap('[data-touch="pause"]');
  expect("the ❚❚ button pauses", await eventually(tp, () => window.__game!.isPaused() && document.querySelector(".overlay h1")?.textContent === "Paused"));
  await tp.tap(".overlay");
  expect("tapping the card resumes", await eventually(tp, () => !window.__game!.isPaused() && !document.querySelector(".touch-ui")!.classList.contains("hidden")));

  // Tap-to-use: aim at the console's Left wall button and tap it on screen.
  await tp.evaluate(async () => {
    await window.__game!.setPlayer({ x: 0, z: 3.7 }, 0, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("west");
    await window.__game!.nextFrame();
  });
  expect("the console's Left wall button is under the tap point", await eventually(tp, () => window.__game!.getPlayer().hovered === "west"));
  await tapScreen(422, 195, 3);
  expect("tapping a console button uses it", await eventually(tp, () => window.__game!.getState().rules.gravity === "west"));

  // Gallery IV on the phone: a mirror on the left of the screen (the joystick side) still taps.
  const mirrorAt = await tp.evaluate(async () => {
    await window.__game!.setPlayerIn("optics", { x: -58.6, z: 3.6 }, 0, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("mirror-b");
    const p = window.__game!.getPlayer();
    window.__game!.setLook(p.yaw - 0.35, p.pitch); // turn right: the mirror slides to the left
    await window.__game!.nextFrame();
    return window.__game!.screenPosition("mirror-b");
  });
  expect("the floor mirror sits on the joystick side", mirrorAt.x < 844 * 0.45, `x=${mirrorAt.x.toFixed(0)}`);
  await tapScreen(Math.round(mirrorAt.x), Math.round(mirrorAt.y), 4);
  expect(
    "tapping a mirror on the left half turns it",
    await eventually(tp, () => window.__game!.getState().rules["mirror-b"] === 15),
  );
  // Too far away: nothing turns, and the player is told to walk closer.
  const farAt = await tp.evaluate(async () => {
    await window.__game!.setPlayerIn("optics", { x: -54.5, z: 3.6 }, 0, 0);
    await window.__game!.nextFrame();
    window.__game!.lookAtButton("mirror-b");
    await window.__game!.nextFrame();
    return window.__game!.screenPosition("mirror-b");
  });
  await tapScreen(Math.round(farAt.x), Math.round(farAt.y), 5);
  expect(
    "a mirror out of reach says to walk closer",
    await eventually(tp, () => document.querySelector(".touch-toast")!.textContent === "Walk closer to use it" && !document.querySelector(".touch-toast")!.classList.contains("hidden")),
    `distance ${farAt.distance.toFixed(1)} m`,
  );
  expect("…and doesn't turn it", await q(tp, () => window.__game!.getState().rules["mirror-b"] === 15));
  expect("the room's text says Tap, not Click", await q(tp, () => document.querySelector(".hud .status")!.textContent!.includes("Tap a mirror")));
  await phone.close();
} finally {
  await browser.close();
  await server.close();
}
if (failures) {
  console.error(`${failures} UI check(s) failed`);
  process.exit(1);
}
