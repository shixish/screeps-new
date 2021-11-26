type TickCache = {
  claimedResources?: {
    [type in ResourceConstant]?: number
  },
}
export const tickCache = new Map<string, TickCache>();

export const getClaimedAmount = (objectId:string, resourceType:ResourceConstant)=>{
  const cache = tickCache.get(objectId);
  if (!cache || !cache.claimedResources) return 0;
  return cache.claimedResources[resourceType] || 0;
};

export const claimAmount = (objectId:string, resourceType:ResourceConstant, amount:number)=>{
  const cache = tickCache.get(objectId) || {};
  if (!cache.claimedResources) cache.claimedResources = {};
  cache.claimedResources[resourceType] = getClaimedAmount(objectId, resourceType) + amount;
  tickCache.set(objectId, cache);
};
