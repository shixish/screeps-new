import { CreepRoleName, FlagType } from "utils/constants";
import { getBestCentralLocation } from "utils/map";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag } from "./_RemoteFlag";

enum ClaimStatus{
  Audit,
  Claim,
  Finish,
}

export class ClaimFlag extends RemoteFlag {
  type!: FlagType.Claim;

  get status(){
    return this.memory.status as ClaimStatus ?? ClaimStatus.Audit;
  }

  set status(status:ClaimStatus){
    this.memory.status = status;
  }

  auditOffice(){
    // const officeAudit = this.office && getRoomAudit(this.office);
    this.maxFollowersByRole[CreepRoleName.Claimer] = this.office?.controller!.my ? 0 : 1;
    this.maxFollowersByRole[CreepRoleName.RemoteWorker] = 2;
  }

  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work() {
    // Note: this.flag.pos.findClosestByRange only works with rooms that have vision...
    switch(this.status){
      case ClaimStatus.Audit:
        if (this.office){
          const roomAudit = getRoomAudit(this.office);
          const center = roomAudit.center || (roomAudit.center = getBestCentralLocation(this.room));
          this.flag.setPosition(center);

          roomAudit.resetRoom();
          this.status = ClaimStatus.Claim;
        }
        break;
      case ClaimStatus.Claim:
        if (this.office?.controller?.my && this.office.controller.level >= 2){
          const roomAudit = getRoomAudit(this.office);
          const center = roomAudit.center = this.flag.pos; //might manually move the flag to adjust the center location while initially getting to CL2
          this.room.createConstructionSite(center, STRUCTURE_SPAWN);
          this.status = ClaimStatus.Finish;
        }
        break;
      case ClaimStatus.Finish:
        const spawns = this.office?.find(FIND_MY_SPAWNS);
        if (spawns?.length){
          this.remove(); //Room Audit will take it from here
        }
        break;
    }
  }
}
