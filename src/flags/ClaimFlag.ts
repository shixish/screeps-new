import { CreepRoleName, FlagType } from "utils/constants";
import { getBestContainerLocation, getBestLocations, getTerrainCostMatrix } from "utils/map";
import { random } from "utils/random";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag } from "./_RemoteFlag";

enum ClaimStatus{
  Claim,
  Spawn,
}

export class ClaimFlag extends RemoteFlag {
  type!: FlagType.Claim;

  get status(){
    return this.memory.status as ClaimStatus ?? ClaimStatus.Claim;
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
      case ClaimStatus.Claim:
        if (this.office?.controller?.my && this.office.controller.level >= 2){
          const matrix = getTerrainCostMatrix(this.room);
          const central = getBestLocations(this.room, matrix);
          this.flag.setPosition(central);
          this.room.createConstructionSite(central, STRUCTURE_SPAWN);
          this.status = ClaimStatus.Spawn;
        }
        break;
      case ClaimStatus.Spawn:
        const spawns = this.office?.find(FIND_MY_SPAWNS);
        if (spawns?.length){
          //Construction logic is now being handled by the room audit
          this.remove();
        }
        break;
    }
  }
}
