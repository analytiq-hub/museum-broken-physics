// The physics instrument: an overlay that lists the room's laws (reading vs.
// law, broken or not, a plain explanation), lets the player adjust or restore
// them within the room's budget, and resets the room.
//
// In first person it is raised by holding Q. The pointer stays locked and the
// mouse drives a cursor on the instrument instead of the view, so there is no
// fight with the browser's pointer-lock rules. Elsewhere it is a normal panel.
import type { GravityDirection } from "../rules/Rule";
import type { InstrumentModel, InstrumentRule } from "./instrumentModel";

/** Gravity options laid out like the room as seen from the viewing hall. */
const GRAVITY_PAD: { direction: GravityDirection; glyph: string; key: string; area: string }[] = [
  { direction: "north", glyph: "▲", key: "↑", area: "top" },
  { direction: "west", glyph: "◀", key: "←", area: "left" },
  { direction: "down", glyph: "●", key: "Space", area: "mid" },
  { direction: "east", glyph: "▶", key: "→", area: "right" },
  { direction: "south", glyph: "▼", key: "↓", area: "bottom" },
];

/** In the window view, keyboard keys that pick a gravity direction, matching the pad. */
export const GRAVITY_KEYS: Record<string, GravityDirection> = {
  ArrowUp: "north",
  ArrowLeft: "west",
  " ": "down",
  ArrowRight: "east",
  ArrowDown: "south",
};

export interface InstrumentHandlers {
  setRule(id: string, value: unknown): void;
  resetRoom(): void;
}

export interface Instrument {
  /** Renders the model (cheap when nothing changed). */
  update(model: InstrumentModel): void;
  /**
   * Shows the instrument. `virtualCursor`: the pointer is locked, so mouse
   * movement is fed through moveCursor()/click() instead of the real cursor.
   */
  open(virtualCursor: boolean, hint: string): void;
  close(): void;
  readonly isOpen: boolean;
  readonly usesVirtualCursor: boolean;
  moveCursor(dx: number, dy: number): void;
  /** Clicks whatever is under the virtual cursor. */
  click(): void;
}

export function createInstrument(handlers: InstrumentHandlers): Instrument {
  const root = document.createElement("div");
  root.className = "instrument hidden";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Physics instrument");
  document.body.appendChild(root);

  const cursor = document.createElement("div");
  cursor.className = "instrument-cursor hidden";
  document.body.appendChild(cursor);

  let model: InstrumentModel | undefined;
  let lastRender = "";
  let hint = "";
  let isOpen = false;
  let virtual = false;
  let cx = 0;
  let cy = 0;
  let hoverEl: Element | null = null;

  root.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!target || target.disabled || !model) return;
    const rule = model.rules.find((r) => r.id === target.dataset.rule);
    if (target.dataset.action === "set" && rule) handlers.setRule(rule.id, rule.options[Number(target.dataset.option)].value);
    if (target.dataset.action === "restore" && rule) {
      const nominal = rule.options.find((o) => o.nominal);
      if (nominal) handlers.setRule(rule.id, nominal.value);
    }
    if (target.dataset.action === "reset") handlers.resetRoom();
  });

  function render(): void {
    if (!model) return;
    const html = renderModel(model, hint);
    if (html === lastRender) return;
    lastRender = html;
    root.innerHTML = html;
    hoverEl = null;
  }

  function setHover(el: Element | null): void {
    if (el === hoverEl) return;
    hoverEl?.classList.remove("vhover");
    hoverEl = el;
    hoverEl?.classList.add("vhover");
  }

  return {
    get isOpen() {
      return isOpen;
    },
    get usesVirtualCursor() {
      return isOpen && virtual;
    },
    update(next) {
      model = next;
      if (isOpen) render();
    },
    open(useVirtual, nextHint) {
      hint = nextHint;
      virtual = useVirtual;
      if (!isOpen) {
        isOpen = true;
        root.classList.remove("hidden");
        if (virtual) {
          // Start the cursor in the middle of the instrument.
          render();
          const r = root.getBoundingClientRect();
          cx = r.left + r.width / 2;
          cy = r.top + r.height / 2;
        }
      }
      cursor.classList.toggle("hidden", !virtual);
      render();
    },
    close() {
      isOpen = false;
      root.classList.add("hidden");
      cursor.classList.add("hidden");
      setHover(null);
    },
    moveCursor(dx, dy) {
      cx = Math.max(0, Math.min(window.innerWidth - 1, cx + dx));
      cy = Math.max(0, Math.min(window.innerHeight - 1, cy + dy));
      cursor.style.transform = `translate(${cx}px, ${cy}px)`;
      setHover(document.elementFromPoint(cx, cy)?.closest("button[data-action]") ?? null);
    },
    click() {
      (document.elementFromPoint(cx, cy)?.closest("button[data-action]") as HTMLButtonElement | null)?.click();
    },
  };
}

function renderModel(m: InstrumentModel, hint: string): string {
  const pips = `<span class="pips">${"●".repeat(m.changesLeft)}${"○".repeat(m.budget - m.changesLeft)}</span>`;
  return `
    <div class="inst-head">
      <span class="inst-brand">Physics instrument</span>
      <span class="inst-room">${m.title}</span>
    </div>
    ${m.rules.map(renderRule).join("")}
    <div class="inst-budget"><b>Changes left</b> ${pips}</div>
    ${m.locked ? `<div class="inst-locked">${m.locked}</div>` : ""}
    <div class="inst-foot">
      <button type="button" data-action="reset">Reset room (R)</button>
      <span class="inst-hint">${hint}</span>
    </div>`;
}

function renderRule(rule: InstrumentRule): string {
  const status = rule.broken ? `<span class="chip broken">Broken</span>` : `<span class="chip ok">As it should be</span>`;
  const lock = rule.editable ? "" : `<span class="chip locked">Fixed here</span>`;
  // The room-shaped pad only fits Gallery I's five directions; anything else is a list.
  const isGravity = rule.id === "gravity" && rule.options.every((o) => GRAVITY_PAD.some((s) => s.direction === o.value));
  const optionButton = (o: InstrumentRule["options"][number], i: number, extra = "") =>
    `<button type="button" data-action="set" data-rule="${rule.id}" data-option="${i}" ${extra}
      class="${o.current ? "active" : ""} ${o.nominal ? "nominal" : ""}"
      ${!rule.canChange || o.current ? "disabled" : ""} aria-pressed="${o.current}">`;

  const controls = isGravity
    ? `<div class="gravity-pad">${GRAVITY_PAD.map((slot) => {
        const i = rule.options.findIndex((o) => o.value === slot.direction);
        if (i < 0) return "";
        const o = rule.options[i];
        return `${optionButton(o, i, `style="grid-area:${slot.area}"`)}
          <span class="glyph">${slot.glyph}</span><span class="label">${o.label}</span></button>`;
      }).join("")}</div>`
    : `<div class="inst-options">${rule.options.map((o, i) => `${optionButton(o, i)}${o.label}</button>`).join("")}</div>`;

  return `
    <section class="inst-rule ${rule.broken ? "is-broken" : ""}">
      <div class="inst-rule-head"><b>${rule.label}</b>${status}${lock}</div>
      <dl class="inst-readings">
        <div><dt>Reading here</dt><dd>${rule.reading}</dd></div>
        <div><dt>The law</dt><dd>${rule.law}</dd></div>
      </dl>
      <p class="inst-expl">${rule.explanation}</p>
      ${rule.editable ? controls : ""}
      ${rule.editable && rule.broken ? `<button type="button" class="inst-restore" data-action="restore" data-rule="${rule.id}" ${rule.canChange ? "" : "disabled"}>Restore the law: ${rule.law}</button>` : ""}
    </section>`;
}
