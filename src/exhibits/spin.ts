// The spin of a silver atom, shared by Stern–Gerlach (Gallery XI) and the Silver Vault
// (Gallery XV). Sim only: no three.js, no DOM.
//
// What is broken is quantisation, not the choice of axis. The magnet measures the spin
// along its own field (any axis would do), and the law says that component comes out
// exactly up or down, never in between: the beam splits in two. Broken, it can come
// out anywhere from fully up to fully down, the classical little magnet, and the beam
// smears into a band. The decoy, three values (up, down or zero), is a spin-1 atom.
import type { Rule } from "../rules/Rule";

export type Spin = "any" | "two" | "three";

export const SPIN_MARKS: { value: Spin; label: string }[] = [
  { value: "any", label: "Any value, from up to down" },
  { value: "two", label: "Two values: up or down" },
  { value: "three", label: "Three values: up, down or zero" },
];

/** The spin rule. It starts broken; each room says what the instrument offers through these marks. */
export function spinRule(): Rule<Spin> {
  return {
    id: "spin",
    label: "Spin of the silver atoms",
    kind: "choice",
    options: SPIN_MARKS,
    current: "any",
    nominal: "two",
    editable: true,
    // The reading is the same whichever option is set, so it can't give the answer away.
    observe: () => "The magnet pushes each silver atom up or down by an amount set by its spin, measured along the field. Watch where the silver lands on the screen.",
    explain: (current) =>
      current === "two"
        ? "Measured along any axis, a silver atom's spin comes out exactly up or down, never in between, as it should be."
        : "Measured along any axis, a silver atom's spin should come out exactly up or down, never in between. Here it does not.",
    apply() {},
  };
}
