// The end of the route (for now): a small room with the museum's closing placard.
// New galleries are added before it, so it always closes the visit. Sim only.
import { roomShell, type Box, type RoomBounds } from "../layout";

export const ROOM: RoomBounds = { xMin: -4.5, xMax: -0.5, halfZ: 3.5, height: 3.5 };
export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const STATIC_BOXES: readonly Box[] = roomShell(ROOM, { westDoor: false });
