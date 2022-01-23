// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

import { RemoteFlag } from "flags/_RemoteFlag";
import { CreepRoleName, CreepRoleNames, FlagType, maxStorageFill } from "utils/constants";
import { CreepAnchor, CreepControllerAnchor, CreepMineralAnchor, CreepSourceAnchor, GenericAnchorType } from "utils/CreepAnchor";
import { getBestContainerLocation, getSpawnRoadPath } from "utils/map";
import { roomAuditCache } from "../utils/tickCache";
import { creepCountParts, CreepRoles, getCreepName, getCreepPartsCost } from "./creeps";

// const getStorageLocation = (room:Room)=>{
//   const flagName = `${room.name}_storage`;
//   if (!room.controller?.level || room.controller.level < 4) return;
//   if (room.storage){
//     const flag = Game.flags[flagName];
//     if (flag) flag.remove();
//     return room.storage;
//   }else{
//     if (!Game.flags[flagName]){
//       const spawn = room.find(FIND_MY_SPAWNS)[0];
//       room.createFlag(spawn.pos.x, spawn.pos.y, flagName);
//     }
//     const flag = Game.flags[flagName];
//     const constructionSite = flag.pos.lookFor(LOOK_CONSTRUCTION_SITES).find(site => site.structureType === STRUCTURE_STORAGE);
//     if (!constructionSite){
//       room.createConstructionSite(flag.pos.x, flag.pos.y, STRUCTURE_STORAGE);
//     }
//     return flag;
//   }
// };

interface SpawnableCreep{
  role:CreepRoleName;
  tier:CreepTier;
  anchor?:CreepAnchor<GenericAnchorType>;
  flag?:BasicFlag;
}

export class RoomAudit{
  room:Room;
  controller?:CreepControllerAnchor;
  controllerLevel:number;
  storedEnergy:number;
  mineral?:CreepMineralAnchor;
  storedMineral:number;
  sources:CreepSourceAnchor[];
  creeps:Creep[];
  hostileCreeps:Creep[];
  flags:{[T in FlagType]: InstanceType<FlagManagers[T]>[]} = Object.values(FlagType).reduce((out, key)=>{
    out[key] = []; //initialize the flags arrays
    return out;
  }, {} as RoomAudit['flags']);
  constructionSites:ConstructionSite[];

  constructor(room:Room){
    // this.name=room.name;
    this.room = room;
    this.controller = room.controller && new CreepControllerAnchor(room.controller);
    this.controllerLevel = room.controller?.level || 0;
    this.storedEnergy = room.storage?.store.energy || 0;
    this.mineral = this.getMineral();
    this.storedMineral = this.mineral && room.storage?.store[this.mineral.anchor.mineralType] || 0;
    this.sources = this.getSources();
    this.creeps = room.find(FIND_MY_CREEPS);
    this.hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);

    try{
      if (this.controllerLevel > this.buildStage){
        this.createConstructionSites();
      }
    }catch(e:any){
      console.log(`[${room.name}] createConstructionSites error:`, e, e.stack);
    }
  }

  protected _creepCountsByRole:Record<CreepRoleName, number>|undefined;
  get creepCountsByRole():Record<CreepRoleName, number>{
    if (this._creepCountsByRole) return this._creepCountsByRole;
    const creepCountsByRole = CreepRoleNames.reduce((out, roleName)=>{
      out[roleName] = 0;
      return out;
    }, {} as any) as RoomAudit['creepCountsByRole'];
    this.creeps.forEach(creep=>{
      const role = Memory.creeps[creep.name].role;
      creepCountsByRole[role]++;
    });
    const spawns = this.room.find(FIND_MY_SPAWNS);
    spawns.forEach(spawn=>{
      if (spawn.spawning){
        //Count spawning creeps. This is relevant when there are multiple spawns in a room. Otherwise the second spawn doesn't know that a new creep is already in production.
        const role = Memory.creeps[spawn.spawning.name].role;
        creepCountsByRole[role]++;
      }
    });
    return this._creepCountsByRole = creepCountsByRole;
  }

  get buildStage(){
    return this.room.memory.buildStage || 0;
  }

  set buildStage(buildStage:number){
    this.room.memory.buildStage = buildStage;
  }

  private getSources(){
    if (this.room.memory.sources) return this.room.memory.sources.map(id=>new CreepSourceAnchor(Game.getObjectById(id) as Source))
    const sources = this.room.find(FIND_SOURCES);
    this.room.memory.sources = sources.map(source=>source.id);
    return sources.map(source=>new CreepSourceAnchor(source));
  }

  protected _sourceSeats:number|undefined;
  get sourceSeats(){
    return this._sourceSeats || (this._sourceSeats = this.sources.reduce((out, source)=>out + source.totalSeats, 0));
  }

  // protected _sourceRate:number|undefined;
  // get sourceRate(){
  //   return this._sourceRate || (this._sourceRate = this.sources.length * (this.room.controller?.my ? 10 : 5));
  // }

  private getMineral(){
    if (this.room.memory.mineral === null) return;
    if (this.room.memory.mineral) return new CreepMineralAnchor(Game.getObjectById(this.room.memory.mineral) as Mineral);
    const [ mineral ] = this.room.find(FIND_MINERALS);
    if (mineral){
      this.room.memory.mineral = mineral.id;
      return new CreepMineralAnchor(mineral);
    }else{
      this.room.memory.mineral = null;
      return;
    }
  }

  private getSpawnableCreeps(){
    const getHeighestCreepSpawnable = (creepRoleName:CreepRoleName, currentlyAffordable = false)=>{
      const budget = currentlyAffordable ? this.room.energyAvailable : this.room.energyCapacityAvailable;
      const config = CreepRoles[creepRoleName].config;
      const tier = config.tiers.reduce((heighestTier, currentTier)=>{
        // if (!currentTier.cost) currentTier.cost = getCreepPartsCost(currentTier.body);
        return currentTier.cost <= budget && currentTier.requires?.(this)!==false && currentTier || heighestTier;
      }, null as CreepTier|null);
      return tier && {
        role: creepRoleName,
        tier: tier,
      } as SpawnableCreep || null;
    };

    if (this.creeps.length === 0){
      //If things get screwed up somehow just make the cheapest basic creep available to hopefully get things rolling again...
      return [getHeighestCreepSpawnable(CreepRoleName.Basic, true)!];
    }else{
      const spawnableCreeps:SpawnableCreep[] = [];
      for (const rn in CreepRoles){
        try{
          const roleName = rn as CreepRoleName;
          const spawnableCreep = getHeighestCreepSpawnable(roleName);
          if (spawnableCreep) spawnableCreeps.push(spawnableCreep);
        }catch(e:any){
          console.log(`[${this.room.name}] RoomAudit error in getSpawnableCreeps. Role: ${rn}`, e, e.stack);
        }
      }
      return spawnableCreeps;
    }
  }

  _spawnableCreeps?:SpawnableCreep[];
  get spawnableCreeps(){
    return this._spawnableCreeps || (this._spawnableCreeps = this.getSpawnableCreeps());
  }

  getPrioritySpawnableCreep(){
    let priorityPercentage:number;
    let prioritySpawnableCreep:SpawnableCreep|undefined;
    for (const spawnableCreep of this.spawnableCreeps){
      try{
        const roleName = spawnableCreep.role;
        const config = CreepRoles[roleName].config;
        let currentCreepCount:number = 0;
        let maxCreepCount:number|undefined;
        if (config.getCreepFlag){
          const flag = spawnableCreep.flag = config.getCreepFlag(this);
          if (flag){
            currentCreepCount = flag.followerRoleCounts[roleName] || 0;
            maxCreepCount = flag.maxFollowersByRole[roleName];
          }
        }else{
          currentCreepCount = this.creepCountsByRole[roleName];
          maxCreepCount = (spawnableCreep.tier.max || config.max)?.(this) ?? 0;
          if (config.getCreepAnchor){
            const anchor = config.getCreepAnchor(this);
            if (anchor){
              spawnableCreep.anchor = anchor;
            }else{
              console.log(`Unable to find creep anchor`);
              continue;
            }
          }
        }
        if (maxCreepCount && currentCreepCount < maxCreepCount){
          const percentage = currentCreepCount/maxCreepCount;
          if (!prioritySpawnableCreep || percentage < priorityPercentage!){
            priorityPercentage = percentage;
            prioritySpawnableCreep = spawnableCreep;
          }
        }
      }catch(e:any){
        console.log(`[${this.room.name}] RoomAudit error in getPrioritySpawnableCreep. Role: ${spawnableCreep.role}`, e, e.stack);
      }
    }
    return prioritySpawnableCreep;
  }

  createConstructionSites(){
    const spawns = this.room.find(FIND_MY_SPAWNS); //Later stages may make use of multiple spawns
    const spawn = spawns[0];
    //These basically correspond to controller level
    switch(this.buildStage){
      case 0:{
        //Claim flag should get the first spawn set up.
        if (spawn){
          this.buildStage = 1;
        }
      }
      break;
      case 1:{
        this.room.createConstructionSite(spawn.pos.x-1, spawn.pos.y, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x+1, spawn.pos.y, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x, spawn.pos.y-1, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x, spawn.pos.y+1, STRUCTURE_ROAD);
        const sources = this.room.find(FIND_SOURCES);
        sources.forEach(source=>{
          const sourceContainerPos = getBestContainerLocation(source.pos, spawn.pos);
          this.room.createConstructionSite(sourceContainerPos, STRUCTURE_CONTAINER);
        });
        this.buildStage = 2; //Progress to the next build stage
      }
      break;
      case 2:{
        const sources = this.room.find(FIND_SOURCES);
        sources.forEach(source=>{
          const sourceRoadPath = getSpawnRoadPath(spawn, source.pos);
          sourceRoadPath.path.forEach(pos=>{
            this.room.createConstructionSite(pos, STRUCTURE_ROAD);
          });
        });
        if (this.room.controller){
          const controllerContainerPos = getBestContainerLocation(this.room.controller.pos, spawn.pos);
          this.room.createConstructionSite(controllerContainerPos, STRUCTURE_CONTAINER);
          const controllerRoadPath = getSpawnRoadPath(spawn, controllerContainerPos);
          controllerRoadPath.path.forEach(pos=>{
            this.room.createConstructionSite(pos, STRUCTURE_ROAD);
          });
        }
        //TODO: Build extensions automatically

        this.buildStage = 3; //Progress to the next build stage
      }
      break;
    }
  }
}

export function initRoomAudits(){
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    const audit = new RoomAudit(room);
    roomAuditCache.set(room.name, audit);
  }
}
