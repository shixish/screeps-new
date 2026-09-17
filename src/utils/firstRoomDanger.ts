/*
  Pass-2 neighbor danger (applied after spawn hill-climb; does not move the spawn).

  Adjacent rooms = 8-name Chebyshev ring. If the candidate name does not parse
  (e.g. "sim"), fall back to cardinal Game.map.describeExits.

  Empty / unowned / reserved-only neighbors: penalty 0.
  Invader, Source Keeper, or SK-sector rooms: NPC_DANGER_PENALTY (constant;
  not scaled by a fake high RCL — they do not push unless provoked).
  Player-owned: (controllerLevel + LEVEL_BIAS) / (distance + DIST_EPS).
    Closer enemy spawn ⇒ larger penalty. Higher RCL ⇒ larger penalty.

  Distance (walk-cost units, swamp=plain like the rest of pass-2):
    cardinal: walk(our spawn → exit toward them) + EXIT_STEP + remoteLeg
    diagonal: min(the two cardinal exits) + EXIT_STEP + INTERMEDIATE_ROOM_COST
              + EXIT_STEP + remoteLeg
    remoteLeg: walk(their entrance → their spawn) when spawn+terrain are known;
               Chebyshev to the entrance edge when spawn (or controller as a
               spawn proxy) coords are known; UNKNOWN_SPAWN_DIST when not visible.

  Fold-in (keeps score2 positive and comparable; danger=0 matches E2/(D2+1)):
    score2 = E2 / (D2 + 1 + DANGER_WEIGHT * sum(penalty_i))
*/

import {
  PLAIN_WALK_COST,
  ROOM_SIZE,
  TilePos,
  UNREACHABLE_COST,
  chebyshevDistance,
  computeWalkCostMap,
  tileIndex
} from "./spawnPlacement";
import { RoomXY, adjacentRoomNames, isSourceKeeperRoom, parseRoomName } from "./roomNames";

/** So RCL 1 is still a real long-term threat, not ~0. */
export const DANGER_LEVEL_BIAS = 2;
/** Avoid exploding when the enemy spawn sits on the shared exit. */
export const DANGER_DIST_EPS = 10;
/** Denominator weight; one nearby RCL 8 should reorder similar rooms, not dump a gem. */
export const DANGER_WEIGHT = 10;
/** Constant per Invader / Source Keeper / SK-sector neighbor. */
export const NPC_DANGER_PENALTY = 0.06;
/** Fallback walk inside their room when their spawn is not visible (≈ room center). */
export const UNKNOWN_SPAWN_DIST = 25;
/** One extra tile to step across a room border. */
export const EXIT_STEP_COST = 1;
/** Documented stand-in for traversing the intermediate room on a diagonal hop. */
export const INTERMEDIATE_ROOM_COST = 25;

const NPC_OWNERS = ["Invader", "Source Keeper"] as const;

export type NeighborKind = "empty" | "player" | "npc";
export type CardinalEdge = "north" | "east" | "south" | "west";
export type DistanceFallback = "spawn-walk" | "spawn-chebyshev" | "unknown-spawn";

export interface NeighborRoomIntel {
  roomName: string;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  reservationOwner?: string | null;
  controllerLevel?: number;
  spawnPos?: TilePos | null;
  controller?: TilePos | null;
  getTerrain?: (x: number, y: number) => number;
}

export interface NeighborDangerEntry {
  roomName: string;
  kind: NeighborKind;
  penalty: number;
  controllerLevel?: number;
  distance?: number;
  distanceFallback?: DistanceFallback;
}

export interface NeighborDangerResult {
  danger: number;
  neighbors: NeighborDangerEntry[];
}

export function isNpcOwner(owner?: string | null): boolean {
  if (!owner) return false;
  if (typeof INVADERS_USERNAME === "string" && owner === INVADERS_USERNAME) return true;
  for (const npc of NPC_OWNERS) {
    if (npc === owner) return true;
  }
  return false;
}

/**
 * Occupied = player-owned or NPC/SK presence. Reserved remotes have no spawn
 * and are treated as empty. Unknown (no intel) is empty except SK-sector rooms.
 */
export function classifyNeighbor(input: {
  roomName: string;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  reservationOwner?: string | null;
}): NeighborKind {
  if (input.my) return "empty";
  if (input.owner && !isNpcOwner(input.owner)) return "player";
  if (isNpcOwner(input.owner) || isNpcOwner(input.reservationOwner)) return "npc";
  if (isSourceKeeperRoom(input.roomName)) return "npc";
  return "empty";
}

export function playerNeighborPenalty(controllerLevel: number, distance: number): number {
  const level = Math.max(0, controllerLevel);
  const dist = Math.max(0, distance);
  return (level + DANGER_LEVEL_BIAS) / (dist + DANGER_DIST_EPS);
}

export function applyDangerToScore2(
  energy: number,
  walkCost: number,
  danger: number,
  options?: { weight?: number; epsilon?: number }
): number {
  const weight = options?.weight ?? DANGER_WEIGHT;
  const epsilon = options?.epsilon ?? 1;
  return energy / (walkCost + epsilon + weight * Math.max(0, danger));
}

function roomDelta(fromName: string, toName: string): RoomXY | null {
  const from = parseRoomName(fromName);
  const to = parseRoomName(toName);
  if (!from || !to) return null;
  return { x: to.x - from.x, y: to.y - from.y };
}

function oppositeEdge(edge: CardinalEdge): CardinalEdge {
  if (edge === "north") return "south";
  if (edge === "south") return "north";
  if (edge === "east") return "west";
  return "east";
}

function cardinalEdgesForDelta(dx: number, dy: number): CardinalEdge[] {
  const edges: CardinalEdge[] = [];
  if (dx > 0) edges.push("east");
  if (dx < 0) edges.push("west");
  if (dy > 0) edges.push("north");
  if (dy < 0) edges.push("south");
  return edges;
}

function edgeTile(edge: CardinalEdge, along: number): TilePos {
  const clamped = Math.max(0, Math.min(ROOM_SIZE - 1, along));
  if (edge === "north") return { x: clamped, y: 0 };
  if (edge === "south") return { x: clamped, y: ROOM_SIZE - 1 };
  if (edge === "east") return { x: ROOM_SIZE - 1, y: clamped };
  return { x: 0, y: clamped };
}

function minCostOnEdge(map: number[], edge: CardinalEdge): number {
  let best = UNREACHABLE_COST;
  for (let along = 0; along < ROOM_SIZE; along++) {
    const tile = edgeTile(edge, along);
    const cost = map[tileIndex(tile.x, tile.y)];
    if (cost < best) best = cost;
  }
  return best;
}

function walkToEdge(origin: TilePos, edge: CardinalEdge, map: number[] | undefined): number {
  if (map) {
    const walked = minCostOnEdge(map, edge);
    if (walked !== UNREACHABLE_COST) return walked;
  }
  const target = edgeTile(edge, edge === "north" || edge === "south" ? origin.x : origin.y);
  return chebyshevDistance(origin.x, origin.y, target.x, target.y);
}

function remoteLeg(
  neighbor: NeighborRoomIntel,
  entrance: CardinalEdge
): { cost: number; fallback: DistanceFallback } {
  const spawn = neighbor.spawnPos ?? neighbor.controller ?? null;
  if (spawn && neighbor.getTerrain) {
    const map = computeWalkCostMap(spawn, neighbor.getTerrain, undefined, PLAIN_WALK_COST, PLAIN_WALK_COST);
    const walked = minCostOnEdge(map, entrance);
    if (walked !== UNREACHABLE_COST) return { cost: walked, fallback: "spawn-walk" };
  }
  if (spawn) {
    const target = edgeTile(entrance, entrance === "north" || entrance === "south" ? spawn.x : spawn.y);
    return {
      cost: chebyshevDistance(spawn.x, spawn.y, target.x, target.y),
      fallback: "spawn-chebyshev"
    };
  }
  return { cost: UNKNOWN_SPAWN_DIST, fallback: "unknown-spawn" };
}

export function estimateNeighborDistance(
  originName: string,
  spawnPos: TilePos,
  neighbor: NeighborRoomIntel,
  originMap?: number[]
): { distance: number; fallback: DistanceFallback } {
  const delta = roomDelta(originName, neighbor.roomName);
  const edges: CardinalEdge[] = delta ? cardinalEdgesForDelta(delta.x, delta.y) : ["east"];
  let bestExit = UNREACHABLE_COST;
  let bestEdge: CardinalEdge = edges[0] ?? "east";
  for (const edge of edges) {
    const cost = walkToEdge(spawnPos, edge, originMap);
    if (cost < bestExit) {
      bestExit = cost;
      bestEdge = edge;
    }
  }
  if (bestExit === UNREACHABLE_COST) bestExit = UNKNOWN_SPAWN_DIST;

  const diagonal = edges.length > 1;
  const hops = EXIT_STEP_COST + (diagonal ? INTERMEDIATE_ROOM_COST + EXIT_STEP_COST : 0);
  const remote = remoteLeg(neighbor, oppositeEdge(bestEdge));
  return { distance: bestExit + hops + remote.cost, fallback: remote.fallback };
}

export function scoreNeighborDanger(input: {
  roomName: string;
  spawnPos: TilePos;
  getTerrain: (x: number, y: number) => number;
  neighbors?: NeighborRoomIntel[];
  exits?: readonly string[] | null;
}): NeighborDangerResult {
  const names = adjacentRoomNames(input.roomName, input.exits);
  const byName = new Map((input.neighbors ?? []).map(neighbor => [neighbor.roomName, neighbor]));
  const originMap = computeWalkCostMap(input.spawnPos, input.getTerrain, undefined, PLAIN_WALK_COST, PLAIN_WALK_COST);

  let danger = 0;
  const entries: NeighborDangerEntry[] = [];

  for (const name of names) {
    const intel = byName.get(name) ?? { roomName: name };
    const kind = classifyNeighbor(intel);
    if (kind === "empty") continue;

    if (kind === "npc") {
      danger += NPC_DANGER_PENALTY;
      entries.push({ roomName: name, kind, penalty: NPC_DANGER_PENALTY });
      continue;
    }

    const level = intel.controllerLevel ?? 0;
    const estimated = estimateNeighborDistance(
      input.roomName,
      input.spawnPos,
      intel,
      originMap
    );
    const penalty = playerNeighborPenalty(level, estimated.distance);
    danger += penalty;
    entries.push({
      roomName: name,
      kind,
      penalty,
      controllerLevel: level,
      distance: estimated.distance,
      distanceFallback: estimated.fallback
    });
  }

  return { danger, neighbors: entries };
}
