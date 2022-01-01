import { FlagType } from "utils/constants";
import { FlagManager } from "../flags/FlagManager";
import { ClaimFlag } from "../flags/ClaimFlag";

export const FlagManagers = { //:Record<FlagType, FlagManager>
  [FlagType.Claim]: ClaimFlag,
} as const;

// const getFlagType = (flagName:Flag['name'])=>{
//   const [ roomName, flagType ] = flagName.split(':');
//   return flagType;
// }

export const manageFlags = ()=>{
  for (const flagName in Game.flags) {
    try{
      const flagManager = FlagManager.fromFlagName(flagName);
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
