import { FlagType } from "utils/constants";
import { getFlagManager, getRoomAudit } from "utils/tickCache";
import { BasicCreep, CreepBody } from "./BasicCreep";

export class ScoutCreep extends BasicCreep<HarvestFlag|HomeFlag> {
  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        body: new CreepBody([
          MOVE
        ], 50),
        max: (roomAudit: RoomAudit)=>{
          return 0;
        },
      },
    ],
    // getCreepAnchor: (roomAudit:RoomAudit)=>{
    //   return roomAudit.flags.audit.find(flagManager=>!flagManager.room);
    // },
  }

  // scoutFlagRoom(storedTarget?:TargetableTypes){
  //   const target = storedTarget instanceof Flag && storedTarget || getRoomAudit(this.room).flags.harvest.find(flag=>!flag.office)?.flag;
  //   const flagManager = target && getFlagManager(target);
  //   if (flagManager && flagManager.type === FlagType.Harvest){//(this.room.name !== target.pos.roomName || target.room!.find(FIND_MY_CREEPS).length <= 1)){
  //     this.moveTo(target);
  //     return target;
  //   }
  //   return null;
  // }

  work(){
    if (this.flag?.type === FlagType.Harvest){
      this.moveTo(this.flag.pos);
    }else{
      //Home flag logic will be some kind of random walk
    }

    // if (this.rememberAction(this.scoutFlagRoom, 'scout')) return;

    // this.currentAction = undefined;
  }
}
