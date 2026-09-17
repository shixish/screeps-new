/*
  First-room score.

  Walk costs match PathFinder.search with { plainCost: 1, swampCost: 5 } and
  8-directional movement, via computeWalkCostMap (same as spawn placement).
  Chebyshev is used only when a walk is unreachable, and is penalized so a
  real walk always ranks better than a disconnected estimate.

  Eligibility:
    - A controller is required.
    - At least 2 energy sources. Fewer sources are rejected (eligible=false).

  Closest source pair:
    sourcePairCost = minimum Dijkstra walk cost between any two sources.

  Rendezvous:
    The walkable tile that minimizes dist(sourceA) + dist(sourceB) for that
    closest pair (tiles on a shortest A–B path). Ties break by lowest
    walk cost to the controller. That tile is the "best access" between the
    two sources.

  Controller access:
    controllerCost = walk cost from the rendezvous to the controller.
    If no rendezvous exists, fall back to sourceA→controller + sourceB→controller.

  Rank (lower is better):
    rankCost = sourcePairCost * SOURCE_PAIR_WEIGHT + controllerCost

  SOURCE_PAIR_WEIGHT is 10000, so a 1-step difference in source proximity
  outranks any controller distance inside a 50x50 room (controllerCost < 10000).
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

export const SOURCE_PAIR_WEIGHT = 10000;
export const CHEBYSHEV_PENALTY = 1000;
export const MIN_SOURCES = 2;

export interface FirstRoomScoreInput {
  sources: TilePos[];
  controller?: TilePos | null;
  getTerrain: (x: number, y: number) => number;
  plainCost?: number;
  swampCost?: number;
}

export interface FirstRoomScore {
  eligible: boolean;
  rankCost: number;
  sourceCount: number;
  sourcePairCost: number;
  controllerCost: number;
  usedChebyshev: boolean;
  pair?: [TilePos, TilePos];
  rendezvous?: TilePos;
  reason?: string;
}

function walkOrChebyshev(
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

function findClosestPair(
  sources: TilePos[],
  maps: number[][]
): { i: number; j: number; cost: number; usedChebyshev: boolean } | null {
  let best: { i: number; j: number; cost: number; usedChebyshev: boolean } | null = null;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const walked = walkOrChebyshev(maps[i], sources[i], sources[j]);
      if (!best || walked.cost < best.cost || (walked.cost === best.cost && walked.usedChebyshev === false && best.usedChebyshev)) {
        best = { i, j, cost: walked.cost, usedChebyshev: walked.usedChebyshev };
      }
    }
  }
  return best;
}

function findRendezvous(
  mapA: number[],
  mapB: number[],
  mapController: number[]
): { pos: TilePos; controllerCost: number } | null {
  let bestSum = UNREACHABLE_COST;
  let bestController = UNREACHABLE_COST;
  let bestPos: TilePos | null = null;

  for (let y = 0; y < ROOM_SIZE; y++) {
    for (let x = 0; x < ROOM_SIZE; x++) {
      const idx = tileIndex(x, y);
      const a = mapA[idx];
      const b = mapB[idx];
      const ctrl = mapController[idx];
      if (a === UNREACHABLE_COST || b === UNREACHABLE_COST || ctrl === UNREACHABLE_COST) continue;
      const sum = a + b;
      if (sum < bestSum || (sum === bestSum && ctrl < bestController)) {
        bestSum = sum;
        bestController = ctrl;
        bestPos = { x, y };
      }
    }
  }

  if (!bestPos) return null;
  return { pos: bestPos, controllerCost: bestController };
}

function ineligible(sourceCount: number, reason: string): FirstRoomScore {
  return {
    eligible: false,
    rankCost: Number.POSITIVE_INFINITY,
    sourceCount,
    sourcePairCost: Number.POSITIVE_INFINITY,
    controllerCost: Number.POSITIVE_INFINITY,
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

  if (!controller) return ineligible(sourceCount, "no controller");
  if (sourceCount < MIN_SOURCES) return ineligible(sourceCount, `fewer than ${MIN_SOURCES} sources`);

  const sourceMaps = sources.map(source => computeWalkCostMap(source, getTerrain, undefined, plainCost, swampCost));
  const controllerMap = computeWalkCostMap(controller, getTerrain, undefined, plainCost, swampCost);

  const pair = findClosestPair(sources, sourceMaps);
  if (!pair) return ineligible(sourceCount, "no source pair");

  const sourceA = sources[pair.i];
  const sourceB = sources[pair.j];
  const rendezvous = findRendezvous(sourceMaps[pair.i], sourceMaps[pair.j], controllerMap);

  let controllerCost: number;
  let usedChebyshev = pair.usedChebyshev;
  let rendezvousPos: TilePos | undefined;

  if (rendezvous) {
    controllerCost = rendezvous.controllerCost;
    rendezvousPos = rendezvous.pos;
  } else {
    const aToCtrl = walkOrChebyshev(sourceMaps[pair.i], sourceA, controller);
    const bToCtrl = walkOrChebyshev(sourceMaps[pair.j], sourceB, controller);
    controllerCost = aToCtrl.cost + bToCtrl.cost;
    usedChebyshev = usedChebyshev || aToCtrl.usedChebyshev || bToCtrl.usedChebyshev;
  }

  const rankCost = pair.cost * SOURCE_PAIR_WEIGHT + controllerCost;
  return {
    eligible: true,
    rankCost,
    sourceCount,
    sourcePairCost: pair.cost,
    controllerCost,
    usedChebyshev,
    pair: [sourceA, sourceB],
    rendezvous: rendezvousPos
  };
}

export function compareFirstRoomScores(a: FirstRoomScore, b: FirstRoomScore): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.rankCost !== b.rankCost) return a.rankCost - b.rankCost;
  if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
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
