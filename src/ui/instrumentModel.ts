// What the physics instrument shows, derived from an exhibit's rules.
// Pure data (no DOM, no three.js), so it is unit-tested.
import type { ExhibitBase } from "../exhibits/Exhibit";
import type { Rule } from "../rules/Rule";

export interface InstrumentOption {
  value: unknown;
  label: string;
  current: boolean;
  nominal: boolean;
}

export interface InstrumentRule {
  id: string;
  label: string;
  /** The reading here, e.g. "Right wall". */
  reading: string;
  /** What the law should be, e.g. "Floor". */
  law: string;
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

/** Turns an exhibit's rules into the instrument's view model. */
export function instrumentModel(ex: ExhibitBase, title: string): InstrumentModel {
  let locked: string | undefined;
  if (ex.isSolved()) locked = "Room solved: the laws are locked in.";
  else if (ex.isFailed()) locked = "The room is resetting.";
  else if (ex.changesLeft <= 0) locked = "No changes left. Reset the room to try again.";

  return {
    title,
    rules: ex.rules.filter((rule) => !rule.control).map((rule) => describeRule(rule, !locked)),
    changesLeft: ex.changesLeft,
    budget: ex.budget,
    locked,
  };
}

function describeRule(rule: Rule, roomAllowsChanges: boolean): InstrumentRule {
  const choices = rule.options ?? rule.marks ?? [];
  const labelOf = (value: unknown) => choices.find((o) => o.value === value)?.label ?? String(value);
  const reading = labelOf(rule.current);
  const law = labelOf(rule.nominal);
  const broken = rule.current !== rule.nominal;
  const noun = rule.label.toLowerCase();
  const explanation = !broken
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
    law,
    broken,
    editable: rule.editable,
    explanation,
    options: choices.map((o) => ({
      value: o.value,
      label: o.label,
      current: o.value === rule.current,
      nominal: o.value === rule.nominal,
    })),
    canChange: rule.editable && roomAllowsChanges,
  };
}
