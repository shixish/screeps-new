import { flagHomeCache, flagManagerCache, getFlagManager, getRoomFlags } from "utils/tickCache";
import { FlagType } from "utils/constants";
import { RemoteFlag } from "flags/_RemoteFlag";
import { HomeFlag } from "flags/HomeFlag";
import { ClaimFlag } from "flags/ClaimFlag";
import { BuildFlag } from "flags/BuildFlag";
import { AuditFlag } from "flags/AuditFlag";
import { PowerFlag } from "flags/PowerFlag";
import { HarvestFlag } from "flags/HarvestFlag";
import { DefendFlag } from "flags/DefendFlag";
import { UpgradeFlag } from "flags/UpgradeFlag";

export const FlagManagers = { //:Record<FlagType, BasicFlag>
  [FlagType.Home]: HomeFlag,
  [FlagType.Defend]: DefendFlag,
  [FlagType.Harvest]: HarvestFlag,
  [FlagType.Upgrade]: UpgradeFlag,
  [FlagType.Claim]: ClaimFlag,
  [FlagType.Build]: BuildFlag,
  [FlagType.Audit]: AuditFlag,
  [FlagType.Power]: PowerFlag,
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
export const initFlagManager = (flagName:Flag['name'])=>{
  const [flagType, options] = flagName.split(':', 2) as [FlagType, string];
  return flagType in FlagManagers ? new FlagManagers[flagType](flagName, flagType, options) : undefined;
};

export const manageFlags = ()=>{
  //Initialize flags first
  for (const flagName in Game.flags) {
    try{
      const flagManager = initFlagManager(flagName);
      if (flagManager){
        // console.log(`flagManager`, flagManager.flagName, flagManager.homeRoomName);
        // if (flagManager.type === FlagType.Harvest) console.log(`flagManager`);
        const roomFlags = getRoomFlags(flagManager.homeRoomName);
        (roomFlags[flagManager.type] as BasicFlag[]).push(flagManager);
        // if (flagManager.type === FlagType.Defend) console.log(`roomFlags`, JSON.stringify(roomFlags, null, 2));
        flagManagerCache.set(flagName, flagManager);
      }
    }catch(e:any){
      console.log(`Flag ${flagName} error:`, e, e.stack);
    }
  }
  //Run flags in a second loop so all flags will be cached and counts will be available
  for (const flagName in Game.flags) {
    try{
      const flagManager = getFlagManager(flagName);
      if (flagManager) flagManager.work();
    }catch(e:any){
      console.log(`Flag ${flagName} error:`, e, e.stack);
    }
  }
  //Cleanup junk memory
  for (const flagName in Memory.flags){
    if (!(flagName in Game.flags)){
      //See the flag cleanup happening on tickCache as well
      delete Memory.flags[flagName];
    }
  }
}
