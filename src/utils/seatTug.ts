import { CreepRoleName } from "./constants";

/*
  Courier tug: static miners/upgraders (often 0–1 MOVE) get pulled onto their container seat by a
  courier (which already has several MOVE parts). Basics are never used as tugs.

  Same-tick protocol (intents apply together regardless of script order):
    courier: memory.tugTarget = creep.name; pull(creep); move toward seat
    static:  if adjacent courier has tugTarget===me, move(courier)
*/

const STATIC_ROLES = new Set<CreepRoleName>([CreepRoleName.Harvester, CreepRoleName.Upgrader]);
const ADJACENT_COORDS = [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]] as const;

/*
  Seat tiles are the containers a static lives on: source containers (miners) and the controller
  container (upgrader). Anybody else standing there locks the static out of its seat, so the container
  never gets filled. Cached per tick since every courier move asks for them.
*/
const seatCache = new Map<Room['name'], { tick:number, seats:RoomPosition[] }>();

export function getRoomSeatPositions(room:Room){
  const cached = seatCache.get(room.name);
  if (cached && cached.tick === Game.time) return cached.seats;
  const seats:RoomPosition[] = [];
  const addSeatsNear = (pos:RoomPosition)=>{
    pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (s):s is StructureContainer=>s.structureType === STRUCTURE_CONTAINER,
    }).forEach(container=>{
      if (!seats.some(seat=>seat.isEqualTo(container.pos))) seats.push(container.pos);
    });
  };
  room.find(FIND_SOURCES).forEach(source=>addSeatsNear(source.pos));
  //Mineral containers are deliberately left out - MinerCreep sits on those and nothing tugs it.
  if (room.controller?.my) addSeatsNear(room.controller.pos);
  seatCache.set(room.name, { tick: Game.time, seats });
  return seats;
}

export function isSeatPosition(pos:RoomPosition){
  const room = Game.rooms[pos.roomName];
  if (!room) return false;
  return getRoomSeatPositions(room).some(seat=>seat.isEqualTo(pos));
}

/* moveTo costCallback helper: seats are obstacles for anyone who isn't supposed to sit on them. */
export function blockSeatsInCostMatrix(roomName:Room['name'], costMatrix:CostMatrix){
  const room = Game.rooms[roomName];
  if (!room) return costMatrix;
  for (const seat of getRoomSeatPositions(room)) costMatrix.set(seat.x, seat.y, 255);
  return costMatrix;
}

/*
  Step off the tile we're standing on, preferring a tile that isn't another seat. `swapWith` is the
  creep we may trade places with (the tug target - pull resolves both moves together).
*/
export function stepOffTile(creep:Creep, swapWith?:Creep){
  const terrain = creep.room.getTerrain();
  let seatFallback:DirectionConstant|undefined;
  for (const [dx, dy] of ADJACENT_COORDS){
    const x = creep.pos.x + dx, y = creep.pos.y + dy;
    if (x < 1 || x > 48 || y < 1 || y > 48) continue;
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
    const blockers = creep.room.lookForAt(LOOK_CREEPS, x, y);
    if (blockers.length && (!swapWith || blockers.some(b=>b.name !== swapWith.name))) continue;
    const direction = creep.pos.getDirectionTo(x, y);
    if (isSeatPosition(new RoomPosition(x, y, creep.room.name))){
      if (!seatFallback) seatFallback = direction; //Another seat beats squatting on this one, last resort only.
      continue;
    }
    creep.move(direction);
    return true;
  }
  if (seatFallback){ creep.move(seatFallback); return true; }
  return false;
}

export function stepOffSeat(creep:Creep){
  if (!isSeatPosition(creep.pos)) return false;
  return stepOffTile(creep);
}

export function getStaticSeatPosition(creep:Creep):RoomPosition|null{
  if (creep.memory.role === CreepRoleName.Harvester){
    const source = creep.memory.anchor && Game.getObjectById(creep.memory.anchor) as Source|null;
    if (!source) return null;
    const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (s):s is StructureContainer=>s.structureType === STRUCTURE_CONTAINER,
    })[0];
    return container?.pos ?? null;
  }
  if (creep.memory.role === CreepRoleName.Upgrader){
    const controller = creep.room.controller;
    if (!controller?.my) return null;
    const container = controller.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (s):s is StructureContainer=>s.structureType === STRUCTURE_CONTAINER,
    })[0];
    return container?.pos ?? null;
  }
  return null;
}

export function needsSeatTug(creep:Creep){
  if (!STATIC_ROLES.has(creep.memory.role)) return false;
  const seat = getStaticSeatPosition(creep);
  if (!seat) return false;
  if (creep.pos.isEqualTo(seat)) return false;
  //A static with its own MOVE walks onto a free seat by itself - don't crowd the seat with a courier.
  if ((creep.memory.counts[MOVE] || 0) > 0 && !seat.lookFor(LOOK_CREEPS).length) return false;
  return true;
}

/* Called by the static creep each tick: cooperate with an adjacent courier tug. */
export function followCourierTug(creep:Creep){
  const tug = creep.pos.findInRange(FIND_MY_CREEPS, 1).find(c=>{
    return c.memory.role === CreepRoleName.Courier && c.memory.tugTarget === creep.name;
  });
  if (!tug) return false;
  creep.move(tug);
  return true;
}

/*
  Called by CourierCreep: if a static miner/upgrader in this room still needs seating, pull it onto
  its container. Returns true when this courier is busy tugging (skip normal haul this tick).
*/
export function tugStaticCreepToSeat(courier:Creep){
  //Prefer an existing tug target if still valid, otherwise pick the nearest unseated static.
  let target = courier.memory.tugTarget && Game.creeps[courier.memory.tugTarget];
  if (!target || !needsSeatTug(target) || target.room.name !== courier.room.name){
    //One tug per static: a second courier converging on the same seat just blocks it.
    const claimed = new Set<Creep['name']>();
    for (const other of courier.room.find(FIND_MY_CREEPS)){
      if (other.name === courier.name) continue;
      if (other.memory.role === CreepRoleName.Courier && other.memory.tugTarget) claimed.add(other.memory.tugTarget);
    }
    const candidates = courier.room.find(FIND_MY_CREEPS, {
      filter: creep=>!claimed.has(creep.name) && needsSeatTug(creep),
    });
    if (!candidates.length){
      delete courier.memory.tugTarget;
      return false;
    }
    target = courier.pos.findClosestByPath(candidates) || candidates[0];
    courier.memory.tugTarget = target.name;
  }

  const seat = getStaticSeatPosition(target)!;
  if (target.pos.isEqualTo(seat)){
    delete courier.memory.tugTarget;
    //If we somehow finished the tug while still sitting on the seat, vacate immediately.
    if (courier.pos.isEqualTo(seat)) stepOffTile(courier);
    return false;
  }

  //Get adjacent to the static creep first.
  if (!courier.pos.isNearTo(target)){
    courier.moveTo(target, { range: 1, reusePath: 5 });
    return true;
  }

  //Adjacent: pull while stepping toward the seat (onto the seat if one step away).
  const pullResult = courier.pull(target);
  if (pullResult !== OK){
    //Can't pull (fatigue/etc.) - clear and let the static self-walk with its MOVE if any.
    delete courier.memory.tugTarget;
    return false;
  }

  if (courier.pos.isEqualTo(seat)){
    /*
      Final step of the tug and the only tick a courier may sit on a seat: vacate it while still
      pulling, which swaps the static onto the seat this same tick. Keep tugTarget set - the static
      reads it in its own work() to accept the pull; it clears next tick once it's seated.
    */
    stepOffTile(courier, target);
    return true;
  }

  courier.moveTo(seat, { reusePath: 5 });
  return true;
}
