/*
  First-spawn placement.

  Walk costs match PathFinder.search with { plainCost: 1, swampCost: 5, maxRooms: 1 }
  and 8-directional movement. Flood-fill is used instead of per-tile PathFinder.search
  so a full-room optimum is CPU-safe (result is cached in RoomMemory).
*/

export const ROOM_SIZE = 50;
export const SPAWN_EDGE_MARGIN = 1;
export const PLAIN_WALK_COST = 1;
export const SWAMP_WALK_COST = 5;
export const SPAWN_MARKER_PREFIX = "place-spawn:";
export const UNREACHABLE_COST = Number.POSITIVE_INFINITY;

const TERRAIN_WALL = 1;
const TERRAIN_SWAMP = 2;

const DIR_X = [-1, 0, 1, -1, 1, -1, 0, 1];
const DIR_Y = [-1, -1, -1, 0, 0, 1, 1, 1];

export interface TilePos {
  x: number;
  y: number;
}

export interface SpawnTileScore {
  x: number;
  y: number;
  cost: number;
  usedChebyshev: boolean;
}

export interface SpawnBootstrapMemory {
  x: number;
  y: number;
  cost: number;
  usedChebyshev: boolean;
  logged?: boolean;
}

interface SpawnRoomMemory {
  spawnBootstrap?: SpawnBootstrapMemory;
}

export interface SpawnPlacementInput {
  getTerrain: (x: number, y: number) => number;
  goals: TilePos[];
  isSpawnBlocked?: (x: number, y: number) => boolean;
  isWalkBlocked?: (x: number, y: number) => boolean;
  plainCost?: number;
  swampCost?: number;
  /** When false, do not fall back to Chebyshev range if no walk path exists. */
  allowChebyshevFallback?: boolean;
}

export function spawnMarkerName(roomName: string): string {
  return `${SPAWN_MARKER_PREFIX}${roomName}`;
}

export function spawnStructureName(roomName: string): string {
  return `Spawn_${roomName}`;
}

export function tileIndex(x: number, y: number): number {
  return y * ROOM_SIZE + x;
}

export function isEdgeTile(x: number, y: number, margin = SPAWN_EDGE_MARGIN): boolean {
  return x < margin || y < margin || x > ROOM_SIZE - 1 - margin || y > ROOM_SIZE - 1 - margin;
}

export function chebyshevDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function walkCostForTerrain(terrain: number, plainCost: number, swampCost: number): number {
  if (terrain === TERRAIN_WALL) return UNREACHABLE_COST;
  if (terrain === TERRAIN_SWAMP) return swampCost;
  return plainCost;
}

/**
 * Count 8-adjacent tiles a creep can stand on (in-room, not a wall).
 * Swamp counts as a seat; `isWalkBlocked` is optional extra occupancy.
 */
export function countWalkableNeighbors(
  x: number,
  y: number,
  getTerrain: (x: number, y: number) => number,
  isWalkBlocked?: (x: number, y: number) => boolean
): number {
  let seats = 0;
  for (let i = 0; i < DIR_X.length; i++) {
    const nx = x + DIR_X[i];
    const ny = y + DIR_Y[i];
    if (nx < 0 || ny < 0 || nx >= ROOM_SIZE || ny >= ROOM_SIZE) continue;
    if (getTerrain(nx, ny) === TERRAIN_WALL) continue;
    if (isWalkBlocked?.(nx, ny)) continue;
    seats++;
  }
  return seats;
}

function hasWalkableNeighbor(
  x: number,
  y: number,
  getTerrain: (x: number, y: number) => number,
  isWalkBlocked?: (x: number, y: number) => boolean
): boolean {
  return countWalkableNeighbors(x, y, getTerrain, isWalkBlocked) > 0;
}

export function isValidSpawnTile(
  x: number,
  y: number,
  getTerrain: (x: number, y: number) => number,
  isSpawnBlocked?: (x: number, y: number) => boolean,
  isWalkBlocked?: (x: number, y: number) => boolean
): boolean {
  if (isEdgeTile(x, y)) return false;
  if (getTerrain(x, y) === TERRAIN_WALL) return false;
  if (isSpawnBlocked?.(x, y)) return false;
  return hasWalkableNeighbor(x, y, getTerrain, isWalkBlocked);
}

/**
 * Chebyshev ring around (cx, cy) at a given radius (radius 0 is the origin).
 * In-room tiles only. Order is dy, then dx, matching snap-style spirals.
 */
export function chebyshevRing(cx: number, cy: number, radius: number): TilePos[] {
  if (radius === 0) {
    if (cx < 0 || cy < 0 || cx >= ROOM_SIZE || cy >= ROOM_SIZE) return [];
    return [{ x: cx, y: cy }];
  }
  const tiles: TilePos[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) continue;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * Spiral outward from origin (Chebyshev rings) until the first valid
 * STRUCTURE_SPAWN tile. Origin itself is tried first even if it is a wall.
 */
export function spiralToPlaceableSpawn(
  origin: TilePos,
  getTerrain: (x: number, y: number) => number,
  isSpawnBlocked?: (x: number, y: number) => boolean,
  isWalkBlocked?: (x: number, y: number) => boolean
): TilePos | null {
  const maxRadius = ROOM_SIZE;
  for (let radius = 0; radius <= maxRadius; radius++) {
    const ring = chebyshevRing(origin.x, origin.y, radius);
    for (const tile of ring) {
      if (isValidSpawnTile(tile.x, tile.y, getTerrain, isSpawnBlocked, isWalkBlocked)) {
        return tile;
      }
    }
  }
  return null;
}

export interface HillClimbTileInput {
  start: TilePos;
  isPlaceable: (x: number, y: number) => boolean;
  /** Higher is better. Return null when the tile cannot be scored. */
  scoreTile: (pos: TilePos) => number | null;
}

export interface HillClimbTileResult {
  pos: TilePos;
  score: number;
  /** Times `scoreTile` ran (cache misses). */
  evaluations: number;
  /** Ring lookups satisfied by the per-tile cache. */
  cacheHits: number;
}

/**
 * Local steepest-ascent on the Chebyshev ring of radius 1 (8-neighbors).
 * Scores are cached by tile so overlapping rings never re-evaluate the same
 * coordinate. Stops when no neighbor beats the current tile (local optimum).
 */
export function hillClimbBestTile(input: HillClimbTileInput): HillClimbTileResult | null {
  const { start, isPlaceable, scoreTile } = input;
  const cache = new Map<number, number | null>();
  let evaluations = 0;
  let cacheHits = 0;

  const cachedScore = (pos: TilePos): number | null => {
    const idx = tileIndex(pos.x, pos.y);
    if (cache.has(idx)) {
      cacheHits += 1;
      const cached = cache.get(idx);
      return cached === undefined ? null : cached;
    }
    evaluations += 1;
    const scored = scoreTile(pos);
    cache.set(idx, scored);
    return scored;
  };

  if (!isPlaceable(start.x, start.y)) return null;
  const startScore = cachedScore(start);
  if (startScore === null) return null;

  let bestPos = start;
  let bestScore = startScore;
  const maxSteps = ROOM_SIZE * ROOM_SIZE;

  for (let step = 0; step < maxSteps; step++) {
    let ringBestPos = bestPos;
    let ringBestScore = bestScore;
    const ring = chebyshevRing(bestPos.x, bestPos.y, 1);
    for (const tile of ring) {
      if (!isPlaceable(tile.x, tile.y)) continue;
      const scored = cachedScore(tile);
      if (scored === null || scored <= bestScore) continue;
      if (scored > ringBestScore) {
        ringBestScore = scored;
        ringBestPos = tile;
        continue;
      }
      if (scored === ringBestScore && orthogonalTieBetter(tile, ringBestPos, bestPos)) {
        ringBestPos = tile;
      }
    }
    if (ringBestPos.x === bestPos.x && ringBestPos.y === bestPos.y) {
      return { pos: bestPos, score: bestScore, evaluations, cacheHits };
    }
    bestPos = ringBestPos;
    bestScore = ringBestScore;
  }

  return { pos: bestPos, score: bestScore, evaluations, cacheHits };
}

/** Prefer cardinal neighbors over diagonals when ring scores tie. */
function orthogonalTieBetter(candidate: TilePos, currentBest: TilePos, origin: TilePos): boolean {
  const candDist =
    (candidate.x - origin.x) * (candidate.x - origin.x) + (candidate.y - origin.y) * (candidate.y - origin.y);
  const bestDist =
    (currentBest.x - origin.x) * (currentBest.x - origin.x) +
    (currentBest.y - origin.y) * (currentBest.y - origin.y);
  if (candDist !== bestDist) return candDist < bestDist;
  if (candidate.y !== currentBest.y) return candidate.y < currentBest.y;
  return candidate.x < currentBest.x;
}

function pushHeap(heap: number[], dist: number[], node: number): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (dist[heap[parent]] <= dist[heap[i]]) break;
    const swap = heap[parent];
    heap[parent] = heap[i];
    heap[i] = swap;
    i = parent;
  }
}

function popHeap(heap: number[], dist: number[]): number | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || last === undefined) return top;
  heap[0] = last;
  let i = 0;
  let bubbling = true;
  while (bubbling) {
    const left = i * 2 + 1;
    const right = left + 1;
    let smallest = i;
    if (left < heap.length && dist[heap[left]] < dist[heap[smallest]]) smallest = left;
    if (right < heap.length && dist[heap[right]] < dist[heap[smallest]]) smallest = right;
    if (smallest === i) {
      bubbling = false;
    } else {
      const swap = heap[i];
      heap[i] = heap[smallest];
      heap[smallest] = swap;
      i = smallest;
    }
  }
  return top;
}

/**
 * Dijkstra walk-cost map from a goal. The origin may be unwalkable (sources/controller)
 * so neighbors still get a real path cost. Matches PathFinder intra-room costs.
 */
export function computeWalkCostMap(
  origin: TilePos,
  getTerrain: (x: number, y: number) => number,
  isWalkBlocked?: (x: number, y: number) => boolean,
  plainCost = PLAIN_WALK_COST,
  swampCost = SWAMP_WALK_COST
): number[] {
  const dist = new Array<number>(ROOM_SIZE * ROOM_SIZE).fill(UNREACHABLE_COST);
  const seen = new Array<boolean>(ROOM_SIZE * ROOM_SIZE).fill(false);
  const heap: number[] = [];
  const start = tileIndex(origin.x, origin.y);
  dist[start] = 0;
  pushHeap(heap, dist, start);

  while (heap.length) {
    const current = popHeap(heap, dist);
    if (current === undefined) break;
    if (seen[current]) continue;
    seen[current] = true;
    const cost = dist[current];
    const cx = current % ROOM_SIZE;
    const cy = Math.floor(current / ROOM_SIZE);

    for (let i = 0; i < DIR_X.length; i++) {
      const nx = cx + DIR_X[i];
      const ny = cy + DIR_Y[i];
      if (nx < 0 || ny < 0 || nx >= ROOM_SIZE || ny >= ROOM_SIZE) continue;
      if (getTerrain(nx, ny) === TERRAIN_WALL) continue;
      if (isWalkBlocked?.(nx, ny)) continue;
      const step = walkCostForTerrain(getTerrain(nx, ny), plainCost, swampCost);
      if (step === UNREACHABLE_COST) continue;
      const next = tileIndex(nx, ny);
      const nextCost = cost + step;
      if (nextCost < dist[next]) {
        dist[next] = nextCost;
        pushHeap(heap, dist, next);
      }
    }
  }

  return dist;
}

function scoreTile(
  x: number,
  y: number,
  goals: TilePos[],
  walkMaps: number[][] | null
): { walkCost: number; usedChebyshev: boolean } | null {
  if (walkMaps) {
    const idx = tileIndex(x, y);
    let walkCost = 0;
    for (const map of walkMaps) {
      const stepCost = map[idx];
      if (stepCost === UNREACHABLE_COST) return null;
      walkCost += stepCost;
    }
    return { walkCost, usedChebyshev: false };
  }

  let rangeCost = 0;
  for (const goal of goals) {
    rangeCost += chebyshevDistance(x, y, goal.x, goal.y);
  }
  return { walkCost: rangeCost, usedChebyshev: true };
}

export function findOptimalSpawnTile(input: SpawnPlacementInput): SpawnTileScore | null {
  const { getTerrain, goals, isSpawnBlocked, isWalkBlocked } = input;
  const plainCost = input.plainCost ?? PLAIN_WALK_COST;
  const swampCost = input.swampCost ?? SWAMP_WALK_COST;
  if (!goals.length) return null;

  const walkMaps = goals.map(goal => computeWalkCostMap(goal, getTerrain, isWalkBlocked, plainCost, swampCost));

  const pickBest = (maps: number[][] | null): SpawnTileScore | null => {
    let best: SpawnTileScore | null = null;
    for (let y = SPAWN_EDGE_MARGIN; y < ROOM_SIZE - SPAWN_EDGE_MARGIN; y++) {
      for (let x = SPAWN_EDGE_MARGIN; x < ROOM_SIZE - SPAWN_EDGE_MARGIN; x++) {
        if (!isValidSpawnTile(x, y, getTerrain, isSpawnBlocked, isWalkBlocked)) continue;
        const scored = scoreTile(x, y, goals, maps);
        if (!scored) continue;
        if (!best || scored.walkCost < best.cost) {
          best = { x, y, cost: scored.walkCost, usedChebyshev: scored.usedChebyshev };
        }
      }
    }
    return best;
  };

  const walked = pickBest(walkMaps);
  if (walked) return walked;
  if (input.allowChebyshevFallback === false) return null;
  return pickBest(null);
}

function roomMemory(room: Room): SpawnRoomMemory {
  return room.memory as SpawnRoomMemory;
}

function markBlocked(blocked: boolean[], x: number, y: number): void {
  if (x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) return;
  blocked[tileIndex(x, y)] = true;
}

export function findOptimalSpawnPosition(
  room: Room,
  options?: { plainCost?: number; swampCost?: number }
): SpawnTileScore | null {
  const controller = room.controller;
  if (!controller) return null;
  const plainCost = options?.plainCost ?? PLAIN_WALK_COST;
  const swampCost = options?.swampCost ?? SWAMP_WALK_COST;

  const sources = room.find(FIND_SOURCES);
  const goals: TilePos[] = sources.map(source => ({ x: source.pos.x, y: source.pos.y }));
  goals.push({ x: controller.pos.x, y: controller.pos.y });

  const terrain = room.getTerrain();
  const spawnBlocked = new Array<boolean>(ROOM_SIZE * ROOM_SIZE).fill(false);
  const walkBlocked = new Array<boolean>(ROOM_SIZE * ROOM_SIZE).fill(false);

  const blockSpawn = (pos: RoomPosition) => markBlocked(spawnBlocked, pos.x, pos.y);
  const blockWalk = (pos: RoomPosition) => markBlocked(walkBlocked, pos.x, pos.y);

  sources.forEach(source => {
    blockSpawn(source.pos);
    blockWalk(source.pos);
  });
  room.find(FIND_MINERALS).forEach(mineral => {
    blockSpawn(mineral.pos);
    blockWalk(mineral.pos);
  });
  blockSpawn(controller.pos);

  const walkableStructures = ["road", "container", "rampart"];
  room.find(FIND_STRUCTURES).forEach(structure => {
    blockSpawn(structure.pos);
    if (walkableStructures.indexOf(structure.structureType) === -1) {
      blockWalk(structure.pos);
    }
  });
  room.find(FIND_CONSTRUCTION_SITES).forEach(site => {
    blockSpawn(site.pos);
  });

  const tile = findOptimalSpawnTile({
    getTerrain: (x, y) => terrain.get(x, y),
    goals,
    isSpawnBlocked: (x, y) => spawnBlocked[tileIndex(x, y)],
    isWalkBlocked: (x, y) => walkBlocked[tileIndex(x, y)],
    plainCost,
    swampCost
  });
  if (!tile) return null;
  return confirmWithPathFinder(room, tile, goals, walkBlocked, plainCost, swampCost);
}

function confirmWithPathFinder(
  room: Room,
  tile: SpawnTileScore,
  goals: TilePos[],
  walkBlocked: boolean[],
  plainCost = PLAIN_WALK_COST,
  swampCost = SWAMP_WALK_COST
): SpawnTileScore {
  if (typeof PathFinder === "undefined" || !PathFinder.search) return tile;
  if (typeof PathFinder.CostMatrix !== "function") return tile;

  const matrix = new PathFinder.CostMatrix();
  for (let y = 0; y < ROOM_SIZE; y++) {
    for (let x = 0; x < ROOM_SIZE; x++) {
      if (walkBlocked[tileIndex(x, y)]) matrix.set(x, y, 255);
    }
  }

  let total = 0;
  for (const goal of goals) {
    const result = PathFinder.search(
      new RoomPosition(tile.x, tile.y, room.name),
      { pos: new RoomPosition(goal.x, goal.y, room.name), range: 1 },
      {
        maxRooms: 1,
        maxOps: 4000,
        plainCost,
        swampCost,
        roomCallback: () => matrix
      }
    );
    if (result.incomplete) return tile;
    total += result.cost;
  }
  return { ...tile, cost: total, usedChebyshev: false };
}

function roomHasMySpawn(room: Room): boolean {
  return room.find(FIND_MY_SPAWNS).length > 0;
}

function roomHasSpawnSite(room: Room): boolean {
  return (
    room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_SPAWN
    }).length > 0
  );
}

function cleanupSpawnBootstrap(room: Room): void {
  const flag = Game.flags[spawnMarkerName(room.name)];
  if (flag) flag.remove();
  const mem = roomMemory(room);
  if (mem.spawnBootstrap) delete mem.spawnBootstrap;
}

function paintSpawnMarker(room: Room, x: number, y: number): void {
  room.visual.rect(x - 0.5, y - 0.5, 1, 1, {
    fill: "transparent",
    stroke: "#ffff33",
    strokeWidth: 0.12,
    opacity: 0.9
  });
  room.visual.circle(x, y, {
    radius: 0.35,
    fill: "#ffff33",
    opacity: 0.55
  });
  room.visual.text("SPAWN", x, y - 0.65, {
    font: 0.45,
    color: "#ffff33",
    stroke: "#000000",
    strokeWidth: 0.12
  });
}

function ensureSpawnFlag(room: Room, x: number, y: number): void {
  const name = spawnMarkerName(room.name);
  const existing = Game.flags[name];
  const color = typeof COLOR_YELLOW === "undefined" ? 6 : COLOR_YELLOW;
  if (existing) {
    if (existing.pos.x !== x || existing.pos.y !== y || existing.pos.roomName !== room.name) {
      existing.setPosition(new RoomPosition(x, y, room.name));
    }
    return;
  }
  room.createFlag(x, y, name, color, color);
}

function persistSpawnBootstrap(room: Room, tile: SpawnTileScore, logged: boolean): SpawnBootstrapMemory {
  const memory: SpawnBootstrapMemory = {
    x: tile.x,
    y: tile.y,
    cost: tile.cost,
    usedChebyshev: tile.usedChebyshev,
    logged
  };
  roomMemory(room).spawnBootstrap = memory;
  return memory;
}

function logSpawnHintOnce(
  room: Room,
  tile: SpawnTileScore,
  result: ScreepsReturnCode,
  memory: SpawnBootstrapMemory
): void {
  if (memory.logged) return;
  memory.logged = true;
  const marker = spawnMarkerName(room.name);
  if (result === OK) {
    console.log(`[${room.name}] Spawn construction site placed at (${tile.x}, ${tile.y}) as ${spawnStructureName(room.name)}`);
    return;
  }
  console.log(
    `[${room.name}] Place first spawn at (${tile.x}, ${tile.y}) [walk cost ${tile.cost}]. ` +
      `createConstructionSite returned ${result} — the first spawn is UI-only on official servers/sim. ` +
      `Click the yellow flag "${marker}" (or the SPAWN marker) to place it.`
  );
}

function tryPlaceSpawn(room: Room, tile: SpawnTileScore): ScreepsReturnCode {
  const name = spawnStructureName(room.name);
  const roomResult = room.createConstructionSite(tile.x, tile.y, STRUCTURE_SPAWN, name);
  if (roomResult !== ERR_INVALID_ARGS) return roomResult;
  return new RoomPosition(tile.x, tile.y, room.name).createConstructionSite(STRUCTURE_SPAWN, name);
}

function bootstrapRoomSpawn(room: Room): void {
  const controller = room.controller;
  if (!controller) return;
  if (controller.owner && !controller.my) return;

  if (roomHasMySpawn(room)) {
    cleanupSpawnBootstrap(room);
    return;
  }
  if (roomHasSpawnSite(room)) {
    cleanupSpawnBootstrap(room);
    return;
  }

  const cached = roomMemory(room).spawnBootstrap;
  const logged = Boolean(cached?.logged);
  let tile: SpawnTileScore | null = cached
    ? { x: cached.x, y: cached.y, cost: cached.cost, usedChebyshev: cached.usedChebyshev }
    : null;

  if (!tile) {
    tile = findOptimalSpawnPosition(room);
    if (!tile) return;
    persistSpawnBootstrap(room, tile, logged);
  }

  let result = tryPlaceSpawn(room, tile);
  if (result === ERR_INVALID_TARGET || result === ERR_INVALID_ARGS) {
    delete roomMemory(room).spawnBootstrap;
    tile = findOptimalSpawnPosition(room);
    if (!tile) return;
    persistSpawnBootstrap(room, tile, logged);
    result = tryPlaceSpawn(room, tile);
  }

  const memory = roomMemory(room).spawnBootstrap ?? persistSpawnBootstrap(room, tile, logged);
  if (result === OK) {
    logSpawnHintOnce(room, tile, result, memory);
    cleanupSpawnBootstrap(room);
    return;
  }

  paintSpawnMarker(room, tile.x, tile.y);
  ensureSpawnFlag(room, tile.x, tile.y);
  logSpawnHintOnce(room, tile, result, memory);
}

/**
 * Places (or marks) the first spawn in owned/unclaimed visible rooms when none exist yet.
 * No-ops once any owned spawn is present in the empire.
 * When `preferredRoom` is visible, only that room is bootstrapped so a first-room
 * ranking can steer placement; otherwise every visible room is considered.
 */
export function bootstrapFirstSpawns(preferredRoom?: string): void {
  const empireHasSpawn = Object.keys(Game.spawns).length > 0;
  if (empireHasSpawn) {
    for (const roomName in Game.rooms) {
      cleanupSpawnBootstrap(Game.rooms[roomName]);
    }
    return;
  }

  if (preferredRoom && Game.rooms[preferredRoom]) {
    bootstrapRoomSpawn(Game.rooms[preferredRoom]);
    return;
  }

  for (const roomName in Game.rooms) {
    bootstrapRoomSpawn(Game.rooms[roomName]);
  }
}
