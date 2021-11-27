// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

import { CreepRoles } from "./creeps";

const roomAudits:Record<Room["name"], RoomAudit> = {};
export const getRoomAudit:(room:Room)=>RoomAudit = (room)=>{
  if (roomAudits[room.name]) return roomAudits[room.name];
  else{
    const controllerLevel = room.controller?.level || 0;
    if (room.memory.sourceCount === undefined){
      const sources = room.find(FIND_SOURCES);
      room.memory.sourceCount = sources.length;
    }
    const sourceCount = room.memory.sourceCount;
    const creeps = room.find(FIND_MY_CREEPS);
    const creepCountsByRole = Object.keys(CreepRoles).reduce((out, roleName)=>{
      out[roleName] = 0;
      return out;
    }, {} as any) as RoomAudit['creepCountsByRole'];
    creeps.forEach(creep=>{
      const role = Memory.creeps[creep.name].role;
      creepCountsByRole[role]++;
    });
    return roomAudits[room.name] = {
      controllerLevel,
      creeps,
      creepCountsByRole,
      sourceCount,
    };
  }
};
