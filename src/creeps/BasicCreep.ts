import { DEBUG } from "utils/constants";
import { claimAmount, getClaimedAmount } from "utils/tickCache";

// export class BasicCreepFactory{
//   role:CreepRoleName = 'basic';
//   tiers:CreepTier[] = [
//     {
//       cost: 300,
//       body: [WORK, MOVE, CARRY, MOVE, CARRY]
//     },
//     {
//       cost: 400,
//       body: [
//         WORK, MOVE, CARRY,
//         WORK, MOVE, CARRY
//       ]
//     },
//     // {
//     //   cost: 550,
//     //   body: [
//     //     WORK, MOVE, CARRY,
//     //     WORK, MOVE, CARRY,
//     //     WORK, CARRY
//     //   ]
//     // }
//   ];
//   roomAudit: RoomAudit;

//   constructor(roomAudit:RoomAudit){
//     this.roomAudit = roomAudit;
//   }

//   getCurrentWeight(roomAudit:RoomAudit){
//     const currentCount = roomAudit.creepCountsByRole[this.role] || 0;
//     let desiredAmount:number = 0;
//     desiredAmount = 4;
//     // switch(roomAudit.controllerLevel){
//     //   case 1:
//     //   case 2:
//     //     return roomAudit.sourceCount * 5;
//     //   // case 3:
//     //   //   return roomAudit.sourceCount;
//     //   default:
//     //     return 4;
//     // }
//     return currentCount/desiredAmount;
//   }
// }

/*
  breakpoints
  300
  300+250=550
  300+250*2=800
*/
export class BasicCreep extends Creep {
  canWork:boolean = Boolean(this.memory.counts.work);
  canCarry:boolean = Boolean(this.memory.counts.carry);
  biteSize:number = (this.memory.counts.work || 0)*2;

  // static role:CreepRoleName = 'basic';
  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        cost: 300,
        body: [
          WORK,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
        max: (roomAudit)=>{
          return roomAudit.sourceCount * 2;
        }
      },
      {
        cost: 400,
        body: [
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ],
        max: (roomAudit)=>{
          return roomAudit.sourceCount * 3;
        }
      },
      {
        cost: 550,
        body: [
          WORK, MOVE,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ],
        max: (roomAudit)=>{
          return roomAudit.sourceCount * 3;
        }
      }
    ]
  };
  // static tiers:CreepTier[] = [
  //   {
  //     cost: 300,
  //     body: [WORK, MOVE, CARRY, MOVE, CARRY]
  //   },
  //   {
  //     cost: 400,
  //     body: [
  //       WORK, MOVE, CARRY,
  //       WORK, MOVE, CARRY
  //     ]
  //   },
  //   // {
  //   //   cost: 550,
  //   //   body: [
  //   //     WORK, MOVE, CARRY,
  //   //     WORK, MOVE, CARRY,
  //   //     WORK, CARRY
  //   //   ]
  //   // }
  // ];
  // static getCurrentWeight(roomAudit:RoomAudit){
  //   const currentCount = roomAudit.creepCountsByRole[this.role] || 0;
  //   let desiredAmount:number = 0;
  //   desiredAmount = 4;
  //   // switch(roomAudit.controllerLevel){
  //   //   case 1:
  //   //   case 2:
  //   //     return roomAudit.sourceCount * 5;
  //   //   // case 3:
  //   //   //   return roomAudit.sourceCount;
  //   //   default:
  //   //     return 4;
  //   // }
  //   return currentCount/desiredAmount;
  // }

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
      this.debug(`started ${action}`);
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
      const ok = this.respondToActionCode(action, resource);
      if (ok) claimAmount(resource.id, resource.resourceType, Math.min(freeCapacity, resource.amount));
      return ok;
    }
    const tombstone = this.pos.findClosestByRange(FIND_TOMBSTONES, {
      filter: ts=>{
        return ts.store.getUsedCapacity() > 0;
      }
    }) || this.pos.findClosestByRange(FIND_RUINS, {
      filter: ruin=>{
        return ruin.store.getUsedCapacity() > 0;
      }
    });
    if (tombstone){
      const resourceType = RESOURCES_ALL.find(resourceType=>{
        return tombstone.store[resourceType] > 0 && getClaimedAmount(tombstone.id, resourceType) < tombstone.store[resourceType];
      });
      if (!resourceType){
        // console.log('Invalid resource type in tombstone:', JSON.stringify(tombstone.store));
        return false;
      }
      const action = this.withdraw(tombstone, resourceType);
      const ok = this.respondToActionCode(action, tombstone);
      if (ok){
        const amount = Math.min(freeCapacity, tombstone.store[resourceType]);
        claimAmount(tombstone.id, resourceType, amount);
      }
      return ok;
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
      const ok = this.respondToActionCode(action, container);
      if (ok) claimAmount(container.id, resourceType, Math.min(freeCapacity, container.store[resourceType]));
      return ok;
    }
    return false;
  }

  startSpreading(){
    const resourceType = RESOURCE_ENERGY;
    if (this.canWork) return false; //If this is a worker don't bother giving away your resources
    if (this.store[resourceType] === 0) return false;
    const target = this.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: creep=>{
        return creep.id !== this.id && creep.memory.counts.work && creep.store.getUsedCapacity(resourceType) + getClaimedAmount(creep.id, resourceType) < creep.store.getCapacity(resourceType)
      }
    });
    if (!target) return false;
    const action = this.transfer(target, resourceType);
    const ok = this.respondToActionCode(action, target);
    if (ok) claimAmount(target.id, resourceType, Math.min(target.store.getFreeCapacity(resourceType), this.store[resourceType]));
    return ok;
  }

  startRepairing():boolean{
    const resourceType = 'repair';
    if (!this.canWork) return false;
    const structure = this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: structure=>(structure.structureType === STRUCTURE_ROAD) && structure.hits + getClaimedAmount(structure.id, resourceType) < structure.hitsMax
    });
    if (!structure) return false;
    const action = this.repair(structure);
    const ok = this.respondToActionCode(action, structure);
    //A creep can restore 100 points/tick to a target structure, spending 0.01 energy per hit point repaired, per WORK module equipped.
    //Ref: https://screeps.fandom.com/wiki/Creep
    if (ok) claimAmount(structure.id, resourceType, Math.min(structure.hitsMax-structure.hits, 100));
    return ok;
  }

  startEnergizing():boolean{
    const resourceType = RESOURCE_ENERGY;
    const tower = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: (structure:StructureTower)=>{
        return structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
      }
    }) as StructureTower;
    if (!tower) return false;
    const action = this.transfer(tower, resourceType);
    const ok = this.respondToActionCode(action, tower);
    if (ok){
      const amount = Math.min(tower.store.getFreeCapacity(resourceType), this.store[resourceType]);
      // this.debug(`claiming amount`, amount, tower);
      claimAmount(tower.id, resourceType, amount);
    }
    return ok;
  }

  startStoring():boolean{
    const resourceType = RESOURCE_ENERGY;
    // const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    const storage = this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: (structure:StructureSpawn|StructureExtension)=>{
        if (!(structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)) return false;
        // console.log(structure, `claimedAmount`, getClaimedAmount(structure.id, resourceType));
        // console.log(`structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType)`, structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType));
        return structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
      }
    });
    if (storage instanceof StructureSpawn || storage instanceof StructureExtension){
      // console.log(`storage`, storage);
      const action = this.transfer(storage, resourceType);
      const ok = this.respondToActionCode(action, storage);
      if (ok){
        const amount = Math.min(storage.store.getFreeCapacity(resourceType), this.store[resourceType]);
        // this.debug(`claiming amount`, amount, storage);
        claimAmount(storage.id, resourceType, amount);
      }
      return ok;
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
    if (DEBUG) console.log(this.id, this.role, ...args);
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

  checkIfBadIdleLocation(x:number = this.pos.x, y:number = this.pos.y){
    const objects = this.room.lookAt(x, y);
    // console.log(`objects`, JSON.stringify(objects));
    for (let object of objects){
      if (object.type === LOOK_STRUCTURES && object.structure!.structureType === 'road'){
        return true;
      }else if (object.type === LOOK_TERRAIN && object.terrain !== "plain"){
        return true;
      }
    }
    return false;
  }

  idle(){
    if (this.checkIfBadIdleLocation()){
      for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
        const newX = this.pos.x + coord[0], newY = this.pos.y + coord[1];
        if (!this.checkIfBadIdleLocation(newX, newY)){
          this.moveTo(newX, newY);
          return;
        };
      }
      this.move(Math.floor(1+Math.random()*8) as DirectionConstant);
    }
    // const objects = this.room.lookAt(this.pos);
    // for (let object of objects){
    //   if (object.type === LOOK_STRUCTURES && object.structure!.structureType === 'road'){
    //     this.move(Math.floor(1+Math.random()*8) as DirectionConstant);
    //     return;
    //   }
    // }
    // const roads = this.pos.findInRange(FIND_STRUCTURES, 0, {
    //   filter: structure=>{
    //     return structure.structureType === "road";
    //   }
    // });
    // if (roads.length){
    //   //Move in a random direction to hopefully get off of the road, letting other creeps use the highway.
    //   this.move(Math.floor(1+Math.random()*7) as DirectionConstant);
    // }
  }

  work():any{
    if (this.spawning) return;

    // if (this.role === 'courier'){
    //   if (this.currentAction) this.say(this.currentAction);
    // }

    if (this.rememberAction(this.startPickup, 'pickup', ['mining'])) return;
    if (this.rememberAction(this.startTaking, 'taking', ['mining'])) return;

    if (this.store.getUsedCapacity(RESOURCE_ENERGY) > 0){ //Do something with the energy
      if (this.rememberAction(this.startStoring, 'storing', ['upgrading', 'building', 'repairing'])) return;
      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading', 'building'])) return;
      if (this.rememberAction(this.startRepairing, 'repairing', ['upgrading'])) return;
      if (this.rememberAction(this.startBuilding, 'building', ['upgrading'])) return;
      if (this.rememberAction(this.startSpreading, 'spreading')) return;
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
    }

    if (this.rememberAction(this.startMining, 'mining')) return;

    this.idle();

    this.currentAction = undefined; // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
  }
}
