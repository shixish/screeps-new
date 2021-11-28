type TickCache = {
  claimedResources?: {
    [type in ResourceConstant]?: number
  },
}
export const objectCache = new Map<string, TickCache>();
export const roomAuditCache = new Map<Room["name"], RoomAudit>();

export const getClaimedAmount = (objectId:string, resourceType:ResourceConstant)=>{
  const cache = objectCache.get(objectId);
  if (!cache || !cache.claimedResources) return 0;
  return cache.claimedResources[resourceType] || 0;
};

export const claimAmount = (objectId:string, resourceType:ResourceConstant, amount:number)=>{
  const cache = objectCache.get(objectId) || {};
  if (!cache.claimedResources) cache.claimedResources = {};
  cache.claimedResources[resourceType] = getClaimedAmount(objectId, resourceType) + amount;
  objectCache.set(objectId, cache);
};

export const clearTickCache = ()=>{
  objectCache.clear();
  roomAuditCache.clear();
};
