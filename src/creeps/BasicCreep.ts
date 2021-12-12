import { DEBUG, maxStorageFill } from "utils/constants";
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
//     //     return roomAudit.sources.length * 5;
//     //   // case 3:
//     //   //   return roomAudit.sources.length;
//     //   default:
//     //     return 4;
//     // }
//     return currentCount/desiredAmount;
//   }
// }

export function calculateBiteSize (creep:Creep){
  return (creep.memory.counts.work || 0)*2
}

//currently unused...
// export function getRemainingStorageCapacity(structure:StructureWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY){
//   return structure.store.getFreeCapacity(resourceType) - getClaimedAmount(structure.id, resourceType);
// };

/*
  breakpoints
  300
  300+250=550
  300+250*2=800
*/
export class BasicCreep extends Creep {
  canWork:boolean = Boolean(this.memory.counts.work);
  canCarry:boolean = Boolean(this.memory.counts.carry);
  canTransferMinerals:boolean = !this.canWork;
  biteSize:number = calculateBiteSize(this);

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
          return roomAudit.sources.length * 2;
        }
      },
      {
        cost: 400,
        body: [
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ],
        max: (roomAudit)=>{
          return roomAudit.sources.length * 3;
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
          return roomAudit.sources.length * 3;
        }
      },
      {
        cost: 1200, //CL5:1800
        body: [
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ],
        max: (roomAudit)=>{
          return roomAudit.sources.length;
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
  //   //     return roomAudit.sources.length * 5;
  //   //   // case 3:
  //   //   //   return roomAudit.sources.length;
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
      // this.debug(`started ${action}`);
      this.say(action);
    }
    this.memory.action = action;
  }

  // canStore(){
  //   return this.store.getFreeCapacity() > 0;
  // }

  // storeTarget(target:NonNullable<TargetableTypes>){
  //   if (target.room?.name && target.room?.name !== this.room.name) this.memory.targetRoom = target.room?.name;
  //   this.memory.targetId = (target as any).id || (target as Flag).name;
  // }
  objectToTarget(target:TargetableTypes):TargetTypes{
    if (!target) return null;
    if (target instanceof Flag){
      return {
        flagName: target.name
      };
    }else{
      if (!(target as any).id) return null;
      if (target.room?.name && target.room?.name !== this.room.name){
        return {
          roomName: target.room?.name,
          id: (target as any).id,
        };
      }else{
        return {
          id: (target as any).id,
        };
      }
    }
  }
  targetToObject(target:TargetTypes){
    if (!target) return null;
    if (target.flagName) return Game.flags[target.flagName];
    if (!target.id) return null;
    return Game.getObjectById(target.id);
  }
  respondToActionCode(action:ScreepsReturnCode, target:NonNullable<TargetableTypes>):TargetTypes{
    if (action === OK){
      return this.objectToTarget(target);
    } else if (action === ERR_NOT_IN_RANGE){
      const moving = this.moveTo(target);
      if (moving === OK || moving === ERR_TIRED){
        return this.objectToTarget(target);
      }
      console.log(`Creep moving error`, this.currentAction, moving, this.name);
      if (moving === ERR_NO_PATH){
        console.log('Creep cannot find a path...');
      }
    } else {
      console.log(`Creep action error`, this.currentAction, action, this.name);
      if (action === ERR_FULL){
        console.log('Creep is full...');
      }else if (action === ERR_NOT_ENOUGH_ENERGY){
        console.log('Creep is out of energy...');
      }
      // throw action;
    }
    return null;
  }


  /***********
   * ACTIONS *
   ***********/

  startPickup(storedTarget:TargetableTypes):TargetTypes{
    if (!this.canCarry) return null;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity == 0) return null;
    const checkResourceAmount = (resource:Resource)=>{
      return getClaimedAmount(resource.id, resource.resourceType) < resource.amount;
    };
    const resource =
      storedTarget instanceof Resource && storedTarget.resourceType && checkResourceAmount(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
        filter: checkResourceAmount
      });
    if (resource){
      const action = this.pickup(resource);
      const ok = this.respondToActionCode(action, resource);
      if (ok) claimAmount(resource.id, resource.resourceType, Math.min(freeCapacity, resource.amount));
      return ok;
    }

    const checkCapacity = (target:Tombstone|Ruin)=>{
      return target.store.getUsedCapacity() > 0;
    };
    const tombstone =
      storedTarget instanceof Tombstone && checkCapacity(storedTarget) && storedTarget ||
      storedTarget instanceof Ruin && checkCapacity(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_TOMBSTONES, {
        filter: checkCapacity
      }) ||
      this.pos.findClosestByRange(FIND_RUINS, {
        filter: checkCapacity
      });
    if (tombstone){
      const resourceType = RESOURCES_ALL.find(resourceType=>{
        return tombstone.store[resourceType] > 0 && getClaimedAmount(tombstone.id, resourceType) < tombstone.store[resourceType];
      });
      if (!resourceType){
        // console.log('Invalid resource type in tombstone:', JSON.stringify(tombstone.store));
        return null;
      }
      const action = this.withdraw(tombstone, resourceType);
      const ok = this.respondToActionCode(action, tombstone);
      if (ok){
        const amount = Math.min(freeCapacity, tombstone.store[resourceType]);
        claimAmount(tombstone.id, resourceType, amount);
      }
      return ok;
    }
    return null;
  }

  /* start taking energy */
  startTaking(storedTarget:TargetableTypes):TargetTypes{
    if (!this.canCarry) return null;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity === 0) return null;
    const resourceType:ResourceConstant = RESOURCE_ENERGY;
    const checkCapacity = (storage:StructureContainer|StructureStorage)=>{
      return getClaimedAmount(storage.id, resourceType) < storage.store[resourceType];
    }
    const storage =
      storedTarget instanceof StructureContainer && checkCapacity(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (container:StructureContainer)=>{
          if (container.structureType !== STRUCTURE_CONTAINER) return false;
          return checkCapacity(container);
        }
      }) as StructureContainer ||
      storedTarget instanceof StructureStorage && checkCapacity(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (storage:StructureStorage)=>{
          if (storage.structureType !== STRUCTURE_STORAGE) return false;
          return checkCapacity(storage);
        }
      }) as StructureStorage;
    // console.log(`container`, container);
    if (!storage) return null;
    const action = this.withdraw(storage, resourceType);
    const ok = this.respondToActionCode(action, storage);
    if (ok) claimAmount(storage.id, resourceType, Math.min(freeCapacity, storage.store[resourceType]));
    return ok;
  }

  /* start transferring minerals other than energy */
  startTransferring(storedTarget:TargetableTypes):TargetTypes{
    if (!this.canCarry || !this.canTransferMinerals) return null;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity === 0) return null;
    let resourceType:ResourceConstant|undefined;
    const checkStoreCapacity = (storage:StructureContainer, type:ResourceConstant)=>{
      return getClaimedAmount(storage.id, type) < storage.store[type];
    };
    const checkCapacity = (storage:StructureContainer)=>{
      if (!resourceType){
        resourceType = (Object.keys(storage.store) as ResourceConstant[]).find(type=>{
          if (type === RESOURCE_ENERGY) return false; //Don't bother transferring energy using this method. Use startTaking for that instead.
          return checkStoreCapacity(storage, type);
        });
        return resourceType !== undefined;
      }else{
        return checkStoreCapacity(storage, resourceType);
      }
    }
    const storage =
      storedTarget instanceof StructureContainer && checkCapacity(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (container:StructureContainer)=>{
          if (container.structureType !== STRUCTURE_CONTAINER) return false;
          return checkCapacity(container);
        }
      }) as StructureContainer;
    // console.log(`container`, container);
    if (!storage || !resourceType) return null;
    // console.log(`Start taking`, resourceType);
    const action = this.withdraw(storage, resourceType);
    const ok = this.respondToActionCode(action, storage);
    if (ok) claimAmount(storage.id, resourceType, Math.min(freeCapacity, storage.store[resourceType]));
    return ok;
  }

  startSpreading(storedTarget:TargetableTypes):TargetTypes{
    const maxFillPercentage = 0.75; //75%;
    const resourceType = RESOURCE_ENERGY;
    if (this.canWork) return null; //If this is a worker don't bother giving away your resources
    if (this.store[resourceType] === 0) return null;
    const checkCreep = (creep:Creep)=>{
      return creep.id !== this.id && creep.memory.counts.work && creep.store.getUsedCapacity(resourceType) + getClaimedAmount(creep.id, resourceType) < creep.store.getCapacity(resourceType)*maxFillPercentage;
    };
    const target =
      storedTarget instanceof Creep && checkCreep(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: checkCreep
      });
    if (!target) return null;
    const action = this.transfer(target, resourceType);
    const ok = this.respondToActionCode(action, target);
    if (ok) claimAmount(target.id, resourceType, Math.min(target.store.getFreeCapacity(resourceType), this.store[resourceType]));
    return ok;
  }

  startRepairing(storedTarget:TargetableTypes):TargetTypes{
    const resourceType = 'repair';
    if (!this.canWork) return null;
    const checkHits = (structure:StructureRoad)=>{
      return structure.hits + getClaimedAmount(structure.id, resourceType) < structure.hitsMax;
    };
    const structure =
      storedTarget instanceof StructureRoad && checkHits(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: structure=>structure.structureType === STRUCTURE_ROAD && checkHits(structure)
      }) as StructureRoad;
    if (!structure) return null;
    const action = this.repair(structure);
    const ok = this.respondToActionCode(action, structure);
    //A creep can restore 100 points/tick to a target structure, spending 0.01 energy per hit point repaired, per WORK module equipped.
    //Ref: https://screeps.fandom.com/wiki/Creep
    if (ok) claimAmount(structure.id, resourceType, Math.min(structure.hitsMax-structure.hits, 100));
    return ok;
  }

  startEnergizing(storedTarget:TargetableTypes):TargetTypes{
    const resourceType = RESOURCE_ENERGY;
    const checkCapacity = (structure:StructureSpawn|StructureExtension|StructureTower)=>{
      return structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
    };
    const checkTowerCapacity = (structure:StructureTower)=>{
      //Only start energizing towers if they require at least 25% of the creep's stored energy.
      //This is to prevent it from idling there while the tower repairs things each turn.
      return structure.store.getFreeCapacity(resourceType) - getClaimedAmount(structure.id, resourceType) > this.store.getCapacity(resourceType)*0.75;
    };
    const structure =
      storedTarget instanceof StructureSpawn && checkCapacity(storedTarget) && storedTarget ||
      storedTarget instanceof StructureExtension && checkCapacity(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure:StructureSpawn|StructureExtension)=>{
          if (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN) return false;
          return checkCapacity(structure);
        }
      }) as StructureSpawn ||
      storedTarget instanceof StructureTower && checkTowerCapacity(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure:StructureTower)=>{
          if (structure.structureType !== STRUCTURE_TOWER) return false;
          return checkTowerCapacity(structure);
        }
      }) as StructureTower;
    if (!structure) return null;
    const action = this.transfer(structure, resourceType);
    const ok = this.respondToActionCode(action, structure);
    if (ok){
      const amount = Math.min(structure.store.getFreeCapacity(resourceType), this.store[resourceType]);
      claimAmount(structure.id, resourceType, amount);
    }
    return ok;
  }

  startStoring(storedTarget:TargetableTypes):TargetTypes{
    const resourceType:ResourceConstant|undefined = (Object.keys(this.store) as ResourceConstant[]).find(type=>{
      return this.store[type] > 0;
    });
    if (!resourceType) return null;
    const checkCapacity = (structure:StructureStorage)=>{
      return structure.store.getUsedCapacity(resourceType) < maxStorageFill(resourceType) && structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
    }
    const storage =
      storedTarget instanceof StructureStorage && checkCapacity(storedTarget) && storedTarget ||
      this.room.storage && checkCapacity(this.room.storage) && this.room.storage; //||
      // this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      //   filter: (structure:StructureStorage)=>{
      //     if (structure.structureType !== STRUCTURE_STORAGE) return false;
      //     return checkCapacity(structure);
      //   }
      // }) as StructureStorage;
    if (!storage) return null;
    // console.log(`Start storing`, resourceType);
    const action = this.transfer(storage, resourceType);
    const ok = this.respondToActionCode(action, storage);
    if (ok){
      const amount = Math.min(storage.store.getFreeCapacity(resourceType), this.store[resourceType]);
      claimAmount(storage.id, resourceType, amount);
    }
    return ok;
  }

  startMining(storedTarget:TargetableTypes):TargetTypes{
    const resourceType = RESOURCE_ENERGY;
    if (!this.canWork) return null;
    if (this.canCarry && this.store.getFreeCapacity(resourceType) < this.biteSize) return null;
    const checkCapacity = (source:Source)=>{
      return source.energyCapacity > 0;
    };
    const anchor = this.getAnchor();
    const source =
      storedTarget instanceof Source && checkCapacity(storedTarget) && storedTarget ||
      anchor instanceof Source && checkCapacity(anchor) && anchor ||
      this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
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
    if (!source) return null; //This happens if there's no path to the source (it's blocked by other workers)
    const action = this.harvest(source);
    if (action === OK && !this.canCarry){
      // const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
      //   filter: (structure)=>structure.structureType === STRUCTURE_CONTAINER,
      // });
      // containers.reduce((available, container)=>{}, )
      // this.pos.getRangeTo()
    }
    const ok = this.respondToActionCode(action, source);
    return ok;
  }

  startBuilding(storedTarget:TargetableTypes):TargetTypes{
    if (!this.canWork) return null;
    if (this.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return null;
    const construction = this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
    if (!construction) return null;
    const action = this.build(construction);
    const ok = this.respondToActionCode(action, construction);
    return ok;
  }

  startUpgrading(storedTarget:TargetableTypes):TargetTypes{
    if (!this.canWork) return null;
    if (!this.room.controller) return null;
    const action = this.transfer(this.room.controller, RESOURCE_ENERGY);
    const ok = this.respondToActionCode(action, this.room.controller);
    if (ok){
      // console.log(`storedTarget === this.room.controller`, storedTarget !== this.room.controller);
      if (this.checkIfBadIdleLocation()){
        this.moveTo(this.room.controller);
      }
    }
    return ok;
  }

  /**
   * Utils
   */

  debug(...args:any[]){
    if (DEBUG) console.log(this.id, this.role, ...args);
  }

  getAnchor(){
    return this.memory.anchor && Game.getObjectById(this.memory.anchor);
  }

  rememberAction(callback:(storedTarget:TargetableTypes)=>TargetTypes, actionName:string, overrideActions: string[] = []){
    const isCurrentAction = this.currentAction === actionName;
    if (!this.currentAction || isCurrentAction || overrideActions.includes(this.currentAction)){
      const storedTarget = isCurrentAction && this.memory.target ? this.targetToObject(this.memory.target) : null;
      const target = callback.apply(this, [ storedTarget ]);
      if (target){
        this.currentAction = actionName;
        this.memory.target = target;
        return true;
      }else if (isCurrentAction){
        this.currentAction = undefined;
        this.memory.target = undefined;
      }
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
    const anchor = this.getAnchor();
    if (anchor){
      this.moveTo(anchor);
    } else if (this.checkIfBadIdleLocation()){
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
      // if (this.currentAction) this.say(this.currentAction);
    // }
    // if (!this.memory.targetId && this.currentAction){
    //   this.say('b:'+this.currentAction);
    // }
    // this.say(String(this.memory.targetId));
    const usedCapacity = this.store.getUsedCapacity();
    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    let triedStoring = false;

    /* this stuff deals with minerals */
    if (this.canTransferMinerals){
      if (this.rememberAction(this.startTransferring, 'transferring')) return;
      if (usedCapacity > 0 && usedCapacity !== energyCapacity){
        //if filled with stuff other than energy
        if (this.rememberAction(this.startStoring, 'storing')) return;
        triedStoring = true;
      }
    }

    /* this stuff deals with energy */
    if (this.rememberAction(this.startPickup, 'pickup', ['mining'])) return;
    if (this.rememberAction(this.startTaking, 'taking', ['mining'])) return;

    if (energyCapacity > 0){ //Do something with the energy
      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading', 'building', 'repairing'])) return;
      if (this.rememberAction(this.startRepairing, 'repairing', ['upgrading'])) return;
      if (this.rememberAction(this.startBuilding, 'building', ['upgrading'])) return;
      if (this.rememberAction(this.startSpreading, 'spreading')) return;
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
      if (!triedStoring && this.rememberAction(this.startStoring, 'storing')) return;
    }

    if (this.rememberAction(this.startMining, 'mining')) return;

    this.idle();

    this.currentAction = undefined; // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
  }
}
