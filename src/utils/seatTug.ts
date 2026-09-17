import { CreepRoleName } from "./constants";

/*
  Courier tug: static miners/upgraders (often 0–1 MOVE) get pulled onto their container seat by a
  courier (which already has several MOVE parts). Basics are never used as tugs.

  Same-tick protocol (intents apply together regardless of script order):
    courier: memory.tugTarget = creep.name; pull(creep); move toward seat
    static:  if adjacent courier has tugTarget===me, move(courier)
*/

const STATIC_ROLES = new Set<CreepRoleName>([CreepRoleName.Harvester, CreepRoleName.Upgrader]);

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
  if (creep.memory.seated === true) return false;
  const seat = getStaticSeatPosition(creep);
  if (!seat) return false;
  return !creep.pos.isEqualTo(seat);
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
    const candidates = courier.room.find(FIND_MY_CREEPS, { filter: needsSeatTug });
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
    return false;
  }

  //Get adjacent to the static creep first.
  if (!courier.pos.isNearTo(target)){
    courier.moveTo(target, { reusePath: 5, ignoreCreeps: false });
    return true;
  }

  //Adjacent: pull while stepping toward the seat (onto the seat if one step away).
  const pullResult = courier.pull(target);
  if (pullResult !== OK && pullResult !== ERR_NOT_IN_RANGE){
    //Can't pull (fatigue/etc.) - clear and let the static self-walk with its MOVE if any.
    delete courier.memory.tugTarget;
    return false;
  }

  if (courier.pos.isEqualTo(seat)){
    //Rare: courier is already on the seat - step off toward an open tile next to seat while pulling,
    //so the static can take the seat next tick. Prefer moving onto a neighboring open tile.
    const dirs:DirectionConstant[] = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
    for (const dir of dirs){
      const x = courier.pos.x + (dir === LEFT || dir === TOP_LEFT || dir === BOTTOM_LEFT ? -1 : dir === RIGHT || dir === TOP_RIGHT || dir === BOTTOM_RIGHT ? 1 : 0);
      const y = courier.pos.y + (dir === TOP || dir === TOP_LEFT || dir === TOP_RIGHT ? -1 : dir === BOTTOM || dir === BOTTOM_LEFT || dir === BOTTOM_RIGHT ? 1 : 0);
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      if (courier.room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
      if (courier.room.lookForAt(LOOK_CREEPS, x, y).length) continue;
      courier.move(dir);
      return true;
    }
    return true;
  }

  courier.moveTo(seat, { reusePath: 5, ignoreCreeps: false });
  return true;
}
