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

//This needs to be run after room audits are initialized. This will update the room audits to know about the appropriate flags.
// export function initFlagManagers(){
//   for (const flagName in Game.flags) {
//     const flag = Game.flags[flagName];
//     const [flagType, options] = flag.name.split(':', 2) as [FlagType, string];
//     if (flagType in FlagManagers){
//       const flagManager = new FlagManagers[flagType](flag, flagType, options);
//       flagManagerCache.set(flag.name, flagManager);
//     }
//   }
// }

// export function getFlagManager(flagOrName?: Flag|Flag['name']):FlagManagerTypes|null {
//   if (!flagOrName) return null;
//   let flag:Flag|undefined, flagName:Flag['name'];
//   if (flagOrName instanceof Flag){
//     flag = flagOrName;
//     flagName = flagOrName.name;
//   }else{
//     flagName = flagOrName;
//   }
//   if (flagManagerCache.has(flagName)){
//     return flagManagerCache.get(flagName)!;
//   }else{
//     if (!flag) flag = Game.flags[flagName];
//     const [flagType, options] = flag.name.split(':', 2) as [FlagType, string];
//     const manager = flagType in FlagManagers && new FlagManagers[flagType](flag, flagType, options) || null;
//     flagManagerCache.set(flagName, manager);
//     return manager;
//   }
// }

export const manageFlags = ()=>{
  for (const flagName in Game.flags) {
    try{
      const flag = Game.flags[flagName];
      const [flagType, options] = flag.name.split(':', 2) as [FlagType, string];
      if (flagType in FlagManagers){
        const flagManager = new FlagManagers[flagType](flag, flagType, options);
        flagManagerCache.set(flag.name, flagManager);
        flagManager.work();
      }
    }catch(e:any){
      console.log(`Flag ${flagName} error:`, e, e.stack);
    }
  }
}
