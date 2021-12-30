import { CreepAnchor } from "./CreepAnchor";

export type ClaimableConstant = ResourceConstant|'repair';
type TickCache = {
  claimedQuantities?: {
    [type in ClaimableConstant]?: number
  },
}
export const objectCache = new Map<string, TickCache>();
export const roomAuditCache = new Map<Room["name"], RoomAudit>();
export const creepAnchorCache = new Map<Id<StructureConstant>, CreepAnchor>();

export const getClaimedAmount = (objectId:string, resourceType:ClaimableConstant)=>{
  const cache = objectCache.get(objectId);
  if (!cache || !cache.claimedQuantities) return 0;
  return cache.claimedQuantities[resourceType] || 0;
};

//Claiming a negative amount means we're adding that energy rather than taking it
export const claimAmount = (objectId:string, resourceType:ClaimableConstant, amount:number)=>{
  const cache = objectCache.get(objectId) || {};
  if (!cache.claimedQuantities) cache.claimedQuantities = {};
  cache.claimedQuantities[resourceType] = getClaimedAmount(objectId, resourceType) + amount;
  objectCache.set(objectId, cache);
};

interface RoomObjectWithStore extends RoomObject{
  id: Id<RoomObject>,
  store: StoreDefinition,
}
// export const hasResourceAvailable = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
//   return object.store.getUsedCapacity(resourceType) - getClaimedAmount(object.id, resourceType);
// };
export const getResourceAvailable = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
  return object.store.getUsedCapacity(resourceType) - getClaimedAmount(object.id, resourceType);
};

// export const hasResourceSpace = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
//   return object.store.getFreeCapacity(resourceType) + getClaimedAmount(object.id, resourceType);
// };
export const getResourceSpace = (object:RoomObjectWithStore, resourceType:ResourceConstant = RESOURCE_ENERGY)=>{
  return object.store.getFreeCapacity(resourceType) + getClaimedAmount(object.id, resourceType);
};

export const clearTickCache = ()=>{
  objectCache.clear();
  roomAuditCache.clear();
  creepAnchorCache.clear();
};
