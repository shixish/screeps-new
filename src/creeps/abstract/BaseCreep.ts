import { countCreepParts, creepHasParts } from "utils/creeps";
export class BaseCreep extends Creep {
  constructor(creep:Creep) {
    super(creep.id);
  }

  canWork(){
    // return Boolean(this.body.find(obj=>obj.type === WORK && obj.hits > 0));
    return creepHasParts(this, [WORK]);
  }

  canStore(){
    return this.store.getFreeCapacity() > 0;
  }

  get amountMinedPerTick(){
    if (this.memory.amountMinedPerTick === undefined) this.memory.amountMinedPerTick = countCreepParts(this, WORK)*2;
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
    }else{
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
    const structure = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: structure=>structure.hits < structure.hitsMax
    });
    if (!structure) return false;
    const action = this.repair(structure);
    return this.respondToActionCode(action, structure);
  }

  startStoring():boolean{
    const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) return false;
    if (spawn.store.getUsedCapacity(RESOURCE_ENERGY) === spawn.store.getCapacity(RESOURCE_ENERGY)) return false;
    const action = this.transfer(spawn, RESOURCE_ENERGY);
    return this.respondToActionCode(action, spawn);
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
    if (canWork && this.rememberAction(this.startMining, 'mining')) return;

    if (this.store.getUsedCapacity(RESOURCE_ENERGY) > 0){ //Do something with the energy
      if (this.rememberAction(this.startStoring, 'storing')) return;
      if (canWork && this.rememberAction(this.startRepairing, 'repairing')) return;
      if (canWork && this.rememberAction(this.startBuilding, 'building')) return;
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
    }

    delete this.memory.action; // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
  }
}
