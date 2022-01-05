import { flagManagerCache } from "utils/tickCache";
import { FlagType } from "utils/constants";
import { ClaimFlag } from "flags/ClaimFlag";
import { BuildFlag } from "flags/BuildFlag";
import { AuditFlag } from "flags/AuditFlag";
import { PowerFlag } from "flags/PowerFlag";

export const FlagManagers = { //:Record<FlagType, FlagManager>
  [FlagType.Claim]: ClaimFlag,
  [FlagType.Build]: BuildFlag,
  [FlagType.Audit]: AuditFlag,
  [FlagType.Power]: PowerFlag,
} as const;

// const getFlagType = (flagName:Flag['name'])=>{
//   const [ roomName, flagType ] = flagName.split(':');
//   return flagType;
// }

// export getFlagFromFlagName(flagName: Flag['name']) {
//   return this.fromFlag(Game.flags[flagName]);
// }

export function getFlagManager(flagOrName?: Flag|Flag['name']) {
  if (!flagOrName) return;
  let flag:Flag|undefined, flagName:Flag['name'];
  if (flagOrName instanceof Flag){
    flag = flagOrName;
    flagName = flagOrName.name;
  }else{
    flagName = flagOrName;
  }
  if (flagManagerCache.has(flagName)){
    return flagManagerCache.get(flagName);
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
      console.log('flag error', e, e.stack);
    }
  }
}
