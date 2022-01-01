import { FlagType } from "utils/constants";
import { BasicCreep } from "./BasicCreep";

export class ClaimerCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 0,
    max: (roomAudit: RoomAudit)=>{
      const flagManager = roomAudit.flags[FlagType.Claim].find(flagManager=>{
        //The room won't exist in Game.rooms until we've explored the room with a creep...
        return flagManager.suffix === roomAudit.name && !flagManager.room || !flagManager.room.controller?.my;
      });
      if (flagManager){
        return Math.max(1-flagManager.followers.length, 0);
      }
      return 0;
    },
    tiers: [
      {
        cost: 650,
        body: [
          CLAIM,
          MOVE
        ],
      },
    ],
    getCreepAnchor: (roomAudit)=>{
      return roomAudit.flags[FlagType.Claim].find(flagManager=>{
        return flagManager.suffix === roomAudit.name;
      });
    },
  }

  startClaiming(controller?:StructureController){
    const target = controller || this.room.controller;
    if (!target) return null;
    const manageClaimAction = (action:ScreepsReturnCode)=>{
      //The creep is done with it's job, don't waste CPU on it
      if (action === ERR_INVALID_TARGET){
        this.suicide();
        return false;
      }
      return this.manageActionCode(action);
    };
    if (this.moveWithinRange(target.pos, 1) || manageClaimAction(this.claimController(target))){
      return target;
    }
    return null;
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
