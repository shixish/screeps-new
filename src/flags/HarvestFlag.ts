import { CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
enum HarvestStatus{
  Audit,
  Harvest,
}

interface HarvestFlagMemory extends RemoteFlagMemory{

}

export class HarvestFlag extends RemoteFlag<HarvestFlagMemory> {
  type!: FlagType.Harvest;

  get status(){
    return this.memory.status as HarvestStatus ?? HarvestStatus.Audit;
  }

  set status(status:HarvestStatus){
    this.memory.status = status;
  }

  auditOffice(){
    const officeAudit = this.office && getRoomAudit(this.office);
    if (officeAudit){

      if (this.status === HarvestStatus.Audit){
        officeAudit.sources.forEach(source=>{
          officeAudit.center.findPathTo(source.pos, {
            range: 1,
            ignoreCreeps: true,
            swampCost: 1, //Swamps cost the same since we will build a road over it
          });
        });
      }

      const sourceCount = officeAudit.sources.length;
      /*
      TODO: Instead of specifying how many of a particular creep to spawn like this I should specify the capacity of the room somehow.
      The problem is that this doesn't account for creep tiers, so it does the right job but doesn't bake in a sense of proper scale.

      Maybe just specify custom creep parts/tier in here and feed it into a creep role to control the logic.
      */
      this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = sourceCount;
      this.maxFollowersByRole[CreepRoleName.RemoteCourier] = sourceCount*2;
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
