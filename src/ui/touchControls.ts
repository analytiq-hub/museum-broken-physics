// Touch controls for phones and tablets: a floating joystick under the left
// thumb to walk, dragging on the right to look, tapping to use things, and two
// on-screen buttons (Laws = the physics instrument, Reset). Uses Pointer
// Events, so several fingers work at once.

export interface TouchHandlers {
  /** A quick tap (no drag) at screen coordinates. */
  tap(x: number, y: number): void;
  toggleInstrument(): void;
  reset(): void;
}

export interface TouchControls {
  /** Walking intent from the joystick, −1..1 each. */
  readonly move: { forward: number; right: number };
  /** Look movement since the last call, in pixels (then cleared). */
  takeLook(): { dx: number; dy: number };
  setVisible(visible: boolean): void;
  /** Marks the Laws button as active while the instrument is open. */
  setInstrumentOpen(open: boolean): void;
}

/** Joystick travel (px) for full speed. */
const STICK_RADIUS = 55;
/** A touch that moves less than this (px) and lifts quickly is a tap. */
const TAP_SLOP = 12;
const TAP_MS = 350;

const isTouch = (e: PointerEvent) => e.pointerType === "touch" || e.pointerType === "pen";

export function createTouchControls(surface: HTMLElement, handlers: TouchHandlers): TouchControls {
  const root = document.createElement("div");
  root.className = "touch-ui hidden";
  root.innerHTML = `
    <div class="stick hidden"><div class="knob"></div></div>
    <div class="touch-buttons">
      <button type="button" data-touch="laws">Laws</button>
      <button type="button" data-touch="reset">Reset</button>
    </div>
    <div class="touch-hint">Left thumb: walk · Right thumb: look · Tap things to use them</div>`;
  document.body.appendChild(root);
  const stick = root.querySelector<HTMLDivElement>(".stick")!;
  const knob = root.querySelector<HTMLDivElement>(".knob")!;
  const lawsButton = root.querySelector<HTMLButtonElement>('[data-touch="laws"]')!;
  root.querySelector<HTMLButtonElement>('[data-touch="reset"]')!.addEventListener("click", () => handlers.reset());
  lawsButton.addEventListener("click", () => handlers.toggleInstrument());
  const hint = root.querySelector<HTMLDivElement>(".touch-hint")!;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;

  const move = { forward: 0, right: 0 };
  let lookDx = 0;
  let lookDy = 0;
  let stickId: number | undefined;
  let stickX = 0;
  let stickY = 0;
  const looks = new Map<number, { x: number; y: number; startX: number; startY: number; t: number }>();

  surface.addEventListener("pointerdown", (e) => {
    if (!isTouch(e)) return;
    e.preventDefault();
    if (hintTimer === undefined) hintTimer = setTimeout(() => hint.classList.add("faded"), 6000);
    if (e.clientX < window.innerWidth * 0.45 && stickId === undefined) {
      stickId = e.pointerId;
      stickX = e.clientX;
      stickY = e.clientY;
      stick.style.transform = `translate(${stickX}px, ${stickY}px)`;
      knob.style.transform = "translate(0px, 0px)";
      stick.classList.remove("hidden");
    } else {
      // e.timeStamp is when the touch happened, not when we got round to handling it,
      // so a slow frame doesn't turn a quick tap into a "long press".
      looks.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: e.timeStamp });
    }
  });

  surface.addEventListener("pointermove", (e) => {
    if (!isTouch(e)) return;
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickX;
      let dy = e.clientY - stickY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      move.right = dx / STICK_RADIUS;
      move.forward = -dy / STICK_RADIUS;
      return;
    }
    const look = looks.get(e.pointerId);
    if (look) {
      lookDx += e.clientX - look.x;
      lookDy += e.clientY - look.y;
      look.x = e.clientX;
      look.y = e.clientY;
    }
  });

  const end = (e: PointerEvent) => {
    if (!isTouch(e)) return;
    if (e.pointerId === stickId) {
      stickId = undefined;
      move.forward = move.right = 0;
      stick.classList.add("hidden");
      return;
    }
    const look = looks.get(e.pointerId);
    if (!look) return;
    looks.delete(e.pointerId);
    const moved = Math.hypot(e.clientX - look.startX, e.clientY - look.startY);
    if (e.type === "pointerup" && moved < TAP_SLOP && e.timeStamp - look.t < TAP_MS) handlers.tap(e.clientX, e.clientY);
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);

  return {
    move,
    takeLook() {
      const look = { dx: lookDx, dy: lookDy };
      lookDx = lookDy = 0;
      return look;
    },
    setVisible(visible) {
      root.classList.toggle("hidden", !visible);
      if (!visible) {
        stickId = undefined;
        move.forward = move.right = 0;
        looks.clear();
        stick.classList.add("hidden");
      }
    },
    setInstrumentOpen(open) {
      lawsButton.classList.toggle("active", open);
      hint.classList.toggle("hidden", open); // it would sit under the instrument panel
    },
  };
}
