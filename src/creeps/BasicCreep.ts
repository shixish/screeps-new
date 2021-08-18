import { claimAmount, getClaimedAmount, tickCache } from "utils/tickCache";

export class BasicCreep extends Creep {
  canWork:boolean = Boolean(this.memory.counts.work);
  canCarry:boolean = Boolean(this.memory.counts.carry);
  biteSize:number = (this.memory.counts.work || 0)*2;

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

  get role(){
    return this.memory.role;
  }

  get currentAction(){
    return this.memory.action;
  }

  set currentAction(action:string|undefined){
    if (action && action !== this.memory.action) this.say(action);
    this.memory.action = action;
  }

  // canStore(){
  //   return this.store.getFreeCapacity() > 0;
  // }

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
    if (!this.canCarry) return false;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity == 0) return false;
    const resource = this.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
      filter: resource => getClaimedAmount(resource.id, resource.resourceType) < resource.amount
    });
    if (resource){
      const action = this.pickup(resource);
      if (action === OK){
        claimAmount(resource.id, resource.resourceType, Math.min(freeCapacity, resource.amount));
      }
      return this.respondToActionCode(action, resource);
    }
    const tombstone = this.pos.findClosestByRange(FIND_TOMBSTONES, {
      filter: ts=>{
        return ts.store.getUsedCapacity() > 0;
      }
    });
    if (tombstone){
      const resourceType = RESOURCES_ALL.find(resourceType=>{
        return tombstone.store[resourceType] > 0 && getClaimedAmount(tombstone.id, resourceType) < tombstone.store[resourceType];
      });
      if (!resourceType){
        console.error('Invalid resource type in tombstone:', JSON.stringify(tombstone.store));
        return false;
      }
      const action = this.withdraw(tombstone, resourceType);
      if (action === OK){
        claimAmount(tombstone.id, resourceType, Math.min(freeCapacity, tombstone.store[resourceType]));
      }
      return this.respondToActionCode(action, tombstone);
    }
    return false;
  }

  startTaking(){
    if (!this.canCarry) return false;
    if (this.room.energyCapacityAvailable === this.room.energyAvailable) return false;
    const resourceType = RESOURCE_ENERGY;
    const freeCapacity = this.store.getFreeCapacity(resourceType);
    if (freeCapacity === 0) return false;
    const container = this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (container:StructureContainer)=>{
        return container.structureType === STRUCTURE_CONTAINER && getClaimedAmount(container.id, resourceType) < container.store[resourceType]
      }
    });
    if (container instanceof StructureContainer){
      const action = this.withdraw(container, resourceType);
      if (action === OK){
        claimAmount(container.id, resourceType, Math.min(freeCapacity, container.store[resourceType]));
      }
      return this.respondToActionCode(action, container);
    }
    return false;
  }

  startSpreading(){
    const resourceType = RESOURCE_ENERGY;
    if (this.canWork) return false; //If it's a worker don't bother giving away your resources
    const target = this.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: creep=>{
        return creep.store.getUsedCapacity(resourceType) + getClaimedAmount(creep.id, resourceType) < creep.store.getCapacity(resourceType)
      }
    });
    if (!target) return false;
    const action = this.transfer(target, resourceType);
    if (action === OK){
      claimAmount(target.id, resourceType, Math.min(target.store.getFreeCapacity(resourceType), this.store[resourceType]));
    }
    return this.respondToActionCode(action, target);
  }

  startRepairing():boolean{
    if (!this.canWork) return false;
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
    if (!this.canWork) return false;
    const canCarry = this.canCarry;
    if (canCarry && this.store.getFreeCapacity(RESOURCE_ENERGY) < this.biteSize) return false;
    const source = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
      // filter: function (source){
      //   return source.pos.findInRange(FIND_MY_CREEPS, 2).length < 3;
      // }
    });
    if (!source) return false; //This happens if there's no path to the source (it's blocked by other workers)
    const action = this.harvest(source);
    if (action === OK && !canCarry){
      // const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
      //   filter: (structure)=>structure.structureType === STRUCTURE_CONTAINER,
      // });
      // containers.reduce((available, container)=>{}, )
      // this.pos.getRangeTo()
    }
    return this.respondToActionCode(action, source);
  }

  startBuilding():boolean{
    if (!this.canWork) return false;
    if (this.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;
    const construction = this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
    if (!construction) return false;
    const action = this.build(construction);
    return this.respondToActionCode(action, construction);
  }

  startUpgrading():boolean{
    if (!this.canWork) return false;
    if (!this.room.controller) return false;
    const action = this.transfer(this.room.controller, RESOURCE_ENERGY);
    return this.respondToActionCode(action, this.room.controller);
  }

  rememberAction(callback:()=>boolean, actionName:string, overrideActions: string[] = []){
    if ((!this.currentAction || this.currentAction === actionName || overrideActions.includes(this.currentAction)) && callback.apply(this)){
      this.currentAction = actionName;
      return true;
    }else if (this.currentAction === actionName){
      this.currentAction = undefined;
    }
    return false;
  }

  work():any{
    if (this.spawning) return;

    // if (this.role === 'basic'){
    //   if (this.currentAction) this.say(this.currentAction);
    // }

    if (this.rememberAction(this.startPickup, 'pickup', ['mining'])) return;
    if (this.rememberAction(this.startTaking, 'taking', ['mining'])) return;

    if (this.store.getUsedCapacity(RESOURCE_ENERGY) > 0){ //Do something with the energy
      if (this.rememberAction(this.startStoring, 'storing', ['upgrading'])) return;
      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading'])) return;
      if (this.rememberAction(this.startSpreading, 'spreading')) return;
      if (this.rememberAction(this.startRepairing, 'repairing')) return;
      if (this.rememberAction(this.startBuilding, 'building')) return;
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
    }

    if (this.rememberAction(this.startMining, 'mining')) return;

    this.currentAction = undefined; // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
  }
}
