/*
  Pass-2 adjacent-room terms (applied after spawn hill-climb; does not move the spawn).

  Adjacent rooms = 8-name Chebyshev ring. If the candidate name does not parse
  (e.g. "sim"), fall back to cardinal Game.map.describeExits.

  Danger (occupied neighbors only):
    Empty / unowned / reserved-only: penalty 0.
    Invader, Source Keeper, or SK-sector: NPC_DANGER_PENALTY (constant).
    Player-owned: (controllerLevel + LEVEL_BIAS) / (distanceToTheirSpawn + DIST_EPS).
      Distance is spawn→exit toward them + remote leg to their spawn (controller
      proxy if spawn is unseen). Closer + higher RCL ⇒ worse.

  Opportunity (any scorable neighbor layout, including hostile):
    pass-1 score of that room’s sources+controller (ownership ignored).
    If the layout is not scorable (no controller, <2 sources, no terrain): bonus 0.
    Distance is spawn→exit toward them + remote leg to their controller
    (exit-aware walk; walls that force a detour raise distance).
    Unreachable exits/controllers use BLOCKED_PATH_COST so adjacency without a
    usable path barely helps.
    bonus_i = pass1Score_neighbor / (distanceSpawnToTheirController + OPPORTUNITY_DIST_EPS)

  Fold-in (keeps score2 positive; both terms 0 matches E2/(D2+1)):
    score2 = (E2 + OPPORTUNITY_WEIGHT * opportunitySum)
           / (D2 + 1 + DANGER_WEIGHT * dangerSum)
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
/** No usable walk to an exit/controller; keeps the opportunity bonus tiny. */
export const BLOCKED_PATH_COST = 1000;
/** Same scale as pass-2 SCORE_EPSILON. */
export const OPPORTUNITY_DIST_EPS = 1;
/**
 * Numerator weight. Neighbor pass-1 scores are ~0.4–2 and distances ~20–80, so
 * opportunitySum is small; 60 lets a rich, reachable ring reorder similar rooms.
 */
export const OPPORTUNITY_WEIGHT = 60;

const NPC_OWNERS = ["Invader", "Source Keeper"] as const;

export type NeighborKind = "empty" | "player" | "npc";
export type CardinalEdge = "north" | "east" | "south" | "west";
export type DistanceFallback = "spawn-walk" | "spawn-chebyshev" | "unknown-spawn" | "blocked";

export interface NeighborRoomIntel {
  roomName: string;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  reservationOwner?: string | null;
  controllerLevel?: number;
  spawnPos?: TilePos | null;
  controller?: TilePos | null;
  sources?: TilePos[];
  /** Precomputed pass-1 layout score (ownership ignored). 0 / omitted ⇒ compute or skip. */
  pass1Score?: number;
  getTerrain?: (x: number, y: number) => number;
}

export interface NeighborDangerEntry {
  roomName: string;
  kind: NeighborKind;
  penalty: number;
  bonus?: number;
  pass1Score?: number;
  controllerLevel?: number;
  distance?: number;
  controllerDistance?: number;
  distanceFallback?: DistanceFallback;
}

export interface NeighborDangerResult {
  danger: number;
  opportunity: number;
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

export function neighborOpportunityBonus(pass1Score: number, distance: number): number {
  if (!(pass1Score > 0)) return 0;
  return pass1Score / (Math.max(0, distance) + OPPORTUNITY_DIST_EPS);
}

export function applyNeighborTermsToScore2(
  energy: number,
  walkCost: number,
  danger: number,
  opportunity = 0,
  options?: { dangerWeight?: number; opportunityWeight?: number; epsilon?: number }
): number {
  const dangerWeight = options?.dangerWeight ?? DANGER_WEIGHT;
  const opportunityWeight = options?.opportunityWeight ?? OPPORTUNITY_WEIGHT;
  const epsilon = options?.epsilon ?? 1;
  return (
    (energy + opportunityWeight * Math.max(0, opportunity)) /
    (walkCost + epsilon + dangerWeight * Math.max(0, danger))
  );
}

export function applyDangerToScore2(
  energy: number,
  walkCost: number,
  danger: number,
  options?: { weight?: number; epsilon?: number }
): number {
  return applyNeighborTermsToScore2(energy, walkCost, danger, 0, {
    dangerWeight: options?.weight,
    epsilon: options?.epsilon
  });
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

function walkToEdge(
  origin: TilePos,
  edge: CardinalEdge,
  map: number[] | undefined,
  blockedCost?: number
): number {
  if (map) {
    const walked = minCostOnEdge(map, edge);
    if (walked !== UNREACHABLE_COST) return walked;
    if (blockedCost !== undefined) return blockedCost;
  }
  const target = edgeTile(edge, edge === "north" || edge === "south" ? origin.x : origin.y);
  return chebyshevDistance(origin.x, origin.y, target.x, target.y);
}

function remoteLegTo(
  target: TilePos | null | undefined,
  getTerrain: ((x: number, y: number) => number) | undefined,
  entrance: CardinalEdge,
  blockedCost?: number
): { cost: number; fallback: DistanceFallback } {
  if (target && getTerrain) {
    const map = computeWalkCostMap(target, getTerrain, undefined, PLAIN_WALK_COST, PLAIN_WALK_COST);
    const walked = minCostOnEdge(map, entrance);
    if (walked !== UNREACHABLE_COST) return { cost: walked, fallback: "spawn-walk" };
    if (blockedCost !== undefined) return { cost: blockedCost, fallback: "blocked" };
  }
  if (target) {
    const edge = edgeTile(entrance, entrance === "north" || entrance === "south" ? target.x : target.y);
    return {
      cost: chebyshevDistance(target.x, target.y, edge.x, edge.y),
      fallback: "spawn-chebyshev"
    };
  }
  return { cost: UNKNOWN_SPAWN_DIST, fallback: "unknown-spawn" };
}

export function estimateNeighborDistance(
  originName: string,
  spawnPos: TilePos,
  neighbor: NeighborRoomIntel,
  originMap?: number[],
  options?: { target?: TilePos | null; blockedCost?: number }
): { distance: number; fallback: DistanceFallback } {
  const delta = roomDelta(originName, neighbor.roomName);
  const edges: CardinalEdge[] = delta ? cardinalEdgesForDelta(delta.x, delta.y) : ["east"];
  let bestExit = UNREACHABLE_COST;
  let bestEdge: CardinalEdge = edges[0] ?? "east";
  for (const edge of edges) {
    const cost = walkToEdge(spawnPos, edge, originMap, options?.blockedCost);
    if (cost < bestExit) {
      bestExit = cost;
      bestEdge = edge;
    }
  }
  if (bestExit === UNREACHABLE_COST) {
    bestExit = options?.blockedCost ?? UNKNOWN_SPAWN_DIST;
  }

  const diagonal = edges.length > 1;
  const hops = EXIT_STEP_COST + (diagonal ? INTERMEDIATE_ROOM_COST + EXIT_STEP_COST : 0);
  const target = options?.target !== undefined ? options.target : neighbor.spawnPos ?? neighbor.controller;
  const remote = remoteLegTo(target, neighbor.getTerrain, oppositeEdge(bestEdge), options?.blockedCost);
  return { distance: bestExit + hops + remote.cost, fallback: remote.fallback };
}

export function scoreAdjacentNeighbors(input: {
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
  let opportunity = 0;
  const entries: NeighborDangerEntry[] = [];

  for (const name of names) {
    const intel = byName.get(name) ?? { roomName: name };
    const kind = classifyNeighbor(intel);

    let penalty = 0;
    let distance: number | undefined;
    let distanceFallback: DistanceFallback | undefined;
    let controllerLevel: number | undefined;

    if (kind === "npc") {
      penalty = NPC_DANGER_PENALTY;
    } else if (kind === "player") {
      controllerLevel = intel.controllerLevel ?? 0;
      const estimated = estimateNeighborDistance(input.roomName, input.spawnPos, intel, originMap);
      penalty = playerNeighborPenalty(controllerLevel, estimated.distance);
      distance = estimated.distance;
      distanceFallback = estimated.fallback;
    }

    let bonus = 0;
    let controllerDistance: number | undefined;
    const pass1Score = intel.pass1Score ?? 0;
    if (pass1Score > 0 && intel.controller) {
      const toController = estimateNeighborDistance(input.roomName, input.spawnPos, intel, originMap, {
        target: intel.controller,
        blockedCost: BLOCKED_PATH_COST
      });
      bonus = neighborOpportunityBonus(pass1Score, toController.distance);
      controllerDistance = toController.distance;
      if (!distanceFallback) distanceFallback = toController.fallback;
    }

    danger += penalty;
    opportunity += bonus;
    if (penalty <= 0 && bonus <= 0) continue;

    const entry: NeighborDangerEntry = { roomName: name, kind, penalty, bonus };
    if (controllerLevel !== undefined) entry.controllerLevel = controllerLevel;
    if (distance !== undefined) entry.distance = distance;
    if (controllerDistance !== undefined) entry.controllerDistance = controllerDistance;
    if (distanceFallback) entry.distanceFallback = distanceFallback;
    if (pass1Score > 0) entry.pass1Score = pass1Score;
    entries.push(entry);
  }

  return { danger, opportunity, neighbors: entries };
}

export function scoreNeighborDanger(input: {
  roomName: string;
  spawnPos: TilePos;
  getTerrain: (x: number, y: number) => number;
  neighbors?: NeighborRoomIntel[];
  exits?: readonly string[] | null;
}): NeighborDangerResult {
  return scoreAdjacentNeighbors(input);
}
