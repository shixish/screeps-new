// export const getSourceMemory = (source:Source)=>{
//   const room = source.room;
//   if (!room.memory.sources) room.memory.sources = {};
//   return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
// };

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
    const creepCountsByRole = creeps.reduce((out, result)=>{
      const role = Memory.creeps[result.name].role;
      out[role] = out[role] === undefined ? 1 : out[role] + 1;
      return out;
    }, {} as RoomAudit['creepCountsByRole'] );
    return roomAudits[room.name] = {
      controllerLevel,
      creeps,
      creepCountsByRole,
      sourceCount,
    };
  }
};
