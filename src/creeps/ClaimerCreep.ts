import { ClaimFlag } from "flags/ClaimFlag";
import { CreepRoleName, FlagType } from "utils/constants";
import { BasicCreep, CreepBody } from "./BasicCreep";

export class ClaimerCreep extends BasicCreep<ClaimFlag> {
  static config:CreepRole = {
    authority: 0,
    // max: (roomAudit: RoomAudit)=>{
    //   const flagManager = roomAudit.flags[FlagType.Claim].find(flagManager=>{
    //     //The room won't exist in Game.rooms until we've explored the room with a creep...
    //     return flagManager.home.name === roomAudit.room.name && !flagManager.office?.controller?.my;
    //   });
    //   if (flagManager){
    //     return Math.max(1-flagManager.followers.length, 0);
    //   }
    //   return 0;
    // },
    tiers: [
      {
        body: new CreepBody([
          CLAIM,
          MOVE
        ], 650),
      },
      {
        body: new CreepBody([
          CLAIM, MOVE,
          CLAIM, MOVE,
        ], 1300),
      },
    ],
    // getCreepFlag: (roomAudit)=>{
    //   return roomAudit.flags[FlagType.Claim].find(flagManager=>{
    //     return flagManager.getAvailableFollowersByRole(CreepRoleName.Claimer) > 0;
    //   });
    // },
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

  startReserving(controller?:StructureController){
    const target = controller || this.room.controller;
    if (!target) return null;
    if (this.moveWithinRange(target.pos, 1) || this.manageActionCode(this.reserveController(target))){
      return target;
    }
    return null;
  }

  work(){
    //The flag gets deleted once the job is done. The creep can just sit there until it's time runs out...
    if (this.flag){
      //Note flag.room will not exist until we actually get there.
      if (this.room.name === this.flag.roomName){
        if (this.flag.type === FlagType.Claim){
          if (this.room.controller?.my) this.suicide();
          else if (this.startClaiming(this.room.controller)) return;
        }else{ //Then this is a harvest flag and we just want to reserve the room
          if (this.startReserving(this.room.controller)) return;
        }
      }

      this.moveTo(this.flag.pos);
    }
  }
}
