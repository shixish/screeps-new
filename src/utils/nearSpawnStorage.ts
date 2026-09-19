import { getRoadTileState, isBuildableCoord, packRoadPos, RoadTileState } from "./earlyEconomy";
import { EXTENSION_POD_BLOCK_RANGE, getPlannedRoadTiles } from "./extensionPods";
import { diamondCoordinates } from "./map";
import { spawnCirculationDiagonals, spawnCirculationOuterRing, spawnCirculationPocketArms, spawnCirculationPockets } from "./spawnCirculation";

/*
  Near-spawn storage placement.

  RCL4 unlocks STRUCTURE_STORAGE and HomeFlag queues it first thing (createConstructionSitesCL4), but
  the generic diamond placer picks whatever the structure cost matrix likes best, which is regularly
  half a room away from the spawn. Storage is the room's energy hub - couriers empty into it, the spawn
  and the towers are refilled out of it, and the RCL5 link wants to sit next to it - so every tile of
  distance is paid back on every haul. It belongs in the core the pod planner already carves out
  (EXTENSION_POD_CORE_RESERVE, Manhattan 3 around the spawn), which exists for exactly this.

  The rules, in the order the search applies them:

    - Never on a circulation lane. The phase 1 X and the phase 2 ring are the only roads the core has
      (see spawnCirculation), and storage and road are mutually exclusive structures in Screeps - taking
      one of those tiles cuts the lane for good rather than sharing it.
    - Never on a tile another plan reserved: an early or exit road route, a harvest seat, the mineral pad
      or the controller container, blocked at the same radius the pod planner blocks with so the two
      planners agree on what's off limits.
    - Closest to the spawn wins. The four spawn-pod arm tiles (sx+-1, sy) / (sx, sy+-1) are the ideal:
      adjacent to the spawn, off the lanes, and each one touches three circulation road tiles, so the
      couriers get a paved approach without a single new road.
    - Among tiles at the same distance, leave the circulation extension slots (the four +-(2,2) pockets
      and their arms) alone while anything ordinary is free, and prefer the tile with the most road
      neighbours.

  Storage is also the one structure Basics build last (isLowPriorityBuild, used by BasicCreep). The site
  goes down early so couriers can start dumping into it the tick it finishes, but 30,000 energy of
  buffer must never outrank the extensions, roads and containers that raise the room's throughput.
*/

//How far from the spawn the search looks, Manhattan. 4 reaches the +-(2,2) pockets - one lattice step
//out - and stops there: further than that and the diamond placer's tile is no worse than ours.
export const NEAR_SPAWN_STORAGE_RADIUS = 4;

//Road sites placed to give a fallback tile an approach. Two is a lane in and a lane out; more than that
//and we're paving the core to reach a tile we shouldn't have picked.
export const NEAR_SPAWN_STORAGE_ROAD_SITES = 2;

type Coord = [number, number];

const ORTHOGONAL:Coord[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* Build order: storage is the one site Basics leave for last. See BasicCreep.startBuilding. */
export const isLowPriorityBuild = (structureType:StructureConstant)=>structureType === STRUCTURE_STORAGE;

/* The circulation lanes, packed: the tiles storage must never take. */
export function getSpawnCirculationTiles(sx:number, sy:number):number[]{
  return spawnCirculationDiagonals(sx, sy).concat(spawnCirculationOuterRing(sx, sy))
    .map(([x, y])=>packRoadPos(x, y));
}

/* The lattice slots placeSpawnCirculationExtensions wants: the four pockets plus each pocket's arms. */
export function getCirculationExtensionSlots(sx:number, sy:number):number[]{
  const pockets = spawnCirculationPockets(sx, sy);
  return pockets.reduce((out, [cx, cy])=>out.concat(spawnCirculationPocketArms(cx, cy)), pockets.slice())
    .map(([x, y])=>packRoadPos(x, y));
}

/*
  Candidate tiles in preference order. Purely geometric - terrain and structures are filtered in
  findNearSpawnStorageTile - so the ordering can be reasoned about (and tested) without a room.
*/
export function nearSpawnStorageSlots(sx:number, sy:number, radius = NEAR_SPAWN_STORAGE_RADIUS):Coord[]{
  const roads = getSpawnCirculationTiles(sx, sy);
  const circulationSlots = getCirculationExtensionSlots(sx, sy);
  const slots:{ coord:Coord, distance:number, reserved:number, access:number }[] = [];
  for (let dx = -radius; dx <= radius; dx++){
    for (let dy = -radius; dy <= radius; dy++){
      const distance = Math.abs(dx)+Math.abs(dy);
      if (distance === 0 || distance > radius) continue; //The spawn's own tile is never a candidate.
      const x = sx+dx, y = sy+dy;
      if (!isBuildableCoord(x, y)) continue;
      if (roads.includes(packRoadPos(x, y))) continue;
      //Only orthogonal neighbours count as an approach: a creep can reach a diagonal road tile, but it
      //has to step off the lane to do it, which is the jam the circulation plan exists to avoid.
      const access = ORTHOGONAL.filter(([ox, oy])=>roads.includes(packRoadPos(x+ox, y+oy))).length;
      slots.push({
        coord: [x, y],
        distance,
        reserved: circulationSlots.includes(packRoadPos(x, y)) ? 1 : 0,
        access,
      });
    }
  }
  slots.sort((a, b)=>(
    a.distance - b.distance ||
    a.reserved - b.reserved ||
    b.access - a.access ||
    a.coord[0] - b.coord[0] ||
    a.coord[1] - b.coord[1]
  ));
  return slots.map(({ coord })=>coord);
}

/*
  Tiles near the spawn that belong to somebody else: every road route already promised (early, exit and
  circulation - getPlannedRoadTiles) plus the harvest seats, the mineral pad and the controller
  container, blocked at EXTENSION_POD_BLOCK_RANGE like buildPodPlacementMatrix does.
*/
export function getNearSpawnStorageReservedTiles(room:Room):number[]{
  const reserved = getPlannedRoadTiles(room);
  const block = (pos:RoomPosition)=>{
    for (const [x, y] of diamondCoordinates(pos.x, pos.y, EXTENSION_POD_BLOCK_RANGE)){
      const packed = packRoadPos(x, y);
      if (!reserved.includes(packed)) reserved.push(packed);
    }
  };
  room.find(FIND_SOURCES).forEach(source=>block(source.pos));
  room.find(FIND_MINERALS).forEach(mineral=>block(mineral.pos));
  if (room.controller) block(room.controller.pos);
  return reserved;
}

const hasRoad = (room:Room, x:number, y:number)=>(
  room.lookForAt(LOOK_STRUCTURES, x, y).some(structure=>structure.structureType === STRUCTURE_ROAD) ||
  room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(site=>site.structureType === STRUCTURE_ROAD)
);

/* Free for a storage: buildable ground, nothing reserved it, nothing standing or queued on it. */
export function isFreeStorageTile(room:Room, x:number, y:number, reserved:number[]){
  if (!isBuildableCoord(x, y)) return false;
  if (reserved.includes(packRoadPos(x, y))) return false;
  if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;
  //A rampart is the one structure storage shares a tile with - createRampartConstructionSites adds it.
  if (room.lookForAt(LOOK_STRUCTURES, x, y).some(structure=>structure.structureType !== STRUCTURE_RAMPART)) return false;
  if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) return false;
  return true;
}

/* The tile the storage should go on, or undefined when every slot in the core is taken. */
export function findNearSpawnStorageTile(
  room:Room,
  spawn:StructureSpawn,
  radius = NEAR_SPAWN_STORAGE_RADIUS,
  reserved = getNearSpawnStorageReservedTiles(room),
){
  return nearSpawnStorageSlots(spawn.pos.x, spawn.pos.y, radius)
    .find(([x, y])=>isFreeStorageTile(room, x, y, reserved));
}

/* The room's storage, built or merely queued. Placement is a one-shot, so this is what gates it. */
export function hasStorage(room:Room){
  const built = room.find(FIND_MY_STRUCTURES, {
    filter: structure=>structure.structureType === STRUCTURE_STORAGE
  });
  if (built.length) return true;
  return room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: site=>site.structureType === STRUCTURE_STORAGE
  }).length > 0;
}

/*
  Storage normally lands on a tile that already touches the X or the ring, so nothing is paved here. A
  fallback tile further out can end up with no approach at all - pave the empty orthogonal neighbours in
  that case, skipping anything another plan reserved. Returns how many road sites were placed.
*/
export function placeStorageRoadAccess(
  room:Room,
  spawn:StructureSpawn,
  x:number,
  y:number,
  reserved = getNearSpawnStorageReservedTiles(room),
){
  const planned = getSpawnCirculationTiles(spawn.pos.x, spawn.pos.y).concat(getPlannedRoadTiles(room));
  const neighbours = ORTHOGONAL.map(([dx, dy])=>[x+dx, y+dy] as Coord).filter(([nx, ny])=>isBuildableCoord(nx, ny));
  //Already on a lane, planned or built: the road layer that owns those tiles will pave them.
  if (neighbours.some(([nx, ny])=>planned.includes(packRoadPos(nx, ny)) || hasRoad(room, nx, ny))) return 0;

  let placed = 0;
  for (const [nx, ny] of neighbours){
    if (placed >= NEAR_SPAWN_STORAGE_ROAD_SITES) break;
    if (reserved.includes(packRoadPos(nx, ny))) continue; //A seat, a container or somebody's route.
    if (getRoadTileState(room, packRoadPos(nx, ny)) !== RoadTileState.Missing) continue;
    if (room.createConstructionSite(nx, ny, STRUCTURE_ROAD) === OK) placed++;
  }
  return placed;
}

/*
  The one function here that touches the world, called when the build queue pops STRUCTURE_STORAGE.
  Returns true once the room's storage is placed (or was already standing/queued), false when the whole
  core is taken and the caller should fall back to the generic diamond placer.
*/
export function placeNearSpawnStorage(room:Room, spawn:StructureSpawn):boolean{
  if (hasStorage(room)) return true;
  const reserved = getNearSpawnStorageReservedTiles(room);
  const tile = findNearSpawnStorageTile(room, spawn, NEAR_SPAWN_STORAGE_RADIUS, reserved);
  if (!tile) return false;
  const [x, y] = tile;
  if (room.createConstructionSite(x, y, STRUCTURE_STORAGE) !== OK) return false;
  placeStorageRoadAccess(room, spawn, x, y, reserved);
  const distance = Math.abs(x-spawn.pos.x)+Math.abs(y-spawn.pos.y);
  console.log(`[${room.name}] storage site placed at (${x},${y}), ${distance} tiles from the spawn`);
  return true;
}
