import { CreepRoleName } from "utils/constants";
import { getBestCentralLocation } from "utils/map";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

enum ClaimStatus{
  Audit,
  Claim,
  Finish,
}

export interface ClaimFlagMemory extends RemoteFlagMemory{
  status?: ClaimStatus;
}

export class ClaimFlag extends RemoteFlag<ClaimFlagMemory> {
  get status(){
    return this.memory.status ?? ClaimStatus.Audit;
  }

  set status(status:ClaimStatus){
    this.memory.status = status;
  }

  claimCreeps(){

  }

  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work() {
    this.claimCreeps();

    // Note: this.flag.pos.findClosestByRange only works with rooms that have vision...
    switch(this.status){
      case ClaimStatus.Audit:
        if (this.office){
          const roomAudit = getRoomAudit(this.office);
          const center = roomAudit.center || (roomAudit.center = getBestCentralLocation(this.office));
          this.flag.setPosition(center);
          this.status = ClaimStatus.Claim;
        }
        break;
      case ClaimStatus.Claim:
        if (this.office?.controller?.my && this.office.controller.level >= 2){
          const roomAudit = getRoomAudit(this.office);
          const center = roomAudit.center = this.flag.pos; //might manually move the flag to adjust the center location while initially getting to CL2
          this.office.createConstructionSite(center, STRUCTURE_SPAWN);
          this.status = ClaimStatus.Finish;
        }
        break;
      case ClaimStatus.Finish:
        const spawns = this.office?.find(FIND_MY_SPAWNS);
        if (spawns?.length){
          //The home flag will take it from here
          this.office?.createFlag(this.flag.pos.x, this.flag.pos.y, 'home:'+this.office.name)
          this.remove();
        }
        break;
    }
  }
}
