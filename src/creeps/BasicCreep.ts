import { FlagManager } from "managers/flags";
import { getRoomAudit } from "managers/room";
import { DEBUG, maxStorageFill } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { claimAmount, getClaimedAmount } from "utils/tickCache";

export function calculateBiteSize (creep:Creep){
  return (creep.memory.counts.work || 0)*2
}

//currently unused...
// export function getRemainingStorageCapacity(structure:StructureWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY){
//   return structure.store.getFreeCapacity(resourceType) - getClaimedAmount(structure.id, resourceType);
// };

/*
  Extension Breakpoints:
  CL1: 300
  CL2: 550 = 300 + 5*50  (50 capacity)
  CL3: 800 = 300 + 10*50  (50 capacity)
  CL4: 1300 = 300 + 20*50  (50 capacity)
  CL5: 1800 = 300 + 30*50  (50 capacity)
  CL6: 2300 = 300 + 40*50  (50 capacity)
  CL7: 3100 = 2*300 + 50*50  (100 capacity) <-- This from the docs. Dunno what this capacity means 50 vs 100..?
  CL8: 3600 = 2*300 + 60*50  (200 capacity)
*/
export class BasicCreep extends Creep {
  canWork:boolean = this.workCount > 0;
  canCarry:boolean = this.carryCount > 0;

  static config:CreepRole = {
    authority: 1,
    max: roomAudit=>{
      if (roomAudit.creeps.length < 2) return 1;
      //We need a basic creep to do the initial upgrading before we build a dedicated upgrader
      return Math.max(Math.ceil(roomAudit.constructionSites.length/6), !roomAudit.creepCountsByRole.upgrader ? 1 : 0);
    },
    tiers: [
      {
        cost: 300,
        body: [
          WORK,
          CARRY, MOVE,
          CARRY, MOVE,
        ]
      },
      {
        cost: 400,
        body: [
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ]
      },
      {
        cost: 550,
        body: [
          WORK, MOVE,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ]
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
        ]
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

  get workCount(){
    return this.memory.counts.work || 0;
  }

  get carryCount(){
    return this.memory.counts.carry || 0;
  }

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
  objectToTarget(target:TargetableTypes){
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
  respondToActionCode(action:ScreepsReturnCode, target:NonNullable<TargetableTypes>):TargetableTypes{
    if (action === OK){
      return target;
    } else if (action === ERR_NOT_IN_RANGE){
      const moving = this.moveTo(target);
      if (moving === OK || moving === ERR_TIRED){
        return target;
      }
      if (moving === ERR_NO_PATH){
        console.log(`[${this.room.name}] Creep ${this.name} cannot find a path while doing ${this.currentAction}...`);
      }else{
        console.log(`[${this.room.name}] Creep moving error`, this.currentAction, moving, this.name);
      }
    } else {
      if (action === ERR_FULL){
        console.log(`[${this.room.name}] Creep ${this.name} is full while doing ${this.currentAction}...`);
      }else if (action === ERR_NOT_ENOUGH_ENERGY){
        console.log(`[${this.room.name}] Creep ${this.name} is out of energy while doing ${this.currentAction}...`);
      }else{
        console.log(`[${this.room.name}] Creep action error`, this.currentAction, action, this.name);
      }
      // throw action;
    }
    return null;
  }

  /***********
   * ACTIONS *
   ***********/

  startPickup(storedTarget:TargetableTypes){
    if (!this.canCarry) return null;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity == 0) return null;
    const checkResourceAmount = (resource:Resource)=>{
      return getClaimedAmount(resource.id, resource.resourceType) < resource.amount;
    };
    const resource =
      storedTarget instanceof Resource && storedTarget.resourceType && checkResourceAmount(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
        filter: (resource)=>{
          //If the loose resource is sitting on a container just grab from the container instead so we can take a bigger bite and move on.
          if (resource.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_CONTAINER && (structure as StructureContainer).store.getFreeCapacity() === 0)) return false;
          return checkResourceAmount(resource);
        }
      });
    if (resource){
      if (this.moveWithinRange(resource.pos, 1)) return resource;
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
      if (this.moveWithinRange(tombstone.pos, 1)) return tombstone;
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
  startTakingEnergy(storedTarget:TargetableTypes){
    if (!this.canCarry) return null;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity === 0) return null;
    const resourceType:ResourceConstant = RESOURCE_ENERGY;
    const checkCapacity = (storage:StructureContainer|StructureStorage)=>{
      //10 is how much energy is sent to the source containers per tick
      //This is to have the courier creeps go use whatever energy they have rather than wait idle for the trickle of 10 energy per tick
      return getClaimedAmount(storage.id, resourceType) < storage.store.getUsedCapacity(resourceType) - 10;
    }
    const roomAudit = getRoomAudit(this.room);
    const findSourceContainer = ()=>{
    //   const containers = ([] as StructureContainer[]).concat(...roomAudit.sources.map(source=>source.containers)).sort((a, b)=>{
    //     return a.store.energy - b.store.energy;
    //   });
      let containerWithMost:StructureContainer|undefined, mostEnergy:number = 0;
      for (let source of roomAudit.sources){
        for (let container of source.containers){
          const energy = container.store.getUsedCapacity(resourceType) - getClaimedAmount(container.id, resourceType);
          if (energy > mostEnergy){
            mostEnergy = energy;
            containerWithMost = container;
          }
        }
      }
      return containerWithMost;
    };
    const storage =
      //If there are couriers let them pick up from source containers, otherwise there's congestion.
      storedTarget instanceof StructureContainer && checkCapacity(storedTarget) && storedTarget || //Upgrader will explicitly grab from it's designated container
      storedTarget instanceof StructureStorage && checkCapacity(storedTarget) && storedTarget ||
      this.canWork && this.room.storage || //If the creep can work then favor going directly to the large storage and let couriers fill that up
      findSourceContainer() || //(!roomAudit.creepCountsByRole.courier || !this.canWork) &&
      this.room.storage;
      // this.pos.findClosestByRange(FIND_STRUCTURES, {
      //   filter: (container:StructureContainer)=>{
      //     if (container.structureType !== STRUCTURE_CONTAINER) return false;
      //     return checkCapacity(container);
      //   }
      // }) as StructureContainer;
    // console.log(`container`, container);
    if (!storage) return null;
    if (this.moveWithinRange(storage.pos, 1)) return storage;
    const action = this.withdraw(storage, resourceType);
    const ok = this.respondToActionCode(action, storage);
    if (ok) claimAmount(storage.id, resourceType, freeCapacity);
    return ok;
  }

  /* start transferring minerals other than energy */
  startTransferringMinerals(storedTarget:TargetableTypes){
    if (!this.canCarry || this.canWork) return null;
    const freeCapacity = this.store.getFreeCapacity();
    if (freeCapacity === 0) return null;
    let resourceType:ResourceConstant|undefined;
    const checkStoreCapacity = (storage:StructureContainer, type:ResourceConstant)=>{
      //Only grab minerals out of storage boxes if it's enough to fill up the creep, otherwise it's got better things to do
      return storage.store[type] - getClaimedAmount(storage.id, type) >= Math.min(storage.store.getCapacity(), freeCapacity);
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
    if (this.moveWithinRange(storage.pos, 1)) return storage;
    const action = this.withdraw(storage, resourceType);
    const ok = this.respondToActionCode(action, storage);
    if (ok) claimAmount(storage.id, resourceType, Math.min(freeCapacity, storage.store[resourceType]));
    return ok;
  }

  startSpreading(storedTarget:TargetableTypes){
    const maxFillPercentage = 0.75; //75%;
    const resourceType = RESOURCE_ENERGY;
    if (this.canWork) return null; //If this is a worker don't bother giving away your resources
    if (this.store[resourceType] === 0) return null;
    const checkCreep = (creep:Creep)=>{
      return creep.id !== this.id && creep.memory.counts.work && creep.memory.seated !== false && creep.store.getUsedCapacity(resourceType) + getClaimedAmount(creep.id, resourceType) < creep.store.getCapacity(resourceType)*maxFillPercentage;
    };
    const target =
      storedTarget instanceof Creep && checkCreep(storedTarget) && storedTarget ||
      this.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: checkCreep
      });
    // const { target } = this.pos.findInRange(FIND_MY_CREEPS, 1).reduce((out, creep)=>{
    //   if (creep.id !== this.id && creep.memory.counts.work && creep.memory.seated !== false){
    //     const amount = creep.store.getUsedCapacity(resourceType)-getClaimedAmount(creep.id, resourceType);
    //     if (amount > out.amount){
    //       out.target = creep;
    //       out.amount = amount;
    //     }
    //   }
    //   return out;
    // }, { target: undefined as Creep|undefined, amount: 0 });
    if (!target) return null;
    if (this.moveWithinRange(target.pos, 1)) return target;
    const action = this.transfer(target, resourceType);
    const ok = this.respondToActionCode(action, target);
    if (ok) claimAmount(target.id, resourceType, this.store[resourceType]);
    return ok;
  }

  startRepairing(storedTarget:TargetableTypes){
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
    if (this.moveWithinRange(structure.pos, 3)) return structure;
    const action = this.repair(structure);
    const ok = this.respondToActionCode(action, structure);
    //A creep can restore 100 points/tick to a target structure, spending 0.01 energy per hit point repaired, per WORK module equipped.
    //Ref: https://screeps.fandom.com/wiki/Creep
    if (ok) claimAmount(structure.id, resourceType, Math.min(structure.hitsMax-structure.hits, 100));
    return ok;
  }

  startEnergizing(storedTarget:TargetableTypes){
    type EnergizeTargets = StructureSpawn|StructureExtension|StructureTower|StructureTower;
    const resourceType = RESOURCE_ENERGY;
    const checkCapacity = (structure:StructureSpawn|StructureExtension|StructureTower)=>{
      return structure.store.getFreeCapacity(resourceType) > getClaimedAmount(structure.id, resourceType);
    };
    const checkActiveCapacity = (structure:EnergizeTargets, minRequested = this.store.getCapacity(resourceType)*0.75)=>{
      //Only start energizing towers if they request at least 25% of the creep's stored energy.
      //This is to prevent it from spoon feeding the tower while it repairs things each turn.
      return structure.store.getFreeCapacity(resourceType) - getClaimedAmount(structure.id, resourceType) > minRequested;
    };
    const targets:Partial<Record<StructureConstant, { priority:number, minRequested:number }>> = {
      [STRUCTURE_SPAWN]: {
        priority: 0,
        minRequested: 0,
      },
      [STRUCTURE_EXTENSION]: {
        priority: 0,
        minRequested: 0,
      },
      [STRUCTURE_TOWER]: {
        priority: 1,
        minRequested: this.store.getCapacity(resourceType)*0.75,
      },
    };
    const findStructure = ():EnergizeTargets|undefined=>{
      let bestStructure:AnyOwnedStructure|undefined, bestDistance:number, bestPriority:number;
      this.room.find(FIND_MY_STRUCTURES, {
        filter: structure=>{
          const target = targets[structure.structureType];
          if (target){
            const { priority, minRequested } = target;
            const distance = this.pos.getRangeTo(structure);
            if ((!bestStructure || priority <= bestPriority && distance < bestDistance) && checkActiveCapacity(structure as StructureSpawn, minRequested)){
              bestStructure = structure;
              bestDistance = distance;
              bestPriority = priority;
            }
          }
        },
      });
      return bestStructure as any;
    };

    const structure =
      storedTarget instanceof StructureSpawn && checkCapacity(storedTarget) && storedTarget ||
      storedTarget instanceof StructureExtension && checkCapacity(storedTarget) && storedTarget ||
      // this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      //   filter: (structure:StructureSpawn|StructureExtension)=>{
      //     if (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN) return false;
      //     return checkCapacity(structure);
      //   }
      // }) as StructureSpawn ||
      storedTarget instanceof StructureTower && checkActiveCapacity(storedTarget) && storedTarget ||
      // this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      //   filter: (structure:StructureTower)=>{
      //     if (structure.structureType !== STRUCTURE_TOWER) return false;
      //     return checkActiveCapacity(structure);
      //   }
      // }) as StructureTower
      findStructure();
    if (!structure) return null;
    if (this.moveWithinRange(structure.pos, 1)) return structure;
    const action = this.transfer(structure, resourceType);
    const ok = this.respondToActionCode(action, structure);
    if (ok){
      const amount = Math.min(structure.store.getFreeCapacity(resourceType), this.store[resourceType]);
      claimAmount(structure.id, resourceType, amount);
    }
    return ok;
  }

  //This is used to stock containers that sit next to controllers. Other tasks have higher priority so this needed to be split off.
  startStocking(storedTarget:TargetableTypes){
    const maxFillPercentage = 0.75;
    const resourceType = RESOURCE_ENERGY;
    const checkActiveCapacity = (structure:StructureContainer|StructureLab)=>{
      return structure.store.getFreeCapacity(resourceType) + getClaimedAmount(structure.id, resourceType) < structure.store.getCapacity(resourceType)*maxFillPercentage;
    };
    const roomAudit = getRoomAudit(this.room);
    const structure =
      storedTarget instanceof StructureContainer && checkActiveCapacity(storedTarget) && storedTarget ||
      storedTarget instanceof StructureLab && checkActiveCapacity(storedTarget) && storedTarget ||
      roomAudit.controller?.containers.find(checkActiveCapacity)
      this.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure:StructureLab)=>{
          if (structure.structureType !== STRUCTURE_LAB) return false;
          return checkActiveCapacity(structure);
        }
      }) as StructureLab
    if (!structure) return null;
    if (this.moveWithinRange(structure.pos, 1)) return structure;
    const action = this.transfer(structure, resourceType);
    const ok = this.respondToActionCode(action, structure);
    if (ok){
      // const amount = Math.min(structure.store.getFreeCapacity(resourceType), this.store[resourceType]);
      claimAmount(structure.id, resourceType, this.store.getUsedCapacity(resourceType));
    }
    return ok;
  }

  startStoring(storedTarget:TargetableTypes){
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
    if (this.moveWithinRange(storage.pos, 1)) return storage;
    const action = this.transfer(storage, resourceType);
    const ok = this.respondToActionCode(action, storage);
    if (ok){
      const amount = Math.min(storage.store.getFreeCapacity(resourceType), this.store[resourceType]);
      claimAmount(storage.id, resourceType, amount);
    }
    return ok;
  }

  //Harvest Source
  startHarvesting(storedTarget?:TargetableTypes){
    // const resourceType = RESOURCE_ENERGY;
    if (!this.canWork) return null;
    if (this.canCarry && this.store.getFreeCapacity() < this.workCount*2) return null;
    const checkCapacity = (source:Source)=>source.energy > 0;

    // const roomAudit = getRoomAudit(this.room);
    // const findSourceAnchor = ()=>{
    //   let targetSourceAnchor:CreepAnchor<Source>|undefined, targetDistance:number|undefined;
    //   for (let sourceAnchor of roomAudit.sources){
    //     if (this.memory.anchor === sourceAnchor.id || storedTarget instanceof Source && storedTarget.id === sourceAnchor.id) return sourceAnchor;
    //     const distance = this.pos.getRangeTo(sourceAnchor.anchor);
    //     if ((targetDistance === undefined || targetDistance < distance) && sourceAnchor.anchor.energy > 0){
    //       targetDistance = distance;
    //       targetSourceAnchor = sourceAnchor;
    //     }
    //   }
    //   return targetSourceAnchor;
    // };

    // const sourceAnchor = findSourceAnchor();
    // if (!sourceAnchor || sourceAnchor.anchor.energy === 0) return null;

    const source =
      storedTarget instanceof Source && checkCapacity(storedTarget) && storedTarget ||
      // anchor instanceof Source && checkCapacity(anchor) && anchor ||
      !this.memory.anchor && this.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
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
    if (!source || source.energy === 0) return null;
    if (this.moveWithinRange(source.pos, 1)) return source;
    const action = this.harvest(source);
    if (action === ERR_NOT_ENOUGH_ENERGY) return null; //This happens if you have too many miners on a source
    const ok = this.respondToActionCode(action, source);
    return ok;
  }

  //Mine Minerals
  startMining(storedTarget?:TargetableTypes){
    if (!this.canWork) return null;
    if (this.canCarry && this.store.getFreeCapacity() < this.workCount*2) return null;
    const checkExtractorCooldown = (mineral:Mineral)=>{
      const extractor = mineral.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor;
      return extractor && extractor.cooldown === 0;
    };
    const checkCapacity = (mineral:Mineral)=>{
      return mineral.mineralAmount > 0 && checkExtractorCooldown(mineral);
    };

    const mineral = storedTarget instanceof Mineral && checkCapacity(storedTarget) && storedTarget;

    if (!mineral) return null;
    if (this.moveWithinRange(mineral.pos, 1)) return mineral;
    const action = this.harvest(mineral);
    if (action === ERR_NOT_ENOUGH_ENERGY) return null; //This happens if you have too many miners on a source
    const ok = this.respondToActionCode(action, mineral);
    return ok;
  }

  startBuilding(storedTarget:TargetableTypes){
    if (!this.canWork) return null;
    if (this.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return null;
    const construction = this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES, {
      filter: site=>{
        return site.room && site.room.name === this.room.name;
      }
    });
    if (!construction) return null;
    if (this.moveWithinRange(construction.pos, 3)) return construction;
    const action = this.build(construction);
    const ok = this.respondToActionCode(action, construction);
    return ok;
  }

  startUpgrading(storedTarget?:TargetableTypes){
    if (!this.canWork) return null;
    if (!this.room.controller || !this.room.controller.my) return null;
    //We can upgrade from
    if (this.moveWithinRange(this.room.controller.pos, 3)) return this.room.controller;
    const action = this.upgradeController(this.room.controller);
    const ok = this.respondToActionCode(action, this.room.controller);
    // if (ok){
    //   // console.log(`storedTarget === this.room.controller`, storedTarget !== this.room.controller);
    //   if (this.checkIfBadIdleLocation()){
    //     this.moveTo(this.room.controller);
    //   }
    // }
    return ok;
  }

  /**
   * Utils
   */

  debug(...args:any[]){
    if (DEBUG) console.log(this.id, this.role, ...args);
  }

  getFlag(){
    return this.memory.flag ? FlagManager.fromFlagName(this.memory.flag) : undefined;
  }

  getAnchor(){
    return this.memory.anchor && Game.getObjectById(this.memory.anchor);
  }

  rememberAction(callback:(storedTarget:TargetableTypes)=>TargetableTypes, actionName:string, overrideActions: string[] = []){
    const isCurrentAction = this.currentAction === actionName;
    if (!this.currentAction || isCurrentAction || overrideActions.includes(this.currentAction)){
      const storedTarget = isCurrentAction && this.memory.target ? this.targetToObject(this.memory.target) : null;
      const target = this.objectToTarget(callback.apply(this, [ storedTarget ]));
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

  startMoving(){

  }

  moveWithinRange(pos:RoomPosition, range:number=1){
    if (this.pos.inRangeTo(pos, range)) return false;
    const moving = this.moveTo(pos);
    if (moving === OK || moving === ERR_TIRED){
      return true;
    }else if (moving === ERR_NO_PATH){
      this.say('stuck');
      // console.log(`[${this.room.name}] Creep ${this.name} cannot find a path while doing ${this.currentAction}...`);
    }else{
      console.log(`[${this.room.name}] Creep moving error`, this.currentAction, moving, this.name);
    }
    return true;
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

  commute(){
    if (this.memory.office && this.memory.office !== this.room.name){
      const direction = this.room.findExitTo(this.memory.office);
      if (direction === ERR_NO_PATH) return console.log(`No path to office found.`);
      if (direction === ERR_INVALID_ARGS) return console.log(`Invalid office args.`);
      const exit = this.pos.findClosestByRange(direction);
      this.say('commuting');
      this.moveTo(exit!);
      return true;
    }
  }

  work():any{
    if (this.spawning) return;

    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    const roomAudit = getRoomAudit(this.room);

    /* this stuff deals with energy */
    if (!roomAudit.creepCountsByRole.courier){
      //Don't bother picking stuff up off the floor. Leave it to the couriers.
      if (this.rememberAction(this.startPickup, 'pickup', ['mining'])) return;
    }
    if (this.rememberAction(this.startTakingEnergy, 'taking', ['mining'])) return;

    if (energyCapacity > 0){ //Do something with the energy
      if (this.commute()) return;
      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading', 'building', 'repairing'])) return;
      if (this.rememberAction(this.startBuilding, 'building', ['upgrading'])) return;
      if (this.rememberAction(this.startRepairing, 'repairing', ['upgrading'])) return;
      if (this.rememberAction(this.startStocking, 'stocking', ['upgrading'])) return;
      // if (this.rememberAction(this.startSpreading, 'spreading')) return; //basic workers don't need to spread their energy around
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
      if (this.rememberAction(this.startStoring, 'storing')) return;
    }

    if (roomAudit.creepCountsByRole.harvester > roomAudit.sources.length){
      //Let the miners do it, the basic creeps are jamming things up...
      if (this.rememberAction(this.startHarvesting, 'mining')) return;
    }

    this.idle();

    // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
  }
}
