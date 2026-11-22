// Rapier collision groups shared by every exhibit. Sim only.
// A group value is (memberships << 16) | filter; two colliders interact only
// if each one's membership is in the other's filter.

export const GROUP = {
  room: 0b0001,
  ball: 0b0010,
  /** Decorative bodies that show a rule (plumb bob, debris). */
  telltale: 0b0100,
  player: 0b1000,
} as const;

export const groups = (member: number, filter: number): number => (member << 16) | filter;

/** Walls, floors, doors: everything collides with them. */
export const ROOM_GROUPS = groups(GROUP.room, 0xffff);
/** Puzzle bodies: the room, each other, and the player. */
export const BALL_GROUPS = groups(GROUP.ball, GROUP.room | GROUP.ball | GROUP.player);
/** Tell-tales never touch puzzle bodies or the player, so they can't change the puzzle. */
export const TELLTALE_GROUPS = groups(GROUP.telltale, GROUP.room | GROUP.telltale);
/** The player walks against the room and puzzle bodies; tell-tales pass through. */
export const PLAYER_GROUPS = groups(GROUP.player, GROUP.room | GROUP.ball);
