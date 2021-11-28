// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

import { CreepRoles } from "./creeps";
import { roomAuditCache } from "./tickCache";

const sourceAudit = (room:Room)=>{
  if (room.memory.sourceSeats === undefined){
    const sources = room.find(FIND_SOURCES);
    let sourceSeats = 0;
    for (let source of sources){
      for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
        const newX = source.pos.x + coord[0], newY = source.pos.y + coord[1];
        const terrain = (source.room.lookAt(newX, newY).find(result=>result.type === LOOK_TERRAIN) as LookAtResult<LOOK_TERRAIN>).terrain;
        if (terrain !== "wall") sourceSeats++;
      }
    }
    room.memory.sourceCount = sources.length;
    room.memory.sourceSeats = sourceSeats;
  }
  return {
    sourceCount: room.memory.sourceCount,
    sourceSeats: room.memory.sourceSeats,
  };
};

export const getRoomAudit:(room:Room)=>RoomAudit = (room)=>{
  const cached = roomAuditCache.get(room.name);
  if (cached) return cached;
  else{
    const controllerLevel = room.controller?.level || 0;
    const { sourceCount, sourceSeats } = sourceAudit(room);
    const creeps = room.find(FIND_MY_CREEPS);
    const creepCountsByRole = Object.keys(CreepRoles).reduce((out, roleName)=>{
      out[roleName] = 0;
      return out;
    }, {} as any) as RoomAudit['creepCountsByRole'];
    creeps.forEach(creep=>{
      const role = Memory.creeps[creep.name].role;
      creepCountsByRole[role]++;
    });
    const audit:RoomAudit = {
      controllerLevel,
      creeps,
      creepCountsByRole,
      sourceCount,
      sourceSeats,
    };
    // console.log(`creepCountsByRole`, JSON.stringify(creepCountsByRole));
    roomAuditCache.set(room.name, audit);
    return audit;
  }
};
