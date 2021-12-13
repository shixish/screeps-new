import { FlagType } from "utils/constants";
import { getRoomAudit } from "./room";

export abstract class FlagManager{
  flag: Flag;
  type: FlagType;
  suffix: string|undefined;

  constructor(flag:Flag, type:FlagType, suffix?:string){
    this.flag = flag;
    this.type = type;
    this.suffix = suffix;
  }
  static fromFlagName(flagName:Flag['name']){
    return this.fromFlag(Game.flags[flagName]);
  }
  static fromFlag(flag?:Flag){
    if (!flag) return;
    const [ flagType, options ] = flag.name.split(':', 2) as [ FlagType, string ];
    if (flagType in FlagManagers){
      return new FlagManagers[flagType](flag, flagType, options);
    }
    return;
    // throw 'Invalid flag type given to FlagManager.fromFlag';
  }

  abstract work(options?:string):void;

  get name(){
    return this.flag.name;
  }

  get pos(){
    return this.flag.pos;
  }

  get room(){
    return this.flag.room!;
  }

  get followers(){
    if (!this.memory.followers) this.memory.followers = []; //temporary fix
    return this.memory.followers;
  }

  addFollower(creepName:Creep['name']){
    this.memory.followers.push(creepName);
  }

  get memory(){
    return Memory.flags[this.flag.name] || (Memory.flags[this.flag.name] = {
      followers: [],
    });
  }

  remove(){
    this.flag.remove();
    delete Memory.flags[this.flag.name];
  }
}

export class ClaimFlag extends FlagManager{
  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work(){
    const room = this.memory.room && Game.rooms[this.memory.room] || this.suffix && Game.rooms[this.suffix];

    // Note: this.flag.pos.findClosestByRange seems to only work with rooms that have vision...
    // || this.flag.pos.findClosestByRange(FIND_MY_SPAWNS, {
    //   filter: spawn=>{
    //     //Claim body part costs 600 energy
    //     return spawn.room.energyAvailable >= 800;
    //   }
    // })?.room;
    if (room){
      this.memory.room = room.name;
      const roomAudit = getRoomAudit(room);
      roomAudit.flags[this.name] = this;
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
      const flagManager = FlagManager.fromFlagName(flagName);
      if (flagManager){
        flagManager.work();
      }else{
        // console.log(`${flagName} has an unknown flag type:`, flagType);
      }
    }catch(e){
      console.log('flag error', e);
    }
  }
}
