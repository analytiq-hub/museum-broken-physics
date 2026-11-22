// Renders a body's recorded path as an SVG: a top-down plan and a side
// elevation, with the room's boxes drawn underneath. For debugging physics
// without a screenshot. Pure string building: no DOM, no three.js.

export type Point = [number, number, number];

export interface TrajectoryBox {
  center: Point;
  half: Point;
  /** CSS fill colour. */
  fill: string;
}

export interface Marker {
  at: Point;
  label: string;
}

export interface TrajectoryInput {
  title: string;
  /** Room bounds: x and z half-extents, height. */
  room: { halfX: number; halfZ: number; height: number };
  boxes: TrajectoryBox[];
  path: Point[];
  markers: Marker[];
}

const SCALE = 30; // px per metre
const PAD = 24;

/** Plan view (x right, north up) next to an elevation seen from the window (x right, y up). */
export function trajectorySvg(t: TrajectoryInput): string {
  const w = t.room.halfX * 2 * SCALE;
  const planH = t.room.halfZ * 2 * SCALE;
  const elevH = t.room.height * SCALE;
  const width = w * 2 + PAD * 3;
  const height = Math.max(planH, elevH) + PAD * 2 + 20;

  // Plan: (x, z) → px; north (−z) at the top.
  const plan = (p: Point): [number, number] => [PAD + (p[0] + t.room.halfX) * SCALE, PAD + 20 + (p[2] + t.room.halfZ) * SCALE];
  // Elevation: (x, y) → px; up at the top.
  const elev = (p: Point): [number, number] => [PAD * 2 + w + (p[0] + t.room.halfX) * SCALE, PAD + 20 + (t.room.height - p[1]) * SCALE];

  const line = (map: (p: Point) => [number, number]) =>
    `<polyline fill="none" stroke="#c0392b" stroke-width="2" points="${t.path.map((p) => map(p).map((n) => n.toFixed(1)).join(",")).join(" ")}" />`;
  const marks = (map: (p: Point) => [number, number]) =>
    t.markers
      .map((m) => {
        const [x, y] = map(m.at);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#1f4e79" /><text x="${x + 6}" y="${y - 6}" font-size="11">${escape(m.label)}</text>`;
      })
      .join("");

  const [px, py] = plan([-t.room.halfX, 0, -t.room.halfZ]);
  const [ex, ey] = elev([-t.room.halfX, t.room.height, 0]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="system-ui, sans-serif">
<rect width="100%" height="100%" fill="#faf8f3" />
<text x="${PAD}" y="${PAD}" font-size="13" font-weight="600">${escape(t.title)}</text>
<text x="${px}" y="${py - 4}" font-size="11" fill="#666">Plan (north up)</text>
<rect x="${px}" y="${py}" width="${w}" height="${planH}" fill="#fff" stroke="#999" />
${t.boxes.map((b) => rect(plan, b)).join("")}
${line(plan)}${marks(plan)}
<text x="${ex}" y="${ey - 4}" font-size="11" fill="#666">Elevation from the window (up is up)</text>
<rect x="${ex}" y="${ey}" width="${w}" height="${elevH}" fill="#fff" stroke="#999" />
${t.boxes.map((b) => rect(elev, b)).join("")}
${line(elev)}${marks(elev)}
</svg>
`;
}

/** A box projected through `map` (which picks the two axes of the view). */
function rect(map: (p: Point) => [number, number], b: TrajectoryBox): string {
  const lo: Point = [b.center[0] - b.half[0], b.center[1] - b.half[1], b.center[2] - b.half[2]];
  const hi: Point = [b.center[0] + b.half[0], b.center[1] + b.half[1], b.center[2] + b.half[2]];
  const [x1, y1] = map(lo);
  const [x2, y2] = map(hi);
  return `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" fill="${b.fill}" />`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
