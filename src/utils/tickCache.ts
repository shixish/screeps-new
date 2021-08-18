type TickCache = {
  claimedResources?: {
    [type in ResourceConstant]?: number
  },
}
export const tickCache:{[objectId:string]: TickCache} = {};

export const getClaimedAmount = (objectId:string, resourceType:ResourceConstant)=>{
  if (!tickCache[objectId]) return 0;
  if (!tickCache[objectId].claimedResources) return 0;
  return tickCache[objectId].claimedResources![resourceType] || 0;
};

export const claimAmount = (objectId:string, resourceType:ResourceConstant, amount:number)=>{
  if (!tickCache[objectId]) tickCache[objectId] = {};
  if (!tickCache[objectId].claimedResources) tickCache[objectId].claimedResources = {};
  tickCache[objectId].claimedResources![resourceType] = getClaimedAmount(objectId, resourceType) + amount;
};
