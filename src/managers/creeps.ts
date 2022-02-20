import { CreepRoleName, PART_COST } from "../utils/constants";
import { BasicCreep } from "creeps/BasicCreep";
import { CourierCreep } from "creeps/CourierCreep";
import { HarvesterCreep } from "creeps/HarvesterCreep";
import { ScoutCreep } from "creeps/ScoutCreep";
import { UpgraderCreep } from "creeps/UpgraderCreep";
import { ClaimerCreep } from "creeps/ClaimerCreep";
import { RemoteHarvesterCreep } from "creeps/RemoteHarvesterCreep";
import { RemoteCourierCreep } from "creeps/RemoteCourierCreep";
import { RemoteWorkerCreep } from "creeps/RemoteWorkerCreep";
import { MinerCreep } from "creeps/MinerCreep";
import { MeleeCreep } from "creeps/MeleeCreep";
import { random } from "utils/random";

export const CreepRoles = { //:Record<CreepRoleName, typeof BasicCreep>
  //Combat creeps first:
  [CreepRoleName.Melee]: MeleeCreep,

  //Room maintenance creeps:
  [CreepRoleName.Harvester]: HarvesterCreep,
  [CreepRoleName.Miner]: MinerCreep,
  [CreepRoleName.Courier]: CourierCreep,
  [CreepRoleName.Scout]: ScoutCreep,
  [CreepRoleName.Upgrader]: UpgraderCreep,
  [CreepRoleName.Basic]: BasicCreep,

  //Remote creeps last:
  [CreepRoleName.Claimer]: ClaimerCreep,
  [CreepRoleName.RemoteHarvester]: RemoteHarvesterCreep,
  [CreepRoleName.RemoteCourier]: RemoteCourierCreep,
  [CreepRoleName.RemoteWorker]: RemoteWorkerCreep,
} as const;

export const getCreepName = (roleName = 'Creep')=>{
  return roleName+'#'+random();
};

// export const getCreepPartsCost = (parts:BodyPartConstant[])=>{
//   return parts.reduce((cost, part:BodyPartConstant)=>{
//     return cost + PART_COST[part];
//   }, 0);
// };

// export const getHeighestCreepTier = (tiers:CreepTier[], room: Room, currentlyAffordable = false)=>{
//   const budget = currentlyAffordable ? room.energyAvailable : room.energyCapacityAvailable;
//   if (tiers[0].cost > budget) return null;
//   return tiers.reduce((heighestTier, currentTier)=>{
//     if (!currentTier.cost) currentTier.cost = getCreepPartsCost(currentTier.body);
//     return currentTier.cost <= budget && currentTier || heighestTier;
//   }, tiers[0]);
// };

export const creepHasParts = (creep:Creep, parts:BodyPartConstant[], activeOnly = true)=>{
  for (const b in creep.body){
    const idx = parts.indexOf(creep.body[b].type);
    if (idx !== -1 && (!activeOnly || creep.body[b].hits > 0)) parts.splice(idx, 1);
    if (parts.length === 0) return true;
  }
  return false;
};

export const creepCountPart = (creep:Creep, part:BodyPartConstant)=>{
  let count = 0;
  for (const b in creep.body){
    if (creep.body[b].type === part){
      count++;
    }
  }
  return count;
};

// export const creepCountParts = (parts:BodyPartConstant[])=>{
//   return parts.reduce((out, part)=>{
//     out[part] = out[part] === undefined ? 1 : (out[part] as number) + 1;
//     return out;
//   }, {} as CreepMemory["counts"]);
// }

export const getCreepConfig = (creep:Creep)=>{
  return CreepRoles[creep.memory.role].config;
}

export const manageCreeps = ()=>{
  const creepNamesByAuthority = Object.keys(Game.creeps).sort((a,b)=>{
    return getCreepConfig(Game.creeps[b]).authority - getCreepConfig(Game.creeps[a]).authority;
  });
  //Creeps will perform their actions in order of authority. Higher authority goes first.
  //This way more specialized creep types will perform/reserve their activities before basic creeps.
  for (const name of creepNamesByAuthority) {
    const creepObj = Game.creeps[name];
    try{
      if (creepObj.spawning) continue;
      const CreepRole = CreepRoles[creepObj.memory.role] || CreepRoles.basic;
      const creep = new CreepRole(creepObj);
      creep.work();
    }catch(e:any){
      console.log(`[${creepObj.pos.roomName}] creep ${creepObj.name} error:`, e, e.stack);
    }

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
