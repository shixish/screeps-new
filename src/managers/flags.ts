import { flagManagerCache } from "utils/tickCache";
import { FlagType } from "utils/constants";
import { ClaimFlag } from "flags/ClaimFlag";
import { BuildFlag } from "flags/BuildFlag";
import { AuditFlag } from "flags/AuditFlag";
import { PowerFlag } from "flags/PowerFlag";
import { HarvestFlag } from "flags/HarvestFlag";

export const FlagManagers = { //:Record<FlagType, BasicFlag>
  [FlagType.Claim]: ClaimFlag,
  [FlagType.Build]: BuildFlag,
  [FlagType.Audit]: AuditFlag,
  [FlagType.Power]: PowerFlag,
  [FlagType.Harvest]: HarvestFlag,
} as const;

// const getFlagType = (flagName:Flag['name'])=>{
//   const [ roomName, flagType ] = flagName.split(':');
//   return flagType;
// }

// export getFlagFromFlagName(flagName: Flag['name']) {
//   return this.fromFlag(Game.flags[flagName]);
// }

export function getFlagManager(flagOrName?: Flag|Flag['name']):FlagManagerTypes|null {
  if (!flagOrName) return null;
  let flag:Flag|undefined, flagName:Flag['name'];
  if (flagOrName instanceof Flag){
    flag = flagOrName;
    flagName = flagOrName.name;
  }else{
    flagName = flagOrName;
  }
  if (flagManagerCache.has(flagName)){
    return flagManagerCache.get(flagName)!;
  }else{
    if (!flag) flag = Game.flags[flagName];
    const [flagType, options] = flag.name.split(':', 2) as [FlagType, string];
    const manager = flagType in FlagManagers && new FlagManagers[flagType](flag, flagType, options) || null;
    flagManagerCache.set(flagName, manager);
    return manager;
  }
}

export const manageFlags = ()=>{
  for (const flagName in Game.flags) {
    try{
      const flagManager = getFlagManager(flagName);
      if (flagManager){
        flagManager.work();
      }else{
        // console.log(`${flagName} has an unknown flag type:`, flagType);
      }
    }catch(e:any){
      console.log(`Flag ${flagName} error:`, e, e.stack);
    }
  }
}
