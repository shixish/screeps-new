import { CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag } from "./_RemoteFlag";

/* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
export class HarvestFlag extends RemoteFlag {
  type!: FlagType.Harvest;

  auditOffice(){
    const officeAudit = this.office && getRoomAudit(this.office);
    if (officeAudit){
      // console.log(`officeAudit`, officeAudit);
      const sourceCount = officeAudit.sources.length;
      this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = sourceCount;
      this.maxFollowersByRole[CreepRoleName.RemoteCourier] = sourceCount*3;
    }else{
      this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = 1;
      this.maxFollowersByRole[CreepRoleName.RemoteCourier] = 2;
    }
  }

  // auditPaths(){
  //   if (this.office){
  //     const roomAudit = getRoomAudit(this.home);
  //     // roomAudit.storage
  //   }
  // }

  // getHarvesterMax(roomAudit:RoomAudit){
  //   if (this.home.name !== roomAudit.room.name) return 0;
  //   //Office room may not initially have vision
  //   const sourceCount = this.office?.find(FIND_SOURCES).length || 1;
  //   const currentCreepCount = this.followerRoleCounts[CreepRoleName.RemoteHarvester] || 0;
  //   //One creep per source in the office room
  //   return Math.max(sourceCount-currentCreepCount, 0);
  // }

  work() {

  }
}
