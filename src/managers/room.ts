// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

import { FlagManager } from "flags/FlagManager";
import { CreepRoleName, CreepRoleNames, FlagType, maxStorageFill } from "utils/constants";
import { CreepAnchor, CreepControllerAnchor, CreepMineralAnchor, CreepSourceAnchor, GenericAnchorType } from "utils/CreepAnchor";
import { roomAuditCache } from "../utils/tickCache";
import { creepCountParts, CreepRoles, getCreepName, getCreepPartsCost } from "./creeps";

// const lookAround = (object:RoomObject, callback=(result:LookAtResult<LookConstant>[])=>{})=>{
//   if (!object || !object.room) return console.log('ERROR: invalid object passed to lookAround');
//   for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
//     callback(object.room.lookAt(object.pos.x + coord[0], object.pos.y + coord[1]));
//   }
// };

const lookAround = function*(object:RoomObject, callback=(result:LookAtResult<LookConstant>[])=>{}){
  if (!object || !object.room) return console.log('ERROR: invalid object passed to lookAround');
  for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
    yield object.room.lookAt(object.pos.x + coord[0], object.pos.y + coord[1]);
  }
};
// for (let spot of lookAround(spawn)){
//   const { terrain } = spot.find(result=>result.type === LOOK_TERRAIN) as LookAtResult<LOOK_TERRAIN>;

//   if (terrain !== "wall"){
//     room.createFlag(flagName);
//   }
// }

// export class RoomSource extends Source implements CreepAnchor{
//   constructor(id:Id<Source>){
//     super(id);
//     this.memory.occupancy = this.memory.occupancy.filter(creepName=>Boolean(Game.creeps[creepName]));
//   }

//   get memory():SourceMemory{
//     if (!Memory.sources) Memory.sources = {};
//     return Memory.sources[this.id] || (Memory.sources[this.id] = {
//       occupancy: [],
//       seats: RoomSource.getTotalSeats(this),
//     });
//   }

//   static getTotalSeats(source:RoomSource){
//     let seats = 0;
//     const mapTerrain = source.room.getTerrain();
//     for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
//       const terrain = mapTerrain.get(source.pos.x + coord[0], source.pos.y + coord[1]);
//       if (terrain !== TERRAIN_MASK_WALL) seats++;
//       // const newX = this.pos.x + coord[0], newY = this.pos.y + coord[1];
//       // const terrain = (this.room.lookAt(newX, newY).find(result=>result.type === LOOK_TERRAIN) as LookAtResult<LOOK_TERRAIN>).terrain;
//       // if (terrain !== "wall") sourceSeats++;
//     }
//     return seats;
//   };

//   get totalSeats(){
//     return this.memory.seats;
//   }

//   get occupancy(){
//     // this.memory.occupancy = this.memory.occupancy.filter(creepName=>Boolean(Game.creeps[creepName]));
//     return this.memory.occupancy.length;
//   }

//   get seats(){
//     return this.totalSeats - this.occupancy;
//   }

//   addOccupant(creepName:Creep['name']){
//     this.memory.occupancy.push(creepName);
//   }
// }

// export class RoomController extends StructureController implements CreepAnchor{
//   constructor(id:Id<StructureController>){
//     super(id);
//     this.memory.occupancy = this.memory.occupancy.filter(creepName=>Boolean(Game.creeps[creepName]));
//   }

//   get memory():SourceMemory{
//     if (!Memory.sources) Memory.sources = {};
//     return Memory.sources[this.id] || (Memory.sources[this.id] = {
//       occupancy: [],
//       seats: RoomSource.getTotalSeats(this),
//     });
//   }

//   addOccupant(creepName:Creep['name']){
//     this.memory.occupancy.push(creepName);
//   }
// }

// const getSources = (room:Room)=>{
//   if (room.memory.sources) return room.memory.sources.map(id=>new CreepSourceAnchor(Game.getObjectById(id) as Source))
//   const sources = room.find(FIND_SOURCES);
//   room.memory.sources = sources.map(source=>source.id);
//   return sources.map(source=>new CreepSourceAnchor(source));
// };

// const getMineral = (room:Room)=>{
//   if (room.memory.mineral === null) return;
//   if (room.memory.mineral) return new CreepMineralAnchor(Game.getObjectById(room.memory.mineral) as Mineral);
//   const [ mineral ] = room.find(FIND_MINERALS);
//   if (mineral){
//     room.memory.mineral = mineral.id;
//     return new CreepMineralAnchor(mineral);
//   }else{
//     room.memory.mineral = null;
//     return;
//   }
// };

// const getMinableMineral = (room:Room)=>{
//   if (room.controller?.level! >= 6){
//     const mineral = getMineral(room);
//     if (mineral?.anchor.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_EXTRACTOR)) return mineral;
//   }
//   return;
// }

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
  anchor?:CreepAnchor<GenericAnchorType>|FlagManager|undefined;
}

export class RoomAudit{
  room:Room;
  controller?:CreepControllerAnchor;
  controllerLevel:number;
  storedEnergy:number;
  mineral?:CreepMineralAnchor;
  storedMineral:number;
  sources:CreepSourceAnchor[];
  sourceSeats:number;
  creeps:Creep[];
  creepCountsByRole:Record<CreepRoleName, number>;
  hostileCreeps:Creep[];
  flags:Record<FlagType, FlagManager[]> = Object.values(FlagType).reduce((out, key)=>{
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
    this.sourceSeats = this.sources.reduce((out, source)=>out + source.totalSeats, 0);
    this.creeps = room.find(FIND_MY_CREEPS);
    this.creepCountsByRole = this.getCreepCountsByRole();
    this.hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  }

  getCreepCountsByRole(){
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
    return creepCountsByRole;
  }

  private getSources(){
    if (this.room.memory.sources) return this.room.memory.sources.map(id=>new CreepSourceAnchor(Game.getObjectById(id) as Source))
    const sources = this.room.find(FIND_SOURCES);
    this.room.memory.sources = sources.map(source=>source.id);
    return sources.map(source=>new CreepSourceAnchor(source));
  }

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
      const tier = CreepRoles[creepRoleName].config.tiers.reduce((heighestTier, currentTier)=>{
        if (!currentTier.cost) currentTier.cost = getCreepPartsCost(currentTier.body);
        return currentTier.cost <= budget && (currentTier.requires?currentTier.requires(this):true) && currentTier || heighestTier;
      }, null as CreepTier|null);
      return tier && {
        role: creepRoleName,
        tier: tier,
      } as SpawnableCreep || null;
    };

    if (this.hostileCreeps.length){
      //We don't currently have logic for defender creeps. Just let everything die and save our stored energy until the invader times out.
      return [];
    }

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
        const count = this.creepCountsByRole[roleName];
        const getMax = spawnableCreep.tier.max || config.max;
        if (!getMax) throw `Unable to get max count for ${roleName}`;
        const max = getMax(this);
        if (count < max){
          spawnableCreep.anchor = config.getCreepAnchor?.(this)
          if (config.getCreepAnchor){
            const anchor = config.getCreepAnchor(this);
            if (anchor){
              spawnableCreep.anchor = anchor;
            }else{
              console.log(`Unable to find creep anchor`);
              continue;
            }
          }

          const percentage = count/max;
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
}

export const getRoomAudit:(room:Room)=>RoomAudit = (room)=>{
  const cached = roomAuditCache.get(room.name);
  if (cached) return cached;
  else{
    const audit = new RoomAudit(room);
    roomAuditCache.set(room.name, audit);
    return audit;
  }
};
