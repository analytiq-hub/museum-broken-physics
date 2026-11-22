# The Museum of Broken Physics — Concept

A puzzle adventure where the laws of physics are malfunctioning, and you repair them.

## Premise

You explore an abandoned museum whose exhibits have escaped their intended rules:

- In one gallery, gravity points toward the walls.
- In another, light bends around objects incorrectly, revealing doors that should be invisible.
- A pendulum gains energy instead of losing it, threatening to shake the building apart.

You carry a **physics instrument** that lets you inspect the local rules of a room and adjust a
limited number of parameters. To cross a room you might change the direction of gravity,
redirect a beam of light, and use a rolling object to activate a switch.

## Pillars

1. **Hypothesis → experiment → result.** The fun is forming a hypothesis and watching the room
   respond. Every puzzle should be solvable by reasoning about the rules, not by trial and error alone.
2. **Grounded, with playful liberties.** Behaviour should feel like real physics, even when a rule
   is deliberately broken (a sign flipped, a constant changed, a direction rotated).
3. **Teach, then combine.** Each room introduces one rule through experimentation, then later
   rooms combine it with rules learned earlier.
4. **Trade-offs.** Later, the player must decide which law to restore first, because fixing one
   can make another problem worse.

## Scientific domains

| Domain          | Example broken rule                         | Example puzzle verb                    |
| --------------- | ------------------------------------------- | -------------------------------------- |
| Mechanics       | Gravity points sideways                     | Rotate gravity to roll a ball to a switch |
| Mechanics       | Negative damping (pendulum gains energy)    | Restore damping, or time impulses      |
| Optics          | Wrong refractive index; light bends oddly   | Redirect a beam to reveal a hidden door |
| Waves           | Resonance out of control                    | Tune frequency to shatter / stabilise  |
| Thermodynamics  | Heat flows cold → hot                       | Use reversed heat flow to melt / freeze |

## Look and feel

Richly textured marble galleries, brass instruments, fractured glass, dramatic pools of light,
and floating debris. Dark spaces between exhibits, with spotlights drawing the eye.

## Core loop (one exhibit)

1. **Observe** — enter a room, notice something is wrong.
2. **Inspect** — use the instrument to read the room's rules.
3. **Experiment** — change a parameter (limited budget), watch the result.
4. **Solve** — reach the goal state (switch pressed, door opened, exhibit stabilised).
5. **Restore** — optionally put the rule back, which may matter for later rooms.
