// What the physics instrument shows, derived from an exhibit's rules.
// Pure data (no DOM, no three.js), so it is unit-tested.
//
// The instrument never gives the answer away: until the player has discovered a
// law (by putting right a room where it was broken), it shows only the reading
// here and what that does, not what the law should be.
import type { ExhibitBase } from "../exhibits/Exhibit";
import type { Rule } from "../rules/Rule";

export interface InstrumentOption {
  value: unknown;
  label: string;
  current: boolean;
  /** The law's value; only ever true once the law is known. */
  nominal: boolean;
}

export interface InstrumentRule {
  id: string;
  label: string;
  /** The reading here, e.g. "Right wall". */
  reading: string;
  /** Has the player discovered this law? Until then, `law` is empty and `broken` is false. */
  known: boolean;
  /** Where the player discovered it, e.g. "The Sideways Gallery". */
  discoveredIn?: string;
  /** What the law should be, e.g. "Floor" (empty until known). */
  law: string;
  /** Known to differ from the law here. */
  broken: boolean;
  editable: boolean;
  /** One sentence a newcomer can act on. */
  explanation: string;
  options: InstrumentOption[];
  /** Can the player change this rule right now? */
  canChange: boolean;
}

export interface InstrumentModel {
  title: string;
  rules: InstrumentRule[];
  changesLeft: number;
  budget: number;
  /** Why changes are unavailable, if they are. */
  locked?: string;
}

/**
 * Turns an exhibit's rules into the instrument's view model. `known` maps the ids
 * of laws the player has discovered to where they discovered them.
 */
export function instrumentModel(ex: ExhibitBase, title: string, known: ReadonlyMap<string, string> = new Map()): InstrumentModel {
  let locked: string | undefined;
  if (ex.isSolved()) locked = "Room solved: the laws are locked in.";
  else if (ex.isFailed()) locked = "The room is resetting.";
  else if (ex.changesLeft <= 0) locked = "No changes left. Reset the room to try again.";

  return {
    title,
    rules: ex.rules.filter((rule) => !rule.control).map((rule) => describeRule(rule, !locked, known.get(rule.id))),
    changesLeft: ex.changesLeft,
    budget: ex.budget,
    locked,
  };
}

function describeRule(rule: Rule, roomAllowsChanges: boolean, discoveredIn: string | undefined): InstrumentRule {
  const choices = rule.options ?? rule.marks ?? [];
  const labelOf = (value: unknown) => choices.find((o) => o.value === value)?.label ?? String(value);
  const reading = labelOf(rule.current);
  const known = discoveredIn !== undefined;
  const law = known ? labelOf(rule.nominal) : "";
  const broken = known && rule.current !== rule.nominal;
  const noun = rule.label.toLowerCase();
  const observed = rule.observe
    ? rule.observe(rule.current)
    : rule.id === "gravity"
      ? `Gravity pulls toward the ${reading.toLowerCase()} here.`
      : `The ${noun} reads ${reading.toLowerCase()} here.`;
  const explanation = !known
    ? observed
    : !broken
    ? `${rule.label} behaves as it should here.`
    : rule.explain
      ? rule.explain(rule.current, rule.nominal)
      : rule.id === "gravity"
      ? `Gravity should pull toward the ${law.toLowerCase()}. Here it pulls toward the ${reading.toLowerCase()}.`
      : `The ${noun} should be ${law.toLowerCase()}. Here it is ${reading.toLowerCase()}.`;

  return {
    id: rule.id,
    label: rule.label,
    reading,
    known,
    discoveredIn,
    law,
    broken,
    editable: rule.editable,
    explanation,
    options: choices.map((o) => ({
      value: o.value,
      label: o.label,
      current: o.value === rule.current,
      nominal: known && o.value === rule.nominal,
    })),
    canChange: rule.editable && roomAllowsChanges,
  };
}
