// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

import { RemoteFlag } from "flags/_RemoteFlag";
import { CreepRoleName, CreepRoleNames, FlagType, maxStorageFill } from "utils/constants";
import { CreepAnchor, CreepControllerAnchor, CreepMineralAnchor, CreepSourceAnchor, GenericAnchorType } from "utils/CreepAnchor";
import { diamondCoordinates, diamondRingCoordinates, findDiamondPlacement, getBestCentralLocation, getBestContainerLocation, getSpawnRoadPath, getStructureCostMatrix } from "utils/map";
import { getRoomAudit, roomAuditCache } from "../utils/tickCache";
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
    this.storedMineral = this.mineral && room.storage?.store[this.mineral.anchor.mineralType] || 0;
    this.sources = this.getSources();
    this.creeps = room.find(FIND_MY_CREEPS);
    this.hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);

    if (this.controller?.anchor.my){
      this.room.visual.text(`${this.controllerLevel} → ${this.buildStage}`, this.controller.pos.x, this.controller.pos.y+1);
    }

    try{
      //The building placement logic is heavy on CPU so only try to place one thing per tick.
      //Do the build queue before createConstructionSites so that things queued will be constructed on the following tick.
      const structureType = this.buildQueue.shift();
      if (structureType){
        this.createDiamondConstructionSites(structureType);
      }
    }catch(e:any){
      //TODO: What happens if createDiamondConstructionSites fails? We'll have to fix it manually :shrug:
      console.log(`[${room.name}] createDiamondConstructionSites error:`, e, e.stack);
    }

    try{
      if (this.controllerLevel >= this.buildStage && this.constructionSites.length === 0 && this.buildQueue.length === 0){
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
    this.room.memory.buildSubStage = 0;
  }

  get buildSubStage(){
    return this.room.memory.buildSubStage || 0;
  }

  set buildSubStage(buildSubStage:number){
    this.room.memory.buildSubStage = buildSubStage;
  }

  get buildQueue(){
    return this.room.memory.buildQueue || (this.room.memory.buildQueue = []);
  }

  get center(){
    if (!this.room.memory.center){
      const [ spawn ] = this.room.find(FIND_MY_SPAWNS);
      this.center = spawn && spawn.pos || getBestCentralLocation(this.room);
    }
    return new RoomPosition(this.room.memory.center.x, this.room.memory.center.y, this.room.name);
  }

  set center(pos:RoomPosition){
    if (pos.roomName !== this.room.name) throw `Invalid center location. Wrong room! ${pos.roomName} !== ${this.room.name}`;
    this.room.memory.center = { x:pos.x, y:pos.y };
  }

  //This can be used to restart a room. Might be necessary once it's destroyed and needs to be rebuilt.
  resetRoom(){
    this.room.memory.buildStage = 0;
    this.room.memory.buildSubStage = 0;
    this.room.memory.buildQueue = [];
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

  private _mineral:CreepMineralAnchor|undefined;
  get mineral(){
    if (this._mineral) return this._mineral;
    if (this.room.memory.mineral === null) return;
    if (this.room.memory.mineral) return this._mineral = new CreepMineralAnchor(Game.getObjectById(this.room.memory.mineral) as Mineral);
    const [ mineral ] = this.room.find(FIND_MINERALS);
    if (mineral){
      this.room.memory.mineral = mineral.id;
      return this._mineral = new CreepMineralAnchor(mineral);
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
        }
        if (maxCreepCount && currentCreepCount < maxCreepCount){
          if (config.getCreepAnchor){
            const anchor = config.getCreepAnchor(this);
            if (anchor){
              spawnableCreep.anchor = anchor;
            }else{
              console.log(`Unable to find creep anchor for ${roleName} in ${this.room.name}`);
              continue;
            }
          }
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

  // get maxExtensionCount(){
  //   switch(this.room.controller?.level){
  //     case 2:
  //       return 5;
  //     case 3:
  //       return 10;
  //     case 4:
  //       return 20;
  //     case 5:
  //       return 30;
  //     case 6:
  //       return 40;
  //     case 7:
  //       return 50;
  //     case 8:
  //       return 60;
  //     default:
  //       return 0;
  //   }
  // }

  createDiamondConstructionSites(structureType:BuildableStructureConstant){
    const diamondSize = structureType === STRUCTURE_EXTENSION ? 1 : 0;
    //Weight towards building next to the spawn when placing small diamonds for things like towers and storage
    const structureMatrix = diamondSize === 0 ? getStructureCostMatrix(this.room, 4, STRUCTURE_SPAWN) : getStructureCostMatrix(this.room, 4);
    const [x, y] = findDiamondPlacement(this.room, diamondSize, structureMatrix);
    for (const [dx, dy] of diamondCoordinates(x, y, diamondSize)){
      this.room.createConstructionSite(dx, dy, structureType);
    }
    for (const [rx, ry] of diamondRingCoordinates(x, y, diamondSize+1)){
      this.room.createConstructionSite(rx, ry, STRUCTURE_ROAD);
    }
  }

  createRampartConstructionSites(){
    this.room.find(FIND_MY_STRUCTURES, {
      filter: structure=>structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_TOWER || structure.structureType === STRUCTURE_STORAGE
    }).forEach(structure=>{
      this.room.createConstructionSite(structure.pos, STRUCTURE_RAMPART);
    });
    this.sources.forEach(source=>{
      source.containers.forEach(container=>{
        this.room.createConstructionSite(container.pos, STRUCTURE_RAMPART);
      });
    });
  }

  createConstructionSitesCL1():boolean{
    switch(this.buildSubStage){
      case 0:{
        const [ spawn ] = this.room.find(FIND_MY_SPAWNS);
        this.room.createConstructionSite(spawn.pos.x-1, spawn.pos.y, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x+1, spawn.pos.y, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x, spawn.pos.y-1, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x, spawn.pos.y+1, STRUCTURE_ROAD);

        const sources = this.room.find(FIND_SOURCES);
        sources.forEach(source=>{
          const sourceContainerPos = getBestContainerLocation(source.pos, spawn.pos);
          this.room.createConstructionSite(sourceContainerPos, STRUCTURE_CONTAINER);
        });

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites();
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL2():boolean{
    const [ spawn ] = this.room.find(FIND_MY_SPAWNS);
    switch(this.buildSubStage){
      case 0:{
        //Make an outer ring around the first spawn. This will help place towers and storage later.
        this.room.createConstructionSite(spawn.pos.x-2, spawn.pos.y-1, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x-1, spawn.pos.y-2, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x+2, spawn.pos.y-1, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x+1, spawn.pos.y-2, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x-2, spawn.pos.y+1, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x-1, spawn.pos.y+2, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x+2, spawn.pos.y+1, STRUCTURE_ROAD);
        this.room.createConstructionSite(spawn.pos.x+1, spawn.pos.y+2, STRUCTURE_ROAD);

        this.buildSubStage++;
      }
      break;
      case 1:{
        //Need to wait for the initial construction sites to be built before proceeding since they will be used in the pathing calculations
        this.sources.forEach(source=>{
          const [ container ] = source.containers;
          const sourceRoadPath = getSpawnRoadPath(spawn, container?.pos || source.pos);
          sourceRoadPath.forEach(step=>{
            this.room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
          });
        });
        if (this.room.controller){
          const controllerRoadPath = getSpawnRoadPath(spawn, this.room.controller.pos);
          controllerRoadPath.forEach(step=>{
            this.room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
          });
        }

        this.buildSubStage++;
      }
      break;
      case 2:{
        if (this.room.controller){
          const controllerContainerPos = getBestContainerLocation(this.room.controller.pos, spawn.pos);
          this.room.createConstructionSite(controllerContainerPos, STRUCTURE_CONTAINER);
        }

        //Build 5 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);

        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL3():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_TOWER);

        //Build 5 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new tower
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL4():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_STORAGE);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new storage
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL5():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_TOWER);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new tower
        return true;
      }
    }
    return false;
  }

  createExtractorConstructionSites(){
    const [ mineral ] = this.room.find(FIND_MINERALS);
    if (mineral){
      const [ spawn ] = this.room.find(FIND_MY_SPAWNS);
      this.room.createConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);

      const mineralContainerPos = getBestContainerLocation(mineral.pos, spawn.pos);
      this.room.createConstructionSite(mineralContainerPos, STRUCTURE_CONTAINER);

      const controllerRoadPath = getSpawnRoadPath(spawn, mineralContainerPos);
      controllerRoadPath.forEach(step=>{
        this.room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      });
    }
  }

  createConstructionSitesCL6():boolean{
    this.createExtractorConstructionSites();

    //Build 10 extensions:
    this.buildQueue.push(STRUCTURE_EXTENSION);
    this.buildQueue.push(STRUCTURE_EXTENSION);

    return true;
  }

  createConstructionSitesCL7():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_TOWER);
        this.buildQueue.push(STRUCTURE_SPAWN);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new spawn
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL8():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_SPAWN);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new spawn
        return true;
      }
    }
    return false;
  }

  createConstructionSites(){
    const stageResult:boolean = (()=>{
      switch(this.buildStage){
        case 0:
          const [ spawn ] = this.room.find(FIND_MY_SPAWNS);
          //Claim flag should get the first spawn set up.
          return Boolean(spawn);
        case 1: return this.createConstructionSitesCL1();
        case 2: return this.createConstructionSitesCL2();
        case 3: return this.createConstructionSitesCL3();
        case 4: return this.createConstructionSitesCL4();
        case 5: return this.createConstructionSitesCL5();
        case 6: return this.createConstructionSitesCL6();
        case 7: return this.createConstructionSitesCL7();
        case 8: return this.createConstructionSitesCL8();
        default:
          throw 'invalid this.buildStage';
      }
    })();

    //If the callback returns true it means the stage is done and we can proceed.
    if (stageResult){
      this.buildStage++;
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
