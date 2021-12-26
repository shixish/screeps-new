import { FlagType } from "utils/constants";
import { BasicCreep } from "./BasicCreep";

export class ClaimerCreep extends BasicCreep {
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
          for (let flagName in roomAudit.flags){
            const flagManager = roomAudit.flags[flagName];
            //The room won't exist in Game.rooms until we've explored the room with a creep...
            if (flagManager.type === FlagType.Claim && flagManager.suffix === roomAudit.name && !flagManager.room || !flagManager.room.controller?.my){
              return Math.max(1-flagManager.followers.length, 0);
            }
          }
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
        if (flagManager.type === FlagType.Claim && flagManager.suffix === roomAudit.name){
          return flagManager;
        }
      }
      return;
    },
  }

  startClaiming(controller?:StructureController){
    const target = controller || this.room.controller;
    if (!target) return null;
    const action = this.claimController(target);
    if (action === ERR_INVALID_TARGET){
      // flag?.remove(); //The flag can now be used to send remote workers
      this.suicide(); //The creep is done with it's job, don't waste CPU on it
      return null;
    }
    const ok = this.respondToActionCode(action, target);
    return ok;
  }

  work(){
    if (this.spawning) return;

    //The flag gets deleted once the job is done. The creep can just sit there until it's time runs out...
    const flag = this.getFlag();
    if (flag){
      //Note flag.room will not exist until we actually get there.
      if (flag.room && this.room.name === flag.room.name){
        if (this.startClaiming(this.room.controller)) return;
      }

      this.moveTo(flag.pos);
    }
  }
}
