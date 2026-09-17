/*
  First-room score.

  Pass-1 (coarse CPU filter): midpoint of sources+controller, swampCost=5,
  E = sources * 10, score = E / (D + 1). May use a geometric midpoint that is
  not a valid STRUCTURE_SPAWN tile.

  Pass-2 (published ranking, top N pass-1 rooms only): spiral from the
  sources+controller midpoint to the first placeable STRUCTURE_SPAWN tile,
  then hill-climb the 8-neighbor ring until score2 stops improving (local
  optimum; scores cached per tile). Swamp treated as plain (roads make swamp
  negligible soon after start). E2 = 10 * H where H is the sum of open harvest
  seats. D2 is walk cost from that spawn to each source's adjacent harvest tile
  plus the controller. Adjacent-room terms are applied after the spawn is chosen:
  score2 = (E2 + OPPORTUNITY_WEIGHT * opportunity) / (D2 + 1 + DANGER_WEIGHT * danger).
  Spiral + hill-climb still maximise E2 / (D2 + 1) and do not move to dodge or
  chase neighbors.

  E2 = 10*H is a first-spawn / early-game multi-miner proxy. Add-on spawns later
  should use a different weighting (out of scope).

  Skip rooms with no controller, owned/NPC controllers, or reservations.
  Require ≥2 energy sources. Minerals are not in E/E2; they only block spawn.
*/

import {
  NeighborDangerEntry,
  NeighborRoomIntel,
  applyNeighborTermsToScore2,
  scoreAdjacentNeighbors
} from "./firstRoomDanger";
import {
  PLAIN_WALK_COST,
  ROOM_SIZE,
  SWAMP_WALK_COST,
  TilePos,
  UNREACHABLE_COST,
  chebyshevDistance,
  computeWalkCostMap,
  countWalkableNeighbors,
  hillClimbBestTile,
  isValidSpawnTile,
  spiralToPlaceableSpawn,
  tileIndex
} from "./spawnPlacement";

export type { NeighborDangerEntry, NeighborRoomIntel };

export const MIN_SOURCES = 2;
export const SCORE_EPSILON = 1;
export const CHEBYSHEV_PENALTY = 1000;
export const DEFAULT_SOURCE_ENERGY_CAPACITY = 3000;
export const DEFAULT_ENERGY_REGEN_TIME = 300;

/** Roads make swamp cheap later; pass-2 therefore treats swamp as plain. */
export const PASS2_SWAMP_COST = PLAIN_WALK_COST;

/**
 * First-spawn energy proxy: 10 e/tick per open harvest seat
 * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME). Later add-on spawns use a
 * different weighting (out of scope).
 */
export const FIRST_SPAWN_ENERGY_PER_SEAT = DEFAULT_SOURCE_ENERGY_CAPACITY / DEFAULT_ENERGY_REGEN_TIME;

const TERRAIN_WALL = 1;

export interface FirstRoomScoreInput {
  sources: TilePos[];
  controller?: TilePos | null;
  getTerrain: (x: number, y: number) => number;
  plainCost?: number;
  swampCost?: number;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
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

/**
 * Walk cost from a flood-fill origin to dest. Unwalkable dest (source/controller)
 * uses the cheapest adjacent tile; fully unreachable dests get penalized Chebyshev.
 */
export function walkCostToPoint(
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

  if (input.reserved) return ineligible(sourceCount, "reserved");
  if (isOwnedByOther(input.owner, input.my)) return ineligible(sourceCount, "owned");
  if (!controller) return ineligible(sourceCount, "no controller");
  if (sourceCount < MIN_SOURCES) return ineligible(sourceCount, `fewer than ${MIN_SOURCES} sources`);

  const points: TilePos[] = sources.concat([controller]);
  const midpoint = snapToWalkable(averageMidpoint(points), getTerrain);
  const map = computeWalkCostMap(midpoint, getTerrain, undefined, plainCost, swampCost);

  let walkCost = 0;
  let usedChebyshev = false;
  for (const point of points) {
    const walked = walkCostToPoint(map, midpoint, point);
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

/**
 * Pass-1 layout score with ownership/reservation ignored. Used for neighbor
 * opportunity: a hostile room can still be a useful expansion if its sources
 * and controller are compact. Unscorable layouts (no controller, <2 sources)
 * return eligible=false / score 0.
 */
export function scoreRoomLayout(input: FirstRoomScoreInput): FirstRoomScore {
  return scoreFirstRoom({
    ...input,
    owner: undefined,
    my: undefined,
    reserved: false
  });
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

/*
  Pass-2 (spawn-precise). Run only on the top N pass-1 rooms (default 10).

  Spawn search (not a full-room / radius-12/25 scan):
  1. Naive midpoint of sources+controller (same as pass-1 center).
  2. Spiral outward until the first valid STRUCTURE_SPAWN tile (not wall, edge,
     source, mineral, controller; must be placeable).
  3. Score that spawn (swamp=plain, D2, score2).
  4. Score the 8-neighbor ring of placeable tiles; cache by tile so overlapping
     rings never re-path the same coordinate.
  5. If a neighbor is better, move there and repeat.
  6. Stop at a local optimum. A better spawn farther away may exist.

  Swamp cost = plain cost (roads cancel swamp shortly after start).
  H = sum of open harvest seats (walkable 8-adjacent tiles per energy source).
  E2 = H * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME)  // typically 10; first spawn only
  D2 = sum of walk costs from that spawn to each source (adjacent tile) + controller
  energyScore2 = E2 / (D2 + SCORE_EPSILON)
  danger = sum of occupied-neighbor penalties (see firstRoomDanger.ts)
  opportunity = sum of pass1(neighbor) / (walk(spawn → their controller) + eps)
  score2 = (E2 + OPPORTUNITY_WEIGHT * opportunity)
         / (D2 + SCORE_EPSILON + DANGER_WEIGHT * danger)
*/

export interface HarvestSeatCount {
  x: number;
  y: number;
  seats: number;
}

export interface FirstRoomPathLeg {
  to: "source" | "controller";
  x: number;
  y: number;
  cost: number;
  seat?: TilePos;
}

export interface FirstRoomPass2Input {
  sources: TilePos[];
  controller?: TilePos | null;
  getTerrain: (x: number, y: number) => number;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  /** Extra tiles that cannot hold a spawn / be walked (e.g. minerals). Not scored. */
  blockedTiles?: TilePos[];
  plainCost?: number;
  swampCost?: number;
  sourceEnergyCapacity?: number;
  energyRegenTime?: number;
  /** Candidate room name; used to name the 8 adjacent rooms for danger. */
  roomName?: string;
  /** Occupancy / spawn intel for adjacent rooms. Missing ⇒ empty (no penalty). */
  neighbors?: NeighborRoomIntel[];
  /** Cardinal exits when the room name cannot be parsed (e.g. sim). */
  exits?: string[] | null;
}

export interface FirstRoomPass2Score {
  eligible: boolean;
  spawnPos?: TilePos;
  H: number;
  E2: number;
  D2: number;
  /** E2 / (D2 + 1) before neighbor opportunity/danger. */
  energyScore2?: number;
  danger?: number;
  opportunity?: number;
  neighbors?: NeighborDangerEntry[];
  score2: number;
  harvestSeats: HarvestSeatCount[];
  legs?: FirstRoomPathLeg[];
  usedChebyshev: boolean;
  reason?: string;
}

function blockedSet(tiles: TilePos[]): Set<number> {
  const blocked = new Set<number>();
  for (const tile of tiles) blocked.add(tileIndex(tile.x, tile.y));
  return blocked;
}

export function countHarvestSeats(
  source: TilePos,
  getTerrain: (x: number, y: number) => number,
  isWalkBlocked?: (x: number, y: number) => boolean
): number {
  return countWalkableNeighbors(source.x, source.y, getTerrain, isWalkBlocked);
}

function cheapestAdjacentSeat(
  map: number[],
  dest: TilePos,
  getTerrain: (x: number, y: number) => number,
  isWalkBlocked?: (x: number, y: number) => boolean
): { cost: number; seat: TilePos } | null {
  let bestCost = UNREACHABLE_COST;
  let seat: TilePos | undefined;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = dest.x + dx;
      const ny = dest.y + dy;
      if (nx < 0 || ny < 0 || nx >= ROOM_SIZE || ny >= ROOM_SIZE) continue;
      if (getTerrain(nx, ny) === TERRAIN_WALL) continue;
      if (isWalkBlocked?.(nx, ny)) continue;
      const cost = map[tileIndex(nx, ny)];
      if (cost < bestCost) {
        bestCost = cost;
        seat = { x: nx, y: ny };
      }
    }
  }
  if (bestCost === UNREACHABLE_COST || !seat) return null;
  return { cost: bestCost, seat };
}

function ineligiblePass2(harvestSeats: HarvestSeatCount[], reason: string): FirstRoomPass2Score {
  const H = harvestSeats.reduce((sum, entry) => sum + entry.seats, 0);
  return {
    eligible: false,
    H,
    E2: energyPerTick(H),
    D2: Number.POSITIVE_INFINITY,
    energyScore2: 0,
    danger: 0,
    opportunity: 0,
    neighbors: [],
    score2: 0,
    harvestSeats,
    usedChebyshev: false,
    reason
  };
}

type Pass2SpawnEval =
  | { ok: true; D2: number; score2: number; legs: FirstRoomPathLeg[] }
  | { ok: false; reason: string };

function evaluatePass2AtSpawn(
  spawnPos: TilePos,
  sources: TilePos[],
  controller: TilePos,
  getTerrain: (x: number, y: number) => number,
  isBlocked: (x: number, y: number) => boolean,
  plainCost: number,
  swampCost: number,
  E2: number
): Pass2SpawnEval {
  const map = computeWalkCostMap(spawnPos, getTerrain, isBlocked, plainCost, swampCost);
  const legs: FirstRoomPathLeg[] = [];
  let D2 = 0;

  for (const source of sources) {
    const walked = cheapestAdjacentSeat(map, source, getTerrain, isBlocked);
    if (!walked) return { ok: false, reason: "unreachable source" };
    D2 += walked.cost;
    legs.push({ to: "source", x: source.x, y: source.y, cost: walked.cost, seat: walked.seat });
  }

  const toController = cheapestAdjacentSeat(map, controller, getTerrain, isBlocked);
  if (!toController) return { ok: false, reason: "unreachable controller" };
  D2 += toController.cost;
  legs.push({
    to: "controller",
    x: controller.x,
    y: controller.y,
    cost: toController.cost,
    seat: toController.seat
  });

  return { ok: true, D2, score2: E2 / (D2 + SCORE_EPSILON), legs };
}

function neighborsWithLayoutScores(neighbors: NeighborRoomIntel[] | undefined): NeighborRoomIntel[] | undefined {
  if (!neighbors) return neighbors;
  return neighbors.map(neighbor => {
    if (typeof neighbor.pass1Score === "number") return neighbor;
    if (!neighbor.getTerrain || !neighbor.controller || !neighbor.sources || neighbor.sources.length < MIN_SOURCES) {
      return neighbor;
    }
    const layout = scoreRoomLayout({
      sources: neighbor.sources,
      controller: neighbor.controller,
      getTerrain: neighbor.getTerrain
    });
    return { ...neighbor, pass1Score: layout.eligible ? layout.score : 0 };
  });
}

export function scoreFirstRoomPass2(input: FirstRoomPass2Input): FirstRoomPass2Score {
  const { sources, getTerrain } = input;
  const controller = input.controller ?? null;
  const plainCost = input.plainCost ?? PLAIN_WALK_COST;
  const swampCost = input.swampCost ?? PASS2_SWAMP_COST;
  const occupancy = blockedSet((input.blockedTiles ?? []).concat(sources, controller ? [controller] : []));
  const isBlocked = (x: number, y: number) => occupancy.has(tileIndex(x, y));

  const harvestSeats = sources.map(source => ({
    x: source.x,
    y: source.y,
    seats: countHarvestSeats(source, getTerrain, isBlocked)
  }));
  const H = harvestSeats.reduce((sum, entry) => sum + entry.seats, 0);
  const sourceCount = sources.length;

  if (input.reserved) return ineligiblePass2(harvestSeats, "reserved");
  if (isOwnedByOther(input.owner, input.my)) return ineligiblePass2(harvestSeats, "owned");
  if (!controller) return ineligiblePass2(harvestSeats, "no controller");
  if (sourceCount < MIN_SOURCES) {
    return ineligiblePass2(harvestSeats, `fewer than ${MIN_SOURCES} sources`);
  }

  const origin = averageMidpoint(sources.concat([controller]));
  const start = spiralToPlaceableSpawn(origin, getTerrain, isBlocked, isBlocked);
  if (!start) return ineligiblePass2(harvestSeats, "no placeable spawn");
  if (!isValidSpawnTile(start.x, start.y, getTerrain, isBlocked, isBlocked)) {
    return ineligiblePass2(harvestSeats, "no placeable spawn");
  }

  const E2 = energyPerTick(H, input.sourceEnergyCapacity, input.energyRegenTime);
  const evals = new Map<number, Pass2SpawnEval>();

  const scoreTile = (pos: TilePos): number | null => {
    const idx = tileIndex(pos.x, pos.y);
    let evaluated = evals.get(idx);
    if (!evaluated) {
      evaluated = evaluatePass2AtSpawn(
        pos,
        sources,
        controller,
        getTerrain,
        isBlocked,
        plainCost,
        swampCost,
        E2
      );
      evals.set(idx, evaluated);
    }
    return evaluated.ok ? evaluated.score2 : null;
  };

  const climbed = hillClimbBestTile({
    start,
    isPlaceable: (x, y) => isValidSpawnTile(x, y, getTerrain, isBlocked, isBlocked),
    scoreTile
  });

  const startEval = evals.get(tileIndex(start.x, start.y));
  if (!climbed) {
    const reason = startEval && !startEval.ok ? startEval.reason : "no placeable spawn";
    return ineligiblePass2(harvestSeats, reason);
  }

  const best = evals.get(tileIndex(climbed.pos.x, climbed.pos.y));
  if (!best || !best.ok) {
    const reason = best && !best.ok ? best.reason : "no placeable spawn";
    return ineligiblePass2(harvestSeats, reason);
  }

  const energyScore2 = best.score2;
  const neighborTerms =
    input.roomName && climbed.pos
      ? scoreAdjacentNeighbors({
          roomName: input.roomName,
          spawnPos: climbed.pos,
          getTerrain,
          neighbors: neighborsWithLayoutScores(input.neighbors),
          exits: input.exits
        })
      : { danger: 0, opportunity: 0, neighbors: [] };
  const score2 = applyNeighborTermsToScore2(
    E2,
    best.D2,
    neighborTerms.danger,
    neighborTerms.opportunity,
    { epsilon: SCORE_EPSILON }
  );

  return {
    eligible: true,
    spawnPos: climbed.pos,
    H,
    E2,
    D2: best.D2,
    energyScore2,
    danger: neighborTerms.danger,
    opportunity: neighborTerms.opportunity,
    neighbors: neighborTerms.neighbors,
    score2,
    harvestSeats,
    legs: best.legs,
    usedChebyshev: false
  };
}

export function compareFirstRoomPass2Scores(a: FirstRoomPass2Score, b: FirstRoomPass2Score): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.score2 !== b.score2) return b.score2 - a.score2;
  if (a.H !== b.H) return b.H - a.H;
  if (a.D2 !== b.D2) return a.D2 - b.D2;
  return 0;
}

export interface NamedRoomPass2Input extends FirstRoomPass2Input {
  roomName: string;
}

export interface RankedFirstRoomPass2 extends FirstRoomPass2Score {
  roomName: string;
}

export function rankFirstRoomsPass2(rooms: NamedRoomPass2Input[]): RankedFirstRoomPass2[] {
  return rooms
    .map(room => ({ roomName: room.roomName, ...scoreFirstRoomPass2(room) }))
    .sort((a, b) => {
      const byScore = compareFirstRoomPass2Scores(a, b);
      if (byScore !== 0) return byScore;
      return a.roomName.localeCompare(b.roomName);
    });
}
