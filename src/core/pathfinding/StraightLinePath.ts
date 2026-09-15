import { Game } from "../game/Game";
import { TileRef } from "../game/GameMap";

/**
 * Deterministic straight-line tile walk from `from` to `to`, ignoring
 * terrain (land/water) entirely. Flying units (trade planes, fighter jets)
 * travel over everything rather than pathfinding around it like ships, so
 * there's no notion of a blocked/unreachable tile here — the walk always
 * completes. Bresenham's algorithm keeps it integer-only and side-free of
 * float rounding, so the same (from, to) pair always produces the identical
 * tile sequence on every client (required for core-sim determinism).
 *
 * The returned path excludes `from` and includes `to`, matching the
 * "next step(s) to take" semantics callers already expect from
 * WaterPathFinder.next().
 */
export function straightLinePath(
  mg: Game,
  from: TileRef,
  to: TileRef,
): TileRef[] {
  let x0 = mg.x(from);
  let y0 = mg.y(from);
  const x1 = mg.x(to);
  const y1 = mg.y(to);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x1 > x0 ? 1 : -1;
  const sy = y1 > y0 ? 1 : -1;
  let err = dx - dy;

  const path: TileRef[] = [];
  while (x0 !== x1 || y0 !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    path.push(mg.ref(x0, y0));
  }
  return path;
}
