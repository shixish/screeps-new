import { FlagType } from "utils/constants";
import { BasicCreep } from "./BasicCreep";

export class ClaimerCreep extends BasicCreep {
  flag = this.getFlag();

  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        cost: 650,
        body: [
          CLAIM,
          MOVE
        ],
        max: (roomAudit: RoomAudit)=>{
          // roomAudit.flags.find(flag=>{
          //   return flag.type === FlagType.Claim;
          // });
          return 0;
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
        if (flagManager.type === FlagType.Claim && !flagManager.followers.length){
          return flagManager;
        }
      }
      return;
      // return roomAudit.flags.find(flagManager=>flagManager.type === FlagType.Claim && !flagManager.followers);
    },
  }

  startClaiming(controller?:StructureController){
    const target = controller || this.room.controller;
    if (!target) return null;
    const action = this.claimController(target);
    if (action === ERR_INVALID_TARGET){
      this.flag?.remove();
      return null;
    }
    const ok = this.respondToActionCode(action, target);
    return ok;
  }

  work(){
    //The flag gets deleted once the job is done. The creep can just sit there until it's time runs out...
    if (this.flag){
      if (this.room.name === this.flag.room.name){
        if (this.startClaiming(this.room.controller)) return;
      }

      this.moveTo(this.flag.pos);
    }
  }
}
