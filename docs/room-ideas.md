# Room Ideas: Famous Experiments

Candidate rooms based on famous physics experiments, both real and thought experiments. Each
follows the museum's pattern: one law is broken, and the player works out which law, and how
to use it or put it right. See [concept.md](concept.md) for the core loop and
[plan.md](plan.md) for the rooms already planned. Galleries I–VI cover gravity direction,
negative damping, the leaning pendulum, refraction, the speed of sound and reversed heat flow.

Each entry gives who did the experiment and when, what it showed, and a room idea.

## Best fits for the engine

The rooms that are easiest to build reuse what the solver already does well. That means
either Rapier with explicit, capped custom forces, or closed-form 2D maths like the optics
tracer (`src/exhibits/optics/trace.ts`), which runs headlessly and is cheap to search.

1. **Young's double slit.** Closed-form maths, visually striking, and it extends the optics
   gallery.
2. **Rutherford's gold foil.** Rapier marbles and a hidden shape, with a new kind of puzzle:
   working out the shape from deflections.
3. **Stern–Gerlach.** Discrete and cheap to simulate, with strong "why did that happen"
   moments. The solver can search every filter arrangement exhaustively.
4. **Maxwell's demon.** A famous name, and the player becomes the demon. A 2D particle box
   is cheap to simulate.
5. **Galileo's falling bodies, Cavendish, Newton's cannonball.** Almost free on top of the
   existing gravity code: per-body custom forces in Rapier.
6. **Faraday's induction with Lenz's law reversed.** A runaway effect like Gallery II, built
   the same way (an explicit force with an energy cap), but a different law.

Carnot and Joule are close to Gallery VI (the Backwards Furnace). They fit later as rooms
in a heat wing rather than as the next room.

## Heat and energy

- **Carnot cycle** (Sadi Carnot, 1824). A thought experiment about the ideal engine running
  between a hot and a cold reservoir. No engine can beat its efficiency, 1 − T_cold/T_hot.
  - *Room:* a steam engine that runs at over 100% efficiency, a perpetual motion machine. It
    powers the lift to the exit but slowly overheats the room. The player brings the
    efficiency back to the Carnot limit, or runs its four strokes (heat, expand, cool,
    compress) in the right order.
- **Maxwell's demon** (James Clerk Maxwell, 1867). A thought experiment. A tiny being opens
  a trapdoor between two gas chambers, letting only fast molecules through one way and slow
  ones the other. One side heats up and the other cools without any work being done, which
  seems to break the second law. It was resolved a century later (Szilard, Landauer): the
  demon has to remember each molecule, and erasing that memory costs energy.
  - *Room:* a 2D box of bouncing particles with a trapdoor the player operates. A hot side
    is needed to drive a piston. The demon's memory fills up, and wiping it warms the room.
- **Joule's paddle wheel** (James Joule, 1845). A falling weight turns a paddle in water,
  and the water warms. Work and heat are the same thing, at a fixed exchange rate.
  - *Room:* the exchange rate is broken. A dropped weight boils the water, or freezes it.

## Mechanics and gravity

- **Galileo's falling bodies** (around 1590, the Leaning Tower story). Heavy and light
  objects fall at the same rate.
  - *Room:* Aristotle's law is in force, so heavier things fall faster. Two balls must reach
    two plates at the same moment to open a door.
- **Newton's cannonball** (Isaac Newton, 1687). A thought experiment. A cannonball fired
  fast enough from a mountain falls around the Earth forever. That is an orbit.
  - *Room:* a small planet on a plinth with gravity broken. The player sets launch speed and
    gravity to put a marble into orbit, or to land it on the far side.
- **Cavendish experiment** (Henry Cavendish, 1798). A torsion balance measured the faint pull
  between lead spheres, which gave the gravitational constant G.
  - *Room:* G is a million times too strong. Every object attracts the others, the furniture
    slowly clumps together, and marbles orbit the heavy statue.
- **Foucault pendulum** (Léon Foucault, 1851). A long pendulum's swing slowly rotates, which
  proves the Earth turns.
  - *Room:* the room spins far too fast (a broken Coriolis force). Thrown balls curve. This
    reuses the pendulum rooms' code.
- **Newton's cradle** (conservation of momentum). One ball hits the row and one ball flies
  off the far end.
  - *Room:* momentum isn't conserved, so two balls come out, or three. A chain of cradles
    opens a lock.

## Fluids and pressure

- **Magdeburg hemispheres** (Otto von Guericke, 1654). Two teams of horses couldn't pull
  apart two bronze hemispheres once the air was pumped out.
  - *Room:* the door is sealed by hemispheres. Air pressure is broken, either far too high or
    zero, which changes what holds things together.
- **Archimedes' principle** (the "Eureka!" story). A floating object is pushed up by the
  weight of the water it displaces.
  - *Room:* buoyancy is reversed or scaled, so iron floats and wood sinks. The player raises
    a key from a flooded pit.
- **Pascal's barrel** (Blaise Pascal, 1646). A tall, thin tube of water burst a barrel.
  Pressure depends on the height of the water, not the amount.
  - *Room:* fill a column high enough to lift a heavy door with a hydraulic press, without
    bursting the glass case next to it.

## Electricity and magnetism

- **Faraday's induction** (Michael Faraday, 1831). A magnet moving through a coil makes a
  current. Lenz's law says that current always opposes the motion.
  - *Room:* Lenz's law is reversed, so a falling magnet speeds up through the coil and runs
    away. It is a capped force, like the negative damping in Gallery II.
- **Millikan's oil drop** (Robert Millikan, 1909). Tiny charged droplets were held floating
  in an electric field, which showed that charge comes in fixed units.
  - *Room:* charge isn't quantised. The player sets the field so that exactly the right
    droplet floats up to a slot.

## Light and waves

- **Young's double slit** (Thomas Young, 1801, later repeated with electrons). Light through
  two slits makes bands of light and dark on a screen, which shows light is a wave. With
  electrons, watching which slit each one goes through makes the bands disappear.
  - *Room:* the wavelength is broken. The player puts a bright band on a light sensor that
    unlocks the door. Switching on the "observer" lamp wipes out the pattern.
- **Michelson–Morley** (Albert Michelson and Edward Morley, 1887). An interferometer looked
  for the "ether wind" and found none: light has the same speed in every direction.
  - *Room:* the ether exists, so light is faster in one direction. A beam-timing puzzle that
    builds on the optics gallery.
- **Chladni plates** (Ernst Chladni, 1787). Sand on a vibrating metal plate gathers into
  patterns along the lines that stay still.
  - *Room:* the pattern has to form a shape, such as a keyhole. A strong visual that pairs
    with the Singing Glass gallery.

## Modern physics

- **Rutherford's gold foil** (Ernest Rutherford, 1909). Alpha particles fired at gold foil
  occasionally bounced straight back, which revealed a tiny, dense nucleus.
  - *Room:* the player fires marbles at a hidden object, works out its shape from how they
    deflect, and uses that to find the hidden door.
- **Stern–Gerlach** (Otto Stern and Walther Gerlach, 1922). Silver atoms passing through a
  magnetic field split into exactly two beams, never a spread. Measuring one direction
  scrambles a previous measurement of another.
  - *Room:* a chain of magnet filters with very simple discrete rules. A logic puzzle with
    surprising results.
- **Einstein's elevator** (Albert Einstein, 1907). A thought experiment: inside a closed lift
  you can't tell gravity from acceleration.
  - *Room:* the room is a lift that accelerates. A natural follow-up to Gallery I's gravity
    puzzles.
- **Slow speed of light** (George Gamow, *Mr Tompkins in Wonderland*, 1940). A book whose
  hero visits a world where light travels at about walking pace, so relativity becomes
  visible. Its premise is very close to this museum's.
  - *Room:* moving objects shorten and their clocks run slow. A clock has to reach the door
    showing the right time.
- **Schrödinger's cat** (Erwin Schrödinger, 1935). A thought experiment: a cat in a sealed box
  is both alive and dead until someone looks.
  - *Room:* the contents of boxes aren't decided until they are opened, so the order of
    opening them changes what is inside.
