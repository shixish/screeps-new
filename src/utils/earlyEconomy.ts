import { getSpawnRoadPath } from "./map";

/*
  Early game economy helpers.

  Stage 1: generic Basic drones harvest for themselves and carry the energy back into the spawn.
  Stage 2: once the sources are saturated the surplus workers go into construction, and only once the
           priority roads are covered are they allowed to feed the controller.
*/

//Roads that have to be placed before anybody is allowed to feed the controller.
export interface EarlyRoadPlanMemory{
  source: number[]; //Walk paths from the spawn out to each source, plus the walkable harvest seats around them.
  controller: number[]; //Walk path from the spawn to the controller.
  complete?: boolean; //Sticky flag set once every priority tile has a road or a road construction site on it.
}

//Don't stall the controller forever if the roads somehow can't be finished.
export const CONTROLLER_DOWNGRADE_GRACE = 3000;

//Cap how many road sites we drop in a single pass so early builders aren't spread over the whole room.
export const MAX_EARLY_ROAD_SITES = 20;

const NEIGHBOR_COORDS = [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]] as const;

export const packRoadPos = (x:number, y:number)=>x*50+y;
export const unpackRoadPosX = (packed:number)=>Math.floor(packed/50);
export const unpackRoadPosY = (packed:number)=>packed%50;

export enum RoadTileState{
  Missing, //Nothing there yet, this is outstanding road work
  Pending, //A road construction site is already waiting to be built
  Satisfied, //There's a road here already, or the tile can never hold one
}

//Structures can't be built on the exit tiles, and the terrain walls aren't walkable to begin with.
const isBuildableCoord = (x:number, y:number)=>x >= 1 && y >= 1 && x <= 48 && y <= 48;

/* The walkable tiles around a source. These are the seats harvesters sit on, so they get roads too. */
export function getHarvestSeatPositions(room:Room, pos:RoomPosition){
  const terrain = room.getTerrain();
  const seats:number[] = [];
  for (const [dx, dy] of NEIGHBOR_COORDS){
    const x = pos.x + dx, y = pos.y + dy;
    if (!isBuildableCoord(x, y)) continue;
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
    seats.push(packRoadPos(x, y));
  }
  return seats;
}

/* Builds the priority road plan. Pathing is expensive so this is only ever run once per room. */
export function planEarlyRoads(room:Room, spawn:StructureSpawn, sources:CreepSourceAnchor[]):EarlyRoadPlanMemory{
  const addPos = (list:number[], x:number, y:number)=>{
    if (!isBuildableCoord(x, y)) return;
    const packed = packRoadPos(x, y);
    if (!list.includes(packed)) list.push(packed);
  };

  //Priority 1: the walk path from the spawn out to each source and the harvest surface around it.
  const source:number[] = [];
  sources.forEach(sourceAnchor=>{
    getSpawnRoadPath(spawn, sourceAnchor.pos).forEach(step=>addPos(source, step.x, step.y));
    getHarvestSeatPositions(room, sourceAnchor.pos).forEach(packed=>{
      if (!source.includes(packed)) source.push(packed);
    });
  });

  //Priority 2: the walk path from the spawn to the controller.
  const controller:number[] = [];
  if (room.controller){
    getSpawnRoadPath(spawn, room.controller.pos).forEach(step=>addPos(controller, step.x, step.y));
  }

  return { source, controller };
}

export function getEarlyRoadPlan(room:Room){
  return room.memory.earlyRoads;
}

export function ensureEarlyRoadPlan(room:Room, spawn:StructureSpawn, sources:CreepSourceAnchor[]){
  return room.memory.earlyRoads || (room.memory.earlyRoads = planEarlyRoads(room, spawn, sources));
}

export function getRoadTileState(room:Room, packed:number):RoadTileState{
  const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
  for (const structure of room.lookForAt(LOOK_STRUCTURES, x, y)){
    if (structure.structureType === STRUCTURE_ROAD) return RoadTileState.Satisfied;
    //Something else (a container for instance) already owns this tile so a road can never go here.
    if (structure.structureType !== STRUCTURE_RAMPART) return RoadTileState.Satisfied;
  }
  for (const site of room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)){
    return site.structureType === STRUCTURE_ROAD ? RoadTileState.Pending : RoadTileState.Satisfied;
  }
  if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return RoadTileState.Satisfied;
  return RoadTileState.Missing;
}

/*
  Places road construction sites for every planned tile that doesn't have one yet.
  Returns how many tiles still need a site, so 0 means this batch of road work is fully placed.
*/
export function placeEarlyRoadSites(room:Room, positions:number[], limit = MAX_EARLY_ROAD_SITES){
  let remaining = 0, placed = 0;
  for (const packed of positions){
    if (getRoadTileState(room, packed) !== RoadTileState.Missing) continue;
    if (placed >= limit){
      remaining++;
      continue;
    }
    const result = room.createConstructionSite(unpackRoadPosX(packed), unpackRoadPosY(packed), STRUCTURE_ROAD);
    if (result === OK){
      placed++;
    }else if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH){
      remaining++; //Out of construction site slots for now, try again on a later pass.
    }
    //Any other error means a road can never be placed there, so it isn't outstanding work.
  }
  return remaining;
}

const hasMissingRoadTile = (room:Room, positions:number[])=>{
  return positions.some(packed=>getRoadTileState(room, packed) === RoadTileState.Missing);
};

const roadWorkCache = new Map<Room['name'], { tick:number, complete:boolean }>();

/*
  The road-before-upgrade gate. Priority road work counts as satisfied once every planned tile either
  has a road or has a road construction site waiting on it (placing the sites is enough, the builders
  don't have to have finished them). Rooms without an early road plan - remotes, and home rooms before
  the first spawn exists - are never gated.
*/
export function isPriorityRoadWorkComplete(room:Room):boolean{
  const plan = getEarlyRoadPlan(room);
  if (!plan || plan.complete) return true;

  //Never let the controller downgrade just because we're still waiting on roads.
  const controller = room.controller;
  if (controller?.my && controller.ticksToDowngrade < CONTROLLER_DOWNGRADE_GRACE) return true;

  const cached = roadWorkCache.get(room.name);
  if (cached && cached.tick === Game.time) return cached.complete;

  //Sources first, then the controller path.
  const complete = !hasMissingRoadTile(room, plan.source) && !hasMissingRoadTile(room, plan.controller);
  if (complete) plan.complete = true;
  roadWorkCache.set(room.name, { tick: Game.time, complete });
  return complete;
}

export interface SourceSaturation{
  seats: number;
  seatsUsed: number;
  work: number;
  workUsed: number;
  saturated: boolean;
}

/*
  Source saturation rule:
  Each source has a limited number of walkable seats around it (SourceAnchor.totalSeats, capped at 3)
  and a limited useful throughput (SourceAnchor.getOptimalWorkParts(), 5 WORK == 10 energy/tick on a
  3000 energy source). The harvest drones are counted through their cohort, together with any dedicated
  harvesters already sitting on the sources. The room counts as saturated once those creeps fill every
  seat OR cover every useful WORK part - whichever limit binds first, since past either one another
  drone doesn't raise the room's harvest rate.
*/
export function getSourceSaturation(roomAudit:RoomAudit, droneCohort:Cohort):SourceSaturation{
  let seats = 0, work = 0;
  let seatsUsed = droneCohort.occupancy, workUsed = droneCohort.counts[WORK] ?? 0;
  roomAudit.sources.forEach(sourceAnchor=>{
    seats += sourceAnchor.totalSeats;
    work += sourceAnchor.getOptimalWorkParts();
    seatsUsed += sourceAnchor.harvesters.occupancy;
    workUsed += sourceAnchor.harvesters.counts[WORK] ?? 0;
  });
  return {
    seats,
    seatsUsed,
    work,
    workUsed,
    saturated: seatsUsed >= seats || workUsed >= work,
  };
}
