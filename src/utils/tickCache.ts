import { FlagType } from "./constants";

export type ClaimableConstant = ResourceConstant|'repair';
type TickCache = {
  claimedQuantities?: {
    [type in ClaimableConstant]?: number
  },
}
export const objectCache = new Map<string, TickCache>();
export const roomAuditCache = new Map<Room["name"], RoomAudit>();
export const creepAnchorCache = new Map<Id<StructureConstant>, CreepAnchor>();
export const flagManagerCache = new Map<Flag['name'], BasicFlag>();
export const flagHomeCache = new Map<Room["name"], RoomFlags>();

const DEBUG_IDS:string[] = [];

export const getClaimedAmount = (objectId:string, resourceType:ClaimableConstant)=>{
  const cache = objectCache.get(objectId);
  if (!cache || !cache.claimedQuantities) return 0;
  if (DEBUG_IDS.includes(objectId)){
    console.log(`DEBUG getClaimedAmount(${objectId}, ${resourceType}) == ${cache.claimedQuantities[resourceType]}`);
  }
  return cache.claimedQuantities[resourceType] || 0;
};

//Claiming a negative amount means we're adding that energy rather than taking it
export const claimAmount = (objectId:string, resourceType:ClaimableConstant, amount:number)=>{
  const cache = objectCache.get(objectId) || {};
  if (!cache.claimedQuantities) cache.claimedQuantities = {};
  cache.claimedQuantities[resourceType] = getClaimedAmount(objectId, resourceType) + amount;
  objectCache.set(objectId, cache);
  if (DEBUG_IDS.includes(objectId)){
    console.log(`DEBUG claimAmount(${objectId}, ${resourceType}, ${amount})`);
  }
};

// export const hasResourceAvailable = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
//   return object.store.getUsedCapacity(resourceType) - getClaimedAmount(object.id, resourceType);
// };
export const getResourceAvailable = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
  if (DEBUG_IDS.includes(object.id)){
    console.log(`DEBUG getResourceAvailable(${object}, ${resourceType}) == ${object.store.getUsedCapacity(resourceType)} - ${getClaimedAmount(object.id, resourceType)} == ${object.store.getUsedCapacity(resourceType) - getClaimedAmount(object.id, resourceType)}`);
  }
  return object.store.getUsedCapacity(resourceType) - getClaimedAmount(object.id, resourceType);
};

// export const hasResourceSpace = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
//   return object.store.getFreeCapacity(resourceType) + getClaimedAmount(object.id, resourceType);
// };
export const getResourceSpace = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
  if (DEBUG_IDS.includes(object.id)){
    console.log(`DEBUG getResourceSpace(${object}, ${resourceType}) == ${object.store.getFreeCapacity(resourceType)} + ${getClaimedAmount(object.id, resourceType)} == ${object.store.getFreeCapacity(resourceType) + getClaimedAmount(object.id, resourceType)}`);
  }
  return object.store.getFreeCapacity(resourceType) + getClaimedAmount(object.id, resourceType);
};

export function getRoomAudit(room:Room){
  if (!room) throw 'Invalid room sent to getRoomAudit';
  return roomAuditCache.get(room.name)!;
};

export function getFlagManager(flagOrName:Flag|Flag['name']){
  const flagName = flagOrName instanceof Flag ? flagOrName.name : flagOrName;
  return flagManagerCache.get(flagName);
}

export function getRoomFlags(roomName:Room['name']){
  const roomFlags = flagHomeCache.get(roomName) || Object.values(FlagType).reduce((out, key)=>{
    out[key] = []; //initialize the flags arrays
    return out;
  }, {} as RoomFlags);
  if (!flagHomeCache.has(roomName)) flagHomeCache.set(roomName, roomFlags);
  return roomFlags;
}

export const clearTickCache = ()=>{
  objectCache.clear();
  roomAuditCache.clear();
  creepAnchorCache.clear();
  flagManagerCache.forEach(flagManager=>{
    if (!flagManager.flag){
      flagManager.remove();
    }
  });
  flagHomeCache.clear();
  flagManagerCache.clear();
};
