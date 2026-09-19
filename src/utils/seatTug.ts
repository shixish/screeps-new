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
  How long a courier may hold a claim without ever getting closer to it before the claim is dropped.
  The live failure in W1N4: a courier sat on `tugTarget` for hundreds of ticks from four tiles away
  while the 0-MOVE miner it had claimed never reached its seat and no other courier was allowed to
  take over - a held claim is also what lets a courier walk over seat tiles, so it made things worse.
*/
export const TUG_PROGRESS_TIMEOUT = 8;

/*
  Tug order between the statics. Mining outranks upgrade seating: an unseated miner is income the room
  never earns, while an unseated upgrader only delays progress that the miner has to fund anyway.
*/
const TUG_ROLE_PRIORITY:Partial<Record<CreepRoleName, number>> = {
  [CreepRoleName.Harvester]: 0,
  [CreepRoleName.Upgrader]: 1,
};

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

export function getTugRolePriority(role:CreepRoleName){
  return TUG_ROLE_PRIORITY[role] ?? TUG_ROLE_PRIORITY[CreepRoleName.Upgrader]! + 1;
}

/* Sort helper: role first (miners before upgraders), then whoever we can reach soonest. */
export function compareTugCandidates(a:{role:CreepRoleName, range:number}, b:{role:CreepRoleName, range:number}){
  return (getTugRolePriority(a.role) - getTugRolePriority(b.role)) || (a.range - b.range);
}

export function pickTugTarget(courier:Creep, candidates:Creep[]){
  return candidates.reduce((best, candidate)=>{
    if (!best) return candidate;
    const rank = compareTugCandidates(
      { role: candidate.memory.role, range: courier.pos.getRangeTo(candidate) },
      { role: best.memory.role, range: courier.pos.getRangeTo(best) },
    );
    return rank < 0 ? candidate : best;
  }, null as Creep|null);
}

/* Claim bookkeeping. tugRange is the closest we have ever been on this claim, tugProgressTick is when. */
export function claimTugTarget(memory:CreepMemory, targetName:Creep['name'], range:number, tick = Game.time){
  memory.tugTarget = targetName;
  memory.tugRange = range;
  memory.tugProgressTick = tick;
}

export function clearTugClaim(memory:CreepMemory){
  delete memory.tugTarget;
  delete memory.tugRange;
  delete memory.tugProgressTick;
}

/* Actively working the claim (closing in, or already pulling) - keeps it from going stale. */
export function markTugProgress(memory:CreepMemory, range:number, tick = Game.time){
  memory.tugRange = range;
  memory.tugProgressTick = tick;
}

export function recordTugProgress(memory:CreepMemory, range:number, tick = Game.time){
  if (memory.tugRange !== undefined && range >= memory.tugRange) return false;
  markTugProgress(memory, range, tick);
  return true;
}

/* A claim nobody is closing on is up for grabs. Claims written before progress tracking count as stale. */
export function isTugClaimStale(memory:CreepMemory, tick = Game.time){
  if (!memory.tugTarget) return false;
  if (memory.tugProgressTick === undefined) return true;
  return tick - memory.tugProgressTick > TUG_PROGRESS_TIMEOUT;
}

/* The targets other couriers still hold. Stale claims are omitted so a fresh courier can take over. */
export function getActiveTugClaims(couriers:Creep[]){
  const claimed = new Set<Creep['name']>();
  for (const courier of couriers){
    const claim = courier.memory.tugTarget;
    if (claim && !isTugClaimStale(courier.memory)) claimed.add(claim);
  }
  return claimed;
}

/*
  Hand the claim to a courier that is already standing next to the static: it can start pulling this
  tick while we are still walking. Only couriers that are free to take it count - yielding to one that
  is busy with a claim of its own would just leave the static unseated.
*/
export function shouldYieldTugClaim(courier:Creep, target:Creep, otherCouriers:Creep[]){
  if (courier.pos.isNearTo(target)) return false;
  return otherCouriers.some(other=>{
    if (!other.pos.isNearTo(target)) return false;
    if (!other.memory.tugTarget) return true; //Free hands.
    if (other.memory.tugTarget === target.name) return true; //Already on it.
    return isTugClaimStale(other.memory); //Its own claim is dead anyway.
  });
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
  const otherCouriers = courier.room.find(FIND_MY_CREEPS, {
    filter: creep=>creep.name !== courier.name && creep.memory.role === CreepRoleName.Courier,
  });

  //Prefer an existing tug target, but only while the claim is actually going somewhere.
  let target = courier.memory.tugTarget ? Game.creeps[courier.memory.tugTarget] : undefined;
  let yielded:Creep['name']|undefined;
  if (target && (!needsSeatTug(target) || target.room.name !== courier.room.name)) target = undefined;
  if (target && (isTugClaimStale(courier.memory) || shouldYieldTugClaim(courier, target, otherCouriers))){
    yielded = target.name; //Don't re-claim it below - we just handed it to somebody nearer.
    target = undefined;
  }
  if (!target) clearTugClaim(courier.memory);

  if (!target){
    //One tug per static: a second courier converging on the same seat just blocks it.
    const claimed = getActiveTugClaims(otherCouriers);
    if (yielded) claimed.add(yielded);
    const candidates = courier.room.find(FIND_MY_CREEPS, {
      filter: creep=>!claimed.has(creep.name) && needsSeatTug(creep),
    });
    //Unseated miners outrank unseated upgraders, then nearest wins (compareTugCandidates).
    target = pickTugTarget(courier, candidates) ?? undefined;
    if (!target) return false;
    claimTugTarget(courier.memory, target.name, courier.pos.getRangeTo(target));
  }else{
    recordTugProgress(courier.memory, courier.pos.getRangeTo(target));
  }

  const seat = getStaticSeatPosition(target)!;
  if (target.pos.isEqualTo(seat)){
    clearTugClaim(courier.memory);
    //If we somehow finished the tug while still sitting on the seat, vacate immediately.
    if (courier.pos.isEqualTo(seat)) stepOffTile(courier);
    return false;
  }

  //Get adjacent to the static creep first. A 0-MOVE static cannot meet us halfway, so this leg has to
  //be repathed every tick: replaying a cached path that no longer reaches the miner is exactly how a
  //courier ends up orbiting an unseated miner with the claim still held.
  if (!courier.pos.isNearTo(target)){
    if (!approachTugTarget(courier, target)){
      //No path from here - drop the claim so a courier that can reach it takes over.
      clearTugClaim(courier.memory);
      return false;
    }
    return true;
  }

  //Adjacent: pull while stepping toward the seat (onto the seat if one step away).
  const pullResult = courier.pull(target);
  if (pullResult !== OK){
    //Can't pull (fatigue/etc.) - clear and let the static self-walk with its MOVE if any.
    clearTugClaim(courier.memory);
    return false;
  }
  //Pulling is progress even though the range to the static stays at 1 the whole way to the seat.
  markTugProgress(courier.memory, courier.pos.getRangeTo(target));

  if (courier.pos.isEqualTo(seat)){
    /*
      Final step of the tug and the only tick a courier may sit on a seat: vacate it while still
      pulling, which swaps the static onto the seat this same tick. Keep tugTarget set - the static
      reads it in its own work() to accept the pull; it clears next tick once it's seated.
    */
    stepOffTile(courier, target);
    return true;
  }

  courier.moveTo(seat, { reusePath: 0 });
  return true;
}

/* Walk up to an unseated static, repathing (and then shoving through traffic) rather than giving up. */
function approachTugTarget(courier:Creep, target:Creep){
  const moving = courier.moveTo(target, { range: 1, reusePath: 0 });
  if (moving === OK || moving === ERR_TIRED) return true;
  delete courier.memory._move;
  const retry = courier.moveTo(target, { range: 1, reusePath: 0, ignoreCreeps: true });
  return retry === OK || retry === ERR_TIRED;
}
