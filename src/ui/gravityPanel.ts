// On-screen gravity control: a d-pad laid out the way the player sees the room
// (back wall at the top, window at the bottom, floor in the middle).
import type { GravityDirection } from "../rules/Rule";

interface Slot {
  direction: GravityDirection;
  glyph: string;
  key: string;
  /** CSS grid area. */
  area: string;
}

const SLOTS: Slot[] = [
  { direction: "north", glyph: "▲", key: "↑", area: "top" },
  { direction: "west", glyph: "◀", key: "←", area: "left" },
  { direction: "down", glyph: "●", key: "Space", area: "mid" },
  { direction: "east", glyph: "▶", key: "→", area: "right" },
  { direction: "south", glyph: "▼", key: "↓", area: "bottom" },
];

/** Keyboard keys that pick a direction, matching the d-pad layout. */
export const GRAVITY_KEYS: Record<string, GravityDirection> = {
  ArrowUp: "north",
  ArrowLeft: "west",
  " ": "down",
  ArrowRight: "east",
  ArrowDown: "south",
};

export interface GravityPanelState {
  current: GravityDirection;
  /** False when no change is possible right now (budget spent, solved, failed). */
  enabled: boolean;
}

export interface GravityPanel {
  update(state: GravityPanelState): void;
  setVisible(visible: boolean): void;
}

export function createGravityPanel(
  labels: Record<GravityDirection, string>,
  onPick: (direction: GravityDirection) => void,
): GravityPanel {
  const panel = document.createElement("div");
  panel.className = "gravity-panel";
  panel.innerHTML = `<div class="gravity-title">Point gravity at…</div>`;
  const pad = document.createElement("div");
  pad.className = "gravity-pad";
  panel.appendChild(pad);

  const buttons = new Map<GravityDirection, HTMLButtonElement>();
  for (const slot of SLOTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.style.gridArea = slot.area;
    button.innerHTML = `<span class="glyph">${slot.glyph}</span><span class="label">${labels[slot.direction]}</span><kbd>${slot.key}</kbd>`;
    button.addEventListener("click", () => onPick(slot.direction));
    pad.appendChild(button);
    buttons.set(slot.direction, button);
  }
  document.body.appendChild(panel);

  let last = "";
  return {
    setVisible(visible) {
      panel.classList.toggle("hidden", !visible);
    },
    update({ current, enabled }) {
      const key = `${current}|${enabled}`;
      if (key === last) return; // avoid touching the DOM every frame
      last = key;
      for (const [direction, button] of buttons) {
        const active = direction === current;
        button.classList.toggle("active", active);
        button.disabled = !enabled || active;
        button.setAttribute("aria-pressed", String(active));
      }
    },
  };
}
