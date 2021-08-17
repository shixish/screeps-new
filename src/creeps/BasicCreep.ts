import { creepCountPart, creepHasParts, getCreepName, getHeighestCreepTier } from "utils/creeps";
export class BasicCreep extends Creep {
  constructor(creep:Creep) {
    super(creep.id);
  }
  static tiers:CreepTier[] = [
    {
      cost: 300,
      body: [WORK, MOVE, CARRY, MOVE, CARRY]
    },
  ];
  // static generate(spawn:StructureSpawn){
  //   const bestTier = getHeighestCreepTier(this.tiers, spawn.room);
  //   spawn.spawnCreep(bestTier.body, getCreepName(), {
  //     memory: {
  //       role: this.constructor.name
  //     }
  //   });
  // }

  canWork(){
    return Boolean(this.memory.counts.work);
  }
  canCarry(){
    return Boolean(this.memory.counts.carry);
  }
  // canStore(){
  //   return this.store.getFreeCapacity() > 0;
  // }

  get amountMinedPerTick(){
    if (this.memory.amountMinedPerTick === undefined) this.memory.amountMinedPerTick = creepCountPart(this, WORK)*2;
    return this.memory.amountMinedPerTick;
  }

  respondToActionCode(action:ScreepsReturnCode, target: RoomPosition | { pos: RoomPosition }){
    if (action === OK){
      return true;
    } else if (action === ERR_NOT_IN_RANGE){
      // this.say('Storing');
      const moving = this.moveTo(target);
      if (moving === OK) return true;
      else if (moving === ERR_TIRED){
        // this.say('Tired');
        return true;
      }
      console.log(`moving error`, moving);
    } else {
      console.log(`action error`, action);
    }
    return false;
  }

  startPickup():boolean{
    if (this.store.getFreeCapacity(RESOURCE_ENERGY) == 0) return false;
    const resource = this.pos.findClosestByRange(FIND_DROPPED_RESOURCES);
    if (resource){
      const action = this.pickup(resource);
      return this.respondToActionCode(action, resource);
    }
    const tombstone = this.pos.findClosestByRange(FIND_TOMBSTONES, {
      filter: ts=>{
        return ts.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    if (tombstone){
      const action = this.withdraw(tombstone, RESOURCE_ENERGY);
      return this.respondToActionCode(action, tombstone);
    }
    return false;
  }

  startRepairing():boolean{
    const repairable = this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: structure=>structure.structureType === STRUCTURE_ROAD && structure.hits < structure.hitsMax
    });
    if (!repairable) return false;
    const action = this.repair(repairable);
    return this.respondToActionCode(action, repairable);
  }

  startEnergizing():boolean{
    // const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    const storage = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: (structure:StructureTower)=>{
        return structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    if (!storage) return false;
    const action = this.transfer(storage, RESOURCE_ENERGY);
    return this.respondToActionCode(action, storage);
  }

  startStoring():boolean{
    // const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    const storage = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: (structure:StructureSpawn|StructureExtension)=>{
        return (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN) && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    if (!storage) return false;
    const action = this.transfer(storage, RESOURCE_ENERGY);
    return this.respondToActionCode(action, storage);
  }

  startMining():boolean{
    if (this.store.getFreeCapacity(RESOURCE_ENERGY) < this.amountMinedPerTick) return false;
    const source = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
      // filter: function (source){
      //   return source.pos.findInRange(FIND_MY_CREEPS, 2).length < 3;
      // }
    });
    if (!source) return false; //This happens if there's no path to the source (it's blocked by other workers)
    const action = this.harvest(source);
    return this.respondToActionCode(action, source);
  }

  startBuilding():boolean{
    if (this.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;
    const construction = this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
    if (!construction) return false;
    const action = this.build(construction);
    return this.respondToActionCode(action, construction);
  }

  startUpgrading():boolean{
    if (!this.room.controller) return false;
    const action = this.transfer(this.room.controller, RESOURCE_ENERGY);
    return this.respondToActionCode(action, this.room.controller);
  }

  rememberAction(callback:()=>boolean, actionName:string, overrideActions: string[] = []){
    if ((!this.memory.action || this.memory.action === actionName || overrideActions.includes(this.memory.action)) && callback.apply(this)){
      this.memory.action = actionName;
      return true;
    }else if (this.memory.action === actionName){
      delete this.memory.action;
    }
    return false;
  }

  work():any{
    if (this.spawning) return;
    // if (this.memory.action) this.say(this.memory.action);

    const canWork = this.canWork();
    if (this.rememberAction(this.startPickup, 'pickup', ['mining'])) return;

    if (this.store.getUsedCapacity(RESOURCE_ENERGY) > 0){ //Do something with the energy
      if (this.rememberAction(this.startStoring, 'storing', ['upgrading'])) return;
      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading'])) return;
      if (canWork && this.rememberAction(this.startRepairing, 'repairing')) return;
      if (canWork && this.rememberAction(this.startBuilding, 'building')) return;
      if (canWork && this.rememberAction(this.startUpgrading, 'upgrading')) return;
    }

    if (canWork && this.rememberAction(this.startMining, 'mining')) return;

    delete this.memory.action; // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
  }
}
