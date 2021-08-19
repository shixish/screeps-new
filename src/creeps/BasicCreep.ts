import { DEBUG } from "utils/constants";
import { claimAmount, getClaimedAmount, tickCache } from "utils/tickCache";
export class BasicCreep extends Creep {
  canWork:boolean = Boolean(this.memory.counts.work);
  canCarry:boolean = Boolean(this.memory.counts.carry);
  biteSize:number = (this.memory.counts.work || 0)*2;

  static config:CreepRole = {
    max: (counts)=>{
      switch(counts.controllerLevel){
        case 1:
        case 2:
          return counts.sources * 5;
        // case 3:
        //   return counts.sources;
        default:
          return 4;
      }
    },
    tiers: [
      {
        cost: 300,
        body: [WORK, MOVE, CARRY, MOVE, CARRY]
      },
      // {
      //   cost: 400,
      //   body: [
      //     WORK, MOVE, CARRY,
      //     WORK, MOVE, CARRY
      //   ]
      // },
      // {
      //   cost: 550,
      //   body: [
      //     WORK, MOVE, CARRY,
      //     WORK, MOVE, CARRY,
      //     WORK, CARRY
      //   ]
      // }
    ]
  };
  // static tiers:CreepTier[] = [
  //   {
  //     cost: 300,
  //     body: [WORK, MOVE, CARRY, MOVE, CARRY]
  //   },
  // ];

  constructor(creep:Creep) {
    super(creep.id);
  }
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
    if (action && action !== this.memory.action){
      if (DEBUG) console.log(`${this.name} started ${action}`);
      this.say(action);
    }
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
      console.log(`Creep moving error`, moving, this.name);
    } else {
      console.log(`Creep action error`, action, this.name);
      // throw action;
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
        console.log('Invalid resource type in tombstone:', JSON.stringify(tombstone.store));
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
    const resourceType = RESOURCE_ENERGY;
    if (!this.canCarry) return false;
    // if (this.room.energyCapacityAvailable === this.room.energyAvailable) return false;
    const freeCapacity = this.store.getFreeCapacity(resourceType);
    if (freeCapacity === 0) return false;
    const container = this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (container:StructureContainer)=>{
        return container.structureType === STRUCTURE_CONTAINER && getClaimedAmount(container.id, resourceType) < container.store[resourceType]
      }
    });
    // console.log(`container`, container);
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
    if (this.canWork) return false; //If this is a worker don't bother giving away your resources
    if (this.store[resourceType] === 0) return false;
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
      filter: structure=>(structure.structureType === STRUCTURE_ROAD) && structure.hits < structure.hitsMax
    });
    if (!repairable) return false;
    const action = this.repair(repairable);
    return this.respondToActionCode(action, repairable);
  }

  startEnergizing():boolean{
    const resourceType = RESOURCE_ENERGY;
    const tower = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: (structure:StructureTower)=>{
        return structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
      }
    });
    if (tower instanceof StructureTower){
      const action = this.transfer(tower, resourceType);
      if (action === OK){
        claimAmount(tower.id, resourceType, Math.min(tower.store.getFreeCapacity(resourceType), this.store[resourceType]));
      }
      return this.respondToActionCode(action, tower);
    }
    return false;
  }

  startStoring():boolean{
    const resourceType = RESOURCE_ENERGY;
    // const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    const storage = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: (structure:StructureSpawn|StructureExtension)=>{
        return (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN) && structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
      }
    });
    if (storage instanceof StructureSpawn || storage instanceof StructureExtension){
      const action = this.transfer(storage, resourceType);
      if (action === OK){
        claimAmount(storage.id, resourceType, Math.min(storage.store.getFreeCapacity(resourceType), this.store[resourceType]));
      }
      return this.respondToActionCode(action, storage);
    }
    return false;
  }

  startMining():boolean{
    const resourceType = RESOURCE_ENERGY;
    if (!this.canWork) return false;
    let source;
    if (this.canCarry && this.store.getFreeCapacity(resourceType) < this.biteSize) return false;
    source = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    // if (this.canCarry){
    // }else{
    //   const sources = this.room.find(FIND_SOURCES_ACTIVE, {
    //     filter: (source:Source)=>{
    //       console.log(`source.energy - getClaimedAmount(source.id, resourceType) > 0`, source.energy - getClaimedAmount(source.id, resourceType) > 0);
    //       return source.energy - getClaimedAmount(source.id, resourceType) > 0;
    //     }
    //   });
    //   if (!sources.length) return false;

    //   sources.reduce((leastClaimed:number, thisSource:Source)=>{
    //     const claimedAmount = getClaimedAmount(thisSource.id, resourceType);
    //     if (!leastClaimed || claimedAmount < leastClaimed){
    //       source = thisSource;
    //       return claimedAmount as number;
    //     }
    //     return leastClaimed;
    //   }, 0);
    // }
    if (!source) return false; //This happens if there's no path to the source (it's blocked by other workers)
    const action = this.harvest(source);
    if (action === OK && !this.canCarry){
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

  debug(...args:any[]){
    if (DEBUG) console.log(...args);
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

    if (this.role === 'miner'){
      if (this.currentAction) this.say(this.currentAction);
    }

    // if (this.role === 'courier'){
    //   console.log(`freeCapacity`, this.store.getFreeCapacity(RESOURCE_ENERGY));
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
