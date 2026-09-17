/*
  Room-name coordinates match the official Screeps mapping
  (screeps/common `roomNameToXY` / `getRoomNameFromXY`):

    E0N0 -> (0, 0)
    W0N0 -> (-1, 0)
    E0S0 -> (0, -1)
    W0S0 -> (-1, -1)

  Linear distance is Chebyshev on that grid (same as Game.map.getRoomLinearDistance
  with continuous=false).
*/

export interface RoomXY {
  x: number;
  y: number;
}

/**
 * Region filter for first-room candidates.
 *
 * - `list`: explicit room names
 * - `box`: inclusive bounding box defined by two corner room names
 * - `radius`: Chebyshev radius around a center room
 * - `visible`: rooms currently in Game.rooms (plus optional known intel)
 * - `allOpen`: every non-closed room the world index can enumerate (private-server / test)
 */
export type RoomRegion =
  | { type: "list"; rooms: string[] }
  | { type: "box"; from: string; to: string }
  | { type: "radius"; center: string; radius: number }
  | { type: "visible" }
  | { type: "allOpen" };

export interface RoomIndex {
  getWorldSize?: () => number;
  isRoomOpen?: (roomName: string) => boolean;
  visibleRooms?: () => string[];
  knownRooms?: () => string[];
  describeExits?: (roomName: string) => string[] | null | undefined;
  /** When true, skip highway / source-keeper sector rooms. */
  excludeSectorRooms?: boolean;
}

const ROOM_NAME_RE = /^([WE])(\d+)([NS])(\d+)$/i;
const OFFICIAL_GRID_MIN_SIZE = 80;
const ALL_OPEN_GRID_MAX = 40;

export function parseRoomName(roomName: string): RoomXY | null {
  const match = ROOM_NAME_RE.exec(roomName);
  if (!match) return null;
  let x = parseInt(match[2], 10);
  let y = parseInt(match[4], 10);
  if (match[1].toUpperCase() === "W") x = -x - 1;
  if (match[3].toUpperCase() === "S") y = -y - 1;
  return { x, y };
}

export function formatRoomName(x: number, y: number): string {
  const horiz = x < 0 ? `W${-x - 1}` : `E${x}`;
  const vert = y < 0 ? `S${-y - 1}` : `N${y}`;
  return `${horiz}${vert}`;
}

export function roomLinearDistance(a: string, b: string): number {
  const pa = parseRoomName(a);
  const pb = parseRoomName(b);
  if (!pa || !pb) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
}

/**
 * The 8 surrounding room names (Chebyshev ring of radius 1).
 * Returns [] when `roomName` is not a standard WxNy/ExSy name (e.g. "sim");
 * callers may fall back to Game.map.describeExits (4 cardinals) via `exits`.
 */
export function adjacentRoomNames(roomName: string, exits?: readonly string[] | null): string[] {
  const parsed = parseRoomName(roomName);
  if (!parsed) {
    return Array.from(new Set((exits ?? []).filter(name => Boolean(name))));
  }
  const names: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      names.push(formatRoomName(parsed.x + dx, parsed.y + dy));
    }
  }
  return names;
}

function sectorCoord(world: number): number {
  return world < 0 ? -world - 1 : world;
}

/** Highway rooms (Wx0 / Ex0 / Nx0 / Sx0). No controller on official maps. */
export function isHighwayRoom(roomName: string): boolean {
  const parsed = parseRoomName(roomName);
  if (!parsed) return false;
  return sectorCoord(parsed.x) % 10 === 0 || sectorCoord(parsed.y) % 10 === 0;
}

/** Source-keeper sector cores on official maps. */
export function isSourceKeeperRoom(roomName: string): boolean {
  const parsed = parseRoomName(roomName);
  if (!parsed) return false;
  const xm = sectorCoord(parsed.x) % 10;
  const ym = sectorCoord(parsed.y) % 10;
  return xm >= 4 && xm <= 6 && ym >= 4 && ym <= 6;
}

export function isClaimableSectorRoom(roomName: string): boolean {
  return !isHighwayRoom(roomName) && !isSourceKeeperRoom(roomName);
}

export function shouldExcludeSectorRooms(worldSize?: number, override?: boolean): boolean {
  if (override !== undefined) return override;
  return typeof worldSize === "number" && worldSize >= OFFICIAL_GRID_MIN_SIZE;
}

export function isSmallWorld(worldSize?: number): boolean {
  return typeof worldSize === "number" && worldSize > 0 && worldSize <= ALL_OPEN_GRID_MAX;
}

function includeRoom(roomName: string, index: RoomIndex, excludeSectors: boolean): boolean {
  if (excludeSectors && !isClaimableSectorRoom(roomName)) return false;
  if (index.isRoomOpen && !index.isRoomOpen(roomName)) return false;
  return true;
}

function enumerateGrid(worldSize: number, index: RoomIndex, excludeSectors: boolean): string[] {
  const half = worldSize / 2;
  const rooms: string[] = [];
  for (let x = -half; x < half; x++) {
    for (let y = -half; y < half; y++) {
      const name = formatRoomName(x, y);
      if (includeRoom(name, index, excludeSectors)) rooms.push(name);
    }
  }
  return rooms;
}

function enumerateBox(from: RoomXY, to: RoomXY, index: RoomIndex, excludeSectors: boolean): string[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const rooms: string[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const name = formatRoomName(x, y);
      if (includeRoom(name, index, excludeSectors)) rooms.push(name);
    }
  }
  return rooms;
}

function bfsFromSeeds(seeds: string[], index: RoomIndex, excludeSectors: boolean, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = seeds.filter(name => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  while (queue.length && out.length < limit) {
    const name = queue.shift()!;
    if (!includeRoom(name, index, excludeSectors)) {
      const exits = index.describeExits?.(name);
      if (exits) {
        for (const next of exits) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      continue;
    }
    out.push(name);
    const exits = index.describeExits?.(name);
    if (!exits) continue;
    for (const next of exits) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return out;
}

/**
 * Default region: full open-world scan on small private/test maps;
 * visible rooms only on large shards (CPU-safe).
 */
export function defaultFirstRoomRegion(index: RoomIndex = {}): RoomRegion {
  const size = index.getWorldSize?.();
  if (isSmallWorld(size)) return { type: "allOpen" };
  const visible = index.visibleRooms?.() ?? [];
  if (visible.length === 0 && isSmallWorld(size) === false && (size ?? 0) > ALL_OPEN_GRID_MAX) {
    return { type: "visible" };
  }
  if (visible.length === 0) return { type: "allOpen" };
  return { type: "visible" };
}

export function listRoomsInRegion(region: RoomRegion, index: RoomIndex = {}): string[] {
  const worldSize = index.getWorldSize?.();
  const excludeSectors = shouldExcludeSectorRooms(worldSize, index.excludeSectorRooms);
  const unique = new Set<string>();

  switch (region.type) {
    case "list":
      for (const name of region.rooms) unique.add(name);
      break;
    case "box": {
      const from = parseRoomName(region.from);
      const to = parseRoomName(region.to);
      if (from && to) {
        for (const name of enumerateBox(from, to, index, excludeSectors)) unique.add(name);
      }
      break;
    }
    case "radius": {
      const center = parseRoomName(region.center);
      if (!center) {
        unique.add(region.center);
        break;
      }
      const from = { x: center.x - region.radius, y: center.y - region.radius };
      const to = { x: center.x + region.radius, y: center.y + region.radius };
      for (const name of enumerateBox(from, to, index, false)) {
        if (roomLinearDistance(region.center, name) <= region.radius && includeRoom(name, index, excludeSectors)) {
          unique.add(name);
        }
      }
      break;
    }
    case "visible":
      for (const name of index.visibleRooms?.() ?? []) unique.add(name);
      for (const name of index.knownRooms?.() ?? []) unique.add(name);
      break;
    case "allOpen": {
      if (typeof worldSize === "number" && worldSize > 0 && worldSize <= ALL_OPEN_GRID_MAX) {
        for (const name of enumerateGrid(worldSize, index, excludeSectors)) unique.add(name);
      } else if (typeof worldSize === "number" && worldSize > ALL_OPEN_GRID_MAX) {
        const seeds = [...(index.visibleRooms?.() ?? []), ...(index.knownRooms?.() ?? [])];
        for (const name of bfsFromSeeds(seeds, index, excludeSectors, 200)) unique.add(name);
      }
      for (const name of index.visibleRooms?.() ?? []) unique.add(name);
      for (const name of index.knownRooms?.() ?? []) {
        if (includeRoom(name, index, excludeSectors)) unique.add(name);
      }
      break;
    }
    default:
      break;
  }

  return Array.from(unique);
}

/** Test/private-server helper: every open room the index can see or name. */
export function listAllOpenRooms(index: RoomIndex): string[] {
  return listRoomsInRegion({ type: "allOpen" }, index);
}
