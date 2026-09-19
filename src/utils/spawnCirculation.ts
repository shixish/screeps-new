import { isBuildableCoord, packRoadPos, placeEarlyRoadSites, unpackRoadPosX, unpackRoadPosY } from "./earlyEconomy";
import { diamondRingCoordinates } from "./map";

/*
  Spawn circulation staging.

  The base layout is a diamond lattice: pod centres sit on the ±(2,2) lattice, a size-1 extension pod
  (centre + its four orthogonal arms) fills a centre, and the Manhattan-2 ring around a centre is that
  pod's road. Traffic around the spawn therefore has to be laid out on the same lattice, otherwise the
  first roads land on tiles the lattice wants for extension arms and every later pod gets pushed off
  the grid.

  Two phases, planned once into room memory:

    Phase 1 - the X. The four diagonals touching the spawn, (sx±1, sy±1). These are the corners of the
      spawn's own road ring, they never collide with an arm slot, and they're the first road structure
      the room ever places.

    Phase 2 - one tessellation step out. The union of the Manhattan-2 road rings of the spawn and of the
      four edge-neighbour lattice centres (sx±2, sy±2). That completes the spawn's own ring (the four
      axis tiles (sx±2, sy) / (sx, sy±2) the X doesn't cover) and draws the ring of each neighbouring
      pod, so energy can circulate all the way around the base instead of down a single lane.

  Once every phase 2 tile is a *built* road (not merely a construction site), exactly four extensions go
  into the pockets those rings enclose: the four edge-neighbour centres themselves. No fifth extension
  on the spawn tile - the spawn already owns that pod centre.
*/

export interface SpawnCirculationMemory{
  phase1: number[]; //X diagonals, packed with packRoadPos.
  phase2: number[]; //Expanded ring union, packed. Excludes everything already in phase1.
  extensions: { x:number, y:number }[]; //Pocket extensions that have actually been placed.
  roadsComplete?: boolean; //Sticky: every circulation road tile is built (or can never be built).
  extensionsPlaced?: boolean; //Sticky: all SPAWN_CIRCULATION_EXTENSIONS pockets have sites/structures.
  planned: number; //Game.time the plan was built.
}

//The lattice step. Pod centres sit on ±(2,2), so a pod's road ring is the Manhattan-2 ring.
export const SPAWN_CIRCULATION_RING = 2;

//Exactly four pockets, one per edge-neighbour lattice centre.
export const SPAWN_CIRCULATION_EXTENSIONS = 4;

//Road sites placed per pass, same budget the early road batches use.
export const MAX_SPAWN_CIRCULATION_SITES = 12;

type Coord = [number, number];

const dedupe = (coords:Coord[])=>{
  const seen:number[] = [];
  return coords.filter(([x, y])=>{
    //diamondRingCoordinates yields the axis tiles twice (dx === 0 and dy === 0 both mirror).
    const packed = x*50+y;
    if (seen.includes(packed)) return false;
    seen.push(packed);
    return true;
  });
};

/* Phase 1: the X. Lattice-compatible diagonals, never an extension arm slot. */
export function spawnCirculationDiagonals(sx:number, sy:number):Coord[]{
  return [[sx-1, sy-1], [sx-1, sy+1], [sx+1, sy-1], [sx+1, sy+1]];
}

/* A pod's road ring - the Manhattan-2 ring around a lattice centre. */
export function spawnCirculationRing(cx:number, cy:number):Coord[]{
  return dedupe([...diamondRingCoordinates(cx, cy, SPAWN_CIRCULATION_RING)] as Coord[]);
}

/* The four edge-neighbour lattice centres. These are the pockets the expanded ring encloses. */
export function spawnCirculationEdgeCentres(sx:number, sy:number):Coord[]{
  return [[sx+2, sy+2], [sx+2, sy-2], [sx-2, sy+2], [sx-2, sy-2]];
}

/*
  Phase 2 geometry: the spawn's own ring plus every edge-neighbour's ring, minus the phase 1 diagonals
  and the spawn tile itself. Purely geometric - terrain and structures are filtered in planSpawnCirculation.
*/
export function spawnCirculationOuterRing(sx:number, sy:number):Coord[]{
  const diagonals = spawnCirculationDiagonals(sx, sy).map(([x, y])=>packRoadPos(x, y));
  const spawnTile = packRoadPos(sx, sy);
  const rings = spawnCirculationEdgeCentres(sx, sy).reduce((out, [cx, cy])=>{
    return out.concat(spawnCirculationRing(cx, cy));
  }, spawnCirculationRing(sx, sy));
  return dedupe(rings).filter(([x, y])=>{
    const packed = packRoadPos(x, y);
    return packed !== spawnTile && !diagonals.includes(packed);
  });
}

/* The four extension pockets: the edge-neighbour centres themselves. */
export function spawnCirculationPockets(sx:number, sy:number):Coord[]{
  return spawnCirculationEdgeCentres(sx, sy);
}

/*
  Fallback slots for a pocket we can't build on: the pod's own arms. They sit inside the ring, so they
  never steal a circulation road tile, and they keep the extension on the lattice.
*/
export function spawnCirculationPocketArms(cx:number, cy:number):Coord[]{
  return [[cx-1, cy], [cx+1, cy], [cx, cy-1], [cx, cy+1]];
}

/* Pocket slots in preference order: every centre first, then the arms of each centre. */
export function spawnCirculationExtensionSlots(sx:number, sy:number):Coord[]{
  const pockets = spawnCirculationPockets(sx, sy);
  return dedupe(pockets.concat(pockets.reduce((out, [cx, cy])=>{
    return out.concat(spawnCirculationPocketArms(cx, cy));
  }, [] as Coord[])));
}

const canHoldRoad = (room:Room, x:number, y:number)=>{
  if (!isBuildableCoord(x, y)) return false;
  return room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL;
};

export function planSpawnCirculation(room:Room, spawn:StructureSpawn):SpawnCirculationMemory{
  const { x, y } = spawn.pos;
  const buildable = (coords:Coord[])=>coords.filter(([tx, ty])=>canHoldRoad(room, tx, ty)).map(([tx, ty])=>packRoadPos(tx, ty));
  const phase1 = buildable(spawnCirculationDiagonals(x, y));
  const phase2 = buildable(spawnCirculationOuterRing(x, y));
  return { phase1, phase2, extensions: [], planned: Game.time };
}

export function getSpawnCirculationPlan(room:Room){
  return room.memory.spawnCirculation;
}

/* Plan once per room, same sticky-memory shape as the early/exit road plans. */
export function ensureSpawnCirculationPlan(room:Room, spawn:StructureSpawn){
  return room.memory.spawnCirculation || (room.memory.spawnCirculation = planSpawnCirculation(room, spawn));
}

/*
  A circulation tile counts as *built* when an actual road structure stands on it. Tiles that can never
  hold a road (terrain wall, or something else already owns the tile) count as built too, so a blocked
  corner can't stall the extension gate forever - the same rule the priority road gate uses.
*/
export function isCirculationRoadBuilt(room:Room, packed:number){
  const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
  if (!canHoldRoad(room, x, y)) return true;
  for (const structure of room.lookForAt(LOOK_STRUCTURES, x, y)){
    if (structure.structureType === STRUCTURE_ROAD) return true;
    if (structure.structureType !== STRUCTURE_RAMPART) return true; //Tile is taken, a road can't go here.
  }
  return false;
}

export function areCirculationRoadsBuilt(room:Room, plan:SpawnCirculationMemory){
  if (plan.roadsComplete) return true;
  const complete = plan.phase1.concat(plan.phase2).every(packed=>isCirculationRoadBuilt(room, packed));
  if (complete) plan.roadsComplete = true;
  return complete;
}

/* True once every tile of the phase has a road or a road construction site on it. */
export function isCirculationPhasePlaced(room:Room, tiles:number[]){
  return placeEarlyRoadSites(room, tiles, 0) === 0;
}

const isFreeExtensionSlot = (room:Room, x:number, y:number, roadTiles:number[])=>{
  //Extensions need a bit more room than roads: keep them off the rim and off the circulation lanes.
  if (x < 2 || y < 2 || x > 47 || y > 47) return false;
  if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;
  if (roadTiles.includes(packRoadPos(x, y))) return false;
  if (room.lookForAt(LOOK_STRUCTURES, x, y).some(structure=>structure.structureType !== STRUCTURE_RAMPART)) return false;
  if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) return false;
  return true;
};

/*
  Places the four pocket extensions directly (no buildQueue / diamond placement - the pockets are
  already chosen by the lattice). Pockets that can't take one fall back to that pod's arm slots.
  Returns how many are still outstanding, so 0 means the circulation extensions are fully placed.
*/
export function placeSpawnCirculationExtensions(room:Room, spawn:StructureSpawn, plan:SpawnCirculationMemory){
  const roadTiles = plan.phase1.concat(plan.phase2);
  const placed = plan.extensions || (plan.extensions = []);
  //Drop remembered slots that lost their extension (destroyed site, decayed structure) so they refill.
  plan.extensions = placed.filter(({ x, y })=>(
    room.lookForAt(LOOK_STRUCTURES, x, y).some(structure=>structure.structureType === STRUCTURE_EXTENSION) ||
    room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(site=>site.structureType === STRUCTURE_EXTENSION)
  ));

  for (const [x, y] of spawnCirculationExtensionSlots(spawn.pos.x, spawn.pos.y)){
    if (plan.extensions.length >= SPAWN_CIRCULATION_EXTENSIONS) break;
    if (!isFreeExtensionSlot(room, x, y, roadTiles)) continue;
    if (room.createConstructionSite(x, y, STRUCTURE_EXTENSION) !== OK) continue;
    plan.extensions.push({ x, y });
  }

  const remaining = SPAWN_CIRCULATION_EXTENSIONS - plan.extensions.length;
  if (remaining <= 0) plan.extensionsPlaced = true;
  return remaining;
}

/*
  One tick of circulation staging, called from HomeFlag.work. Runs independently of the build stages so
  a room that already walked past CL1/CL2 (before this plan existed) still gets its circulation roads
  and pocket extensions instead of waiting for an RCL it may never reach.

  Order is strict: phase 1 X first, then phase 2 once the controller is RCL2, then - only once every
  circulation road is actually built - the four pocket extensions.
*/
export function advanceSpawnCirculation(room:Room, spawn:StructureSpawn){
  const plan = ensureSpawnCirculationPlan(room, spawn);
  if (plan.extensionsPlaced && plan.roadsComplete) return plan;

  if (placeEarlyRoadSites(room, plan.phase1, MAX_SPAWN_CIRCULATION_SITES) > 0) return plan;
  if ((room.controller?.level ?? 0) < 2) return plan;
  if (placeEarlyRoadSites(room, plan.phase2, MAX_SPAWN_CIRCULATION_SITES) > 0) return plan;

  //Extensions only once the lanes they sit between are finished, not merely queued.
  if (!areCirculationRoadsBuilt(room, plan)) return plan;
  if (!plan.extensionsPlaced) placeSpawnCirculationExtensions(room, spawn, plan);
  return plan;
}

const CIRCULATION_PHASE1_COLOR = '#ffdd66';
const CIRCULATION_PHASE2_COLOR = '#88ddff';
const CIRCULATION_POCKET_COLOR = '#ff99dd';

/* Mirrors drawExitRoadPlan: planned circulation lanes and the pockets they enclose, every tick. */
export function drawSpawnCirculationPlan(room:Room){
  const plan = getSpawnCirculationPlan(room);
  if (!plan) return;
  const drawTiles = (tiles:number[], color:string)=>{
    tiles.forEach(packed=>{
      const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
      const built = isCirculationRoadBuilt(room, packed);
      room.visual.circle(x, y, { radius: built ? 0.1 : 0.2, fill: color, opacity: built ? 0.15 : 0.45 });
    });
  };
  drawTiles(plan.phase1, CIRCULATION_PHASE1_COLOR);
  drawTiles(plan.phase2, CIRCULATION_PHASE2_COLOR);
  (plan.extensions ?? []).forEach(({ x, y })=>{
    room.visual.rect(x-0.4, y-0.4, 0.8, 0.8, { fill: 'transparent', stroke: CIRCULATION_POCKET_COLOR, opacity: 0.6 });
  });
}
