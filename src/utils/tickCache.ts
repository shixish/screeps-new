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

export const claimAmount = (objectId:string, resourceType:ClaimableConstant, amount:number)=>{
  const cache = objectCache.get(objectId) || {};
  if (!cache.claimedQuantities) cache.claimedQuantities = {};
  cache.claimedQuantities[resourceType] = getClaimedAmount(objectId, resourceType) + amount;
  objectCache.set(objectId, cache);
};

export const clearTickCache = ()=>{
  objectCache.clear();
  roomAuditCache.clear();
  creepAnchorCache.clear();
};
