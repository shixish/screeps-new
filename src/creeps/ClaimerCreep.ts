import { FlagType } from "utils/constants";
import { BasicCreep } from "./BasicCreep";

export class ClaimerCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        cost: 50,
        body: [
          CLAIM,
          MOVE
        ],
        max: (roomAudit: RoomAudit)=>{
          // roomAudit.flags.find(flag=>{
          //   return flag.type === FlagType.Claim;
          // });
          return 1;
        },
      },
      // {
      //   cost: 300,
      //   body: [
      //     MOVE, MOVE,
      //     MOVE, MOVE,
      //     MOVE, MOVE,
      //   ],
      //   max: (roomAudit: RoomAudit)=>{
      //     return 0;
      //   },
      // }
    ],
    getCreepAnchor: (roomAudit)=>{
      for (let flagName in roomAudit.flags){
        const flagManager = roomAudit.flags[flagName];
        console.log(`flagManager`, flagManager);
        if (flagManager.type === FlagType.Claim && !flagManager.followers){
          return flagManager;
        }
      }
      return;
      // return roomAudit.flags.find(flagManager=>flagManager.type === FlagType.Claim && !flagManager.followers);
    },
  }

  work(){
    if (this.memory.flag){

    }
    const flag = Game.flags.Outpost1;
    if (flag){
      // console.log(`flag`, JSON.stringify(flag, null, 2));
      if (flag.pos.roomName !== this.room.name){
        const direction = this.room.findExitTo(flag.pos.roomName);
        if (direction === ERR_NO_PATH) return console.log(`No path to flag found.`);
        if (direction === ERR_INVALID_ARGS) return console.log(`No path to flag found.`);
        const exit = this.pos.findClosestByRange(direction);
        if (exit) this.moveTo(exit);
      }else{
        this.moveTo(flag.pos);
      }
    }
  }
}
