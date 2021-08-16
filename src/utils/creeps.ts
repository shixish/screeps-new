import { BaseCreep } from "creeps/abstract/BaseCreep";
import { PartCosts } from "./constants";

export const getCreepName = ()=>{
  return 'Creep'+Math.random().toString().substr(2);
};

export type CreepTier = {
  cost?: number,
  body: BodyPartConstant[]
};

export const getCreepPartsCost = (parts:BodyPartConstant[])=>{
  return parts.reduce((cost, part:BodyPartConstant)=>{
    return cost + PartCosts[part];
  }, 0);
}

export const getHeighestCreepTier = (tiers:CreepTier[], room: Room, currentlyAffordable = false)=>{
  const budget = currentlyAffordable ? room.energyAvailable : room.energyCapacityAvailable;
  return tiers.reduce((heighestTier, currentTier)=>{
    if (!currentTier.cost) currentTier.cost = getCreepPartsCost(currentTier.body);
    return currentTier.cost <= budget && currentTier || heighestTier;
  }, tiers[0]);
}

export const getCreepObject = (creep:Creep)=>{
  // A creep may move between by different roles depending on their body part capabilities and the current need.
};

export const creepHasParts = (creep:Creep, parts:BodyPartConstant[], activeOnly = true)=>{
  for (const b in creep.body){
    const idx = parts.indexOf(creep.body[b].type);
    if (idx !== -1 && (!activeOnly || creep.body[b].hits > 0)) parts.splice(idx, 1);
    if (parts.length === 0) return true;
  }
  return false;
}

export const countCreepParts = (creep:Creep, part:BodyPartConstant)=>{
  let count = 0;
  for (const b in creep.body){
    if (creep.body[b].type === part){
      count++;
    }
  }
  return count;
}

export const manageCreeps = ()=>{
  for (const name in Game.creeps) {
    const creep = new BaseCreep(Game.creeps[name]);
    creep.work();

    // var creepDiag = debug.diag("creeps." + role);
    // Cache.add(creep);

    // console.log(courier.work);
    // courier.work();
    // if (CreepControllers[role]) {
    //   // try{
    //   let CreepController = CreepControllers[role];
    //   let ctrl = new CreepController(creep);
    //   ctrl.work();
    //   // }catch (e) {
    //   //     console.log(e);
    //   //     debug.log(e.stack);
    //   // }
    // } else {
    //   console.log("Unknown creep role:", creep, role);
    // }
    // creepDiag.stop();
  }

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    // console.log(`creep`, name, JSON.stringify(Memory.creeps[name]));
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
};
