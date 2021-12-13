import { FlagType } from "utils/constants";
import { getRoomAudit } from "./room";

export abstract class FlagManager{
  flag: Flag;
  type: FlagType;

  constructor(flag:Flag, type:FlagType){
    this.flag = flag;
    this.type = type;
  }
  abstract work(options?:string):void;

  get memory(){
    return Memory.flags[this.flag.name] || (Memory.flags[this.flag.name] = {});
  }
}

export class ClaimFlag extends FlagManager{
  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work(options?:string){
    const room = options && Game.rooms[options];

    // Note: this.flag.pos.findClosestByRange seems to only work with rooms that have vision...
    // || this.flag.pos.findClosestByRange(FIND_MY_SPAWNS, {
    //   filter: spawn=>{
    //     //Claim body part costs 600 energy
    //     return spawn.room.energyAvailable >= 800;
    //   }
    // })?.room;
    if (room){
      const roomAudit = getRoomAudit(room);
      roomAudit.flags.push(this);
    }else{
      console.log(`Claim flag error: room not found.`);
    }
  }
}

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
      const flag = Game.flags[flagName];
      const [ flagType, options ] = flagName.split(':', 2) as [ FlagType, string ];
      // const flagType = Memory.flags[flagName]?.type;
      if (flagType in FlagManagers){
        const manager = new FlagManagers[flagType](flag, flagType);
        manager.work(options);
      }else{
        // console.log(`${flagName} has an unknown flag type:`, flagType);
      }
    }catch(e){
      console.log('flag error', e);
    }
  }
}
