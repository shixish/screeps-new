import { random } from "./random";

/*
  Spawn names carry the creep's job and body tier so the room view reads like a roster instead of a
  wall of hashes: 'HarvesterT2#c9d0' rather than 'harvester#c635b442a99f'. Screeps still requires the
  name to be unique, so a short random suffix trails the readable prefix.
*/
const NAME_SUFFIX_LENGTH = 4;
const UNIQUE_NAME_ATTEMPTS = 10;

/* 'remote-harvester' -> 'RemoteHarvester' */
export const toPascalCase = (roleName:string)=>{
  return roleName.split('-').filter(word=>word.length > 0).map(word=>{
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('');
};

/*
  The readable half of the name. The base tier (index 0) wears a bare role label - only the upgrades
  above it get tagged, counting from T2 so the label matches how a player talks about tiers.
*/
export const getCreepLabel = (roleName:string, tierIndex = 0)=>{
  return toPascalCase(roleName) + (tierIndex > 0 ? `T${tierIndex+1}` : '');
};

const nameSuffix = ()=>random().slice(0, NAME_SUFFIX_LENGTH).padEnd(NAME_SUFFIX_LENGTH, '0');

export const getCreepName = (roleName = 'creep', tierIndex = 0, taken:{ [name:string]: unknown } = Game.creeps)=>{
  const label = getCreepLabel(roleName, tierIndex);
  for (let attempt = 0; attempt < UNIQUE_NAME_ATTEMPTS; attempt++){
    const name = `${label}#${nameSuffix()}`;
    if (!taken?.[name]) return name;
  }
  return `${label}#${random()}`; //Wildly unlucky (or a huge fleet) - fall back to the long suffix
};
