// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

import { CreepRoleNames } from "utils/constants";
import { roomAuditCache } from "../utils/tickCache";

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

export function countAvailableSeats(pos:RoomPosition){
  let seats = 0;
  const mapTerrain = Game.rooms[pos.roomName].getTerrain();
  for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
    const terrain = mapTerrain.get(pos.x + coord[0], pos.y + coord[1]);
    if (terrain !== TERRAIN_MASK_WALL) seats++;
    // const newX = this.pos.x + coord[0], newY = this.pos.y + coord[1];
    // const terrain = (this.room.lookAt(newX, newY).find(result=>result.type === LOOK_TERRAIN) as LookAtResult<LOOK_TERRAIN>).terrain;
    // if (terrain !== "wall") sourceSeats++;
  }
  return seats;
};

if (!Memory.anchors) Memory.anchors = {};
export class CreepAnchor<AnchorType extends Source|Structure = Source|Structure>{
  anchor:AnchorType;
  containers: StructureContainer[] = [];
  // getCapacity = ()=>{
  //   return this.containers.reduce((out, container)=>{
  //     return out + container.store.getCapacity(RESOURCE_ENERGY);
  //   }, 0 as number);
  // };
  // getUsedCapacity = ()=>{
  //   return this.containers.reduce((out, container)=>{
  //     return out + container.store.getUsedCapacity(RESOURCE_ENERGY);
  //   }, 0 as number);
  // };
  // getFreeCapacity = ()=>{
  //   return this.containers.reduce((out, container)=>{
  //     return out + container.store.getFreeCapacity(RESOURCE_ENERGY);
  //   }, 0 as number);
  // };
  // store = {
  //   get energy(){
  //     return this.getUsedCapacity();
  //   },
  //   getCapacity: this.getCapacity,
  //   getUsedCapacity: this.getUsedCapacity,
  //   getFreeCapacity: this.getFreeCapacity,
  // }

  constructor(anchor:AnchorType){
    this.anchor = anchor;
    this.memory.occupancy = this.memory.occupancy.filter(creepName=>Boolean(Game.creeps[creepName]));
    this.memory.containers = this.memory.containers.filter(id=>{
      const container = Game.getObjectById(id);
      if (container){
        this.containers.push(container);
      }
      return false;
    });
    if (!this.containers.length){
      this.containers = anchor.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure=>{
          return structure.structureType === STRUCTURE_CONTAINER;
        }
      }) as StructureContainer[];
      this.memory.containers = this.containers.map(container=>container.id);
    }
  }

  get memory():AnchorMemory{
    return Memory.anchors[this.anchor.id] || (Memory.anchors[this.anchor.id] = {
      seats: countAvailableSeats(this.anchor.pos),
      occupancy: [],
      containers: [],
    });
  }

  get occupancy(){
    return this.memory.occupancy.length;
  }

  get totalSeats(){
    return this.memory.seats;
  }

  get availableSeats(){
    return this.totalSeats - this.occupancy;
  }

  addOccupant(creepName:Creep['name']){
    this.memory.occupancy.push(creepName);
  }
}

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

const getSources = (room:Room)=>{
  if (room.memory.sources) return room.memory.sources.map(id=>new CreepAnchor(Game.getObjectById(id) as Source))
  const sources = room.find(FIND_SOURCES);
  room.memory.sources = sources.map(source=>source.id);
  return sources.map(source=>new CreepAnchor(source));
};

const getStorageLocation = (room:Room)=>{
  const flagName = `${room.name}_storage`;
  if (!room.controller?.level || room.controller.level < 4) return;
  if (room.storage){
    const flag = Game.flags[flagName];
    if (flag) flag.remove();
    return room.storage;
  }else{
    if (!Game.flags[flagName]){
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      room.createFlag(spawn.pos.x, spawn.pos.y, flagName);
    }
    const flag = Game.flags[flagName];
    const constructionSite = flag.pos.lookFor(LOOK_CONSTRUCTION_SITES).find(site => site.structureType === STRUCTURE_STORAGE);
    if (!constructionSite){
      room.createConstructionSite(flag.pos.x, flag.pos.y, STRUCTURE_STORAGE);
    }
    return flag;
  }
};

export const getRoomAudit:(room:Room)=>RoomAudit = (room)=>{
  const cached = roomAuditCache.get(room.name);
  if (cached) return cached;
  else{
    // const { sourceCount, sourceSeats } = sourceAudit(room);
    getStorageLocation(room);
    const creeps = room.find(FIND_MY_CREEPS);
    const creepCountsByRole = CreepRoleNames.reduce((out, roleName)=>{
      out[roleName] = 0;
      return out;
    }, {} as any) as RoomAudit['creepCountsByRole'];
    creeps.forEach(creep=>{
      const role = Memory.creeps[creep.name].role;
      creepCountsByRole[role]++;
    });
    const sources = getSources(room);
    const sourceSeats = sources.reduce((out, source)=>out + source.totalSeats, 0);
    const audit:RoomAudit = {
      controller: room.controller && new CreepAnchor(room.controller),
      controllerLevel: room.controller?.level || 0,
      creeps,
      creepCountsByRole,
      sources,
      sourceSeats,
      flags:[],
    };
    // console.log(`creepCountsByRole`, JSON.stringify(creepCountsByRole));
    roomAuditCache.set(room.name, audit);
    return audit;
  }
};
