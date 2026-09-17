/*
  First-room score (v1, energy only).

  Skip rooms with no controller or with a controller owned by someone else
  (including NPC bots). Require ≥2 energy sources.

  Points = every energy source plus the controller (minerals are not included).
  midpoint = rounded average (x, y) of those points, snapped to a walkable tile.
  D = sum of PathFinder-style walk costs from the midpoint to each point
      (plain=1, swamp=5, 8-directional via computeWalkCostMap).
  E = numSources * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME)  // typically 10 each
  score = E / (D + SCORE_EPSILON)

  Higher score is better. More sources raise E; sprawl or swamps raise D.
  3-source rooms generally beat 2-source rooms unless the extra source is far.
  Chebyshev is used only when a walk is unreachable, and is penalized.
*/

import {
  chebyshevDistance,
  computeWalkCostMap,
  PLAIN_WALK_COST,
  ROOM_SIZE,
  SWAMP_WALK_COST,
  tileIndex,
  TilePos,
  UNREACHABLE_COST
} from "./spawnPlacement";

export const MIN_SOURCES = 2;
export const SCORE_EPSILON = 1;
export const CHEBYSHEV_PENALTY = 1000;
export const DEFAULT_SOURCE_ENERGY_CAPACITY = 3000;
export const DEFAULT_ENERGY_REGEN_TIME = 300;

const TERRAIN_WALL = 1;

export interface FirstRoomScoreInput {
  sources: TilePos[];
  controller?: TilePos | null;
  getTerrain: (x: number, y: number) => number;
  plainCost?: number;
  swampCost?: number;
  owner?: string | null;
  my?: boolean;
  sourceEnergyCapacity?: number;
  energyRegenTime?: number;
}

export interface FirstRoomScore {
  eligible: boolean;
  score: number;
  energyPerTick: number;
  walkCost: number;
  sourceCount: number;
  midpoint?: TilePos;
  usedChebyshev: boolean;
  reason?: string;
}

export function sourceRegenPerTick(capacity?: number, regenTime?: number): number {
  const cap =
    capacity ??
    (typeof SOURCE_ENERGY_CAPACITY === "number" ? SOURCE_ENERGY_CAPACITY : DEFAULT_SOURCE_ENERGY_CAPACITY);
  const regen =
    regenTime ?? (typeof ENERGY_REGEN_TIME === "number" ? ENERGY_REGEN_TIME : DEFAULT_ENERGY_REGEN_TIME);
  return cap / regen;
}

export function energyPerTick(sourceCount: number, capacity?: number, regenTime?: number): number {
  return sourceCount * sourceRegenPerTick(capacity, regenTime);
}

export function isOwnedByOther(owner?: string | null, my?: boolean): boolean {
  if (!owner) return false;
  return !my;
}

export function averageMidpoint(points: TilePos[]): TilePos {
  const count = points.length;
  const x = points.reduce((sum, point) => sum + point.x, 0) / count;
  const y = points.reduce((sum, point) => sum + point.y, 0) / count;
  return {
    x: Math.max(0, Math.min(ROOM_SIZE - 1, Math.round(x))),
    y: Math.max(0, Math.min(ROOM_SIZE - 1, Math.round(y)))
  };
}

export function snapToWalkable(pos: TilePos, getTerrain: (x: number, y: number) => number): TilePos {
  if (getTerrain(pos.x, pos.y) !== TERRAIN_WALL) return pos;
  for (let radius = 1; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) continue;
        if (getTerrain(x, y) !== TERRAIN_WALL) return { x, y };
      }
    }
  }
  return pos;
}

function walkCostFromMap(
  map: number[],
  origin: TilePos,
  dest: TilePos
): { cost: number; usedChebyshev: boolean } {
  const idx = tileIndex(dest.x, dest.y);
  const walk = map[idx];
  if (walk !== UNREACHABLE_COST) return { cost: walk, usedChebyshev: false };

  let neighborMin = UNREACHABLE_COST;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = dest.x + dx;
      const ny = dest.y + dy;
      if (nx < 0 || ny < 0 || nx >= ROOM_SIZE || ny >= ROOM_SIZE) continue;
      const nCost = map[tileIndex(nx, ny)];
      if (nCost < neighborMin) neighborMin = nCost;
    }
  }
  if (neighborMin !== UNREACHABLE_COST) return { cost: neighborMin, usedChebyshev: false };

  const estimate = chebyshevDistance(origin.x, origin.y, dest.x, dest.y) * SWAMP_WALK_COST + CHEBYSHEV_PENALTY;
  return { cost: estimate, usedChebyshev: true };
}

function ineligible(sourceCount: number, reason: string): FirstRoomScore {
  return {
    eligible: false,
    score: 0,
    energyPerTick: energyPerTick(sourceCount),
    walkCost: Number.POSITIVE_INFINITY,
    sourceCount,
    usedChebyshev: false,
    reason
  };
}

export function scoreFirstRoom(input: FirstRoomScoreInput): FirstRoomScore {
  const { sources, getTerrain } = input;
  const controller = input.controller ?? null;
  const sourceCount = sources.length;
  const plainCost = input.plainCost ?? PLAIN_WALK_COST;
  const swampCost = input.swampCost ?? SWAMP_WALK_COST;

  if (isOwnedByOther(input.owner, input.my)) return ineligible(sourceCount, "owned");
  if (!controller) return ineligible(sourceCount, "no controller");
  if (sourceCount < MIN_SOURCES) return ineligible(sourceCount, `fewer than ${MIN_SOURCES} sources`);

  const points: TilePos[] = sources.concat([controller]);
  const midpoint = snapToWalkable(averageMidpoint(points), getTerrain);
  const map = computeWalkCostMap(midpoint, getTerrain, undefined, plainCost, swampCost);

  let walkCost = 0;
  let usedChebyshev = false;
  for (const point of points) {
    const walked = walkCostFromMap(map, midpoint, point);
    walkCost += walked.cost;
    usedChebyshev = usedChebyshev || walked.usedChebyshev;
  }

  const e = energyPerTick(sourceCount, input.sourceEnergyCapacity, input.energyRegenTime);
  const score = e / (walkCost + SCORE_EPSILON);
  return {
    eligible: true,
    score,
    energyPerTick: e,
    walkCost,
    sourceCount,
    midpoint,
    usedChebyshev
  };
}

export function compareFirstRoomScores(a: FirstRoomScore, b: FirstRoomScore): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
  if (a.walkCost !== b.walkCost) return a.walkCost - b.walkCost;
  return 0;
}

export interface NamedRoomScoreInput extends FirstRoomScoreInput {
  roomName: string;
}

export interface RankedFirstRoom extends FirstRoomScore {
  roomName: string;
}

export function rankFirstRooms(rooms: NamedRoomScoreInput[]): RankedFirstRoom[] {
  return rooms
    .map(room => ({ roomName: room.roomName, ...scoreFirstRoom(room) }))
    .sort((a, b) => {
      const byScore = compareFirstRoomScores(a, b);
      if (byScore !== 0) return byScore;
      return a.roomName.localeCompare(b.roomName);
    });
}
