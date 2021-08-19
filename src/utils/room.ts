export const getSourceMemory = (source:Source)=>{
  const room = source.room;
  if (!room.memory.sources) room.memory.sources = {};
  return room.memory.sources[source.id] || (room.memory.sources[source.id] = {});
}
