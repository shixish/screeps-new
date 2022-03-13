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

  static initializeHomeRoom(roomAudit:RoomAudit){
    roomAudit.room.createFlag(roomAudit.center, 'home:'+roomAudit.room.name);
    const source = roomAudit.sources[0];
    roomAudit.room.createFlag(source.pos, 'harvest:'+roomAudit.room.name);
  }

  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work() {
    // Note: this.flag.pos.findClosestByRange only works with rooms that have vision...
    switch(this.status){
      case ClaimStatus.Audit:
        if (this.office){
          this.flag.setPosition(this.officeAudit!.center);
          this.status = ClaimStatus.Claim;
        }
        break;
      case ClaimStatus.Claim:
        if (this.office?.controller?.my && this.office.controller.level >= 2){
          const center = this.officeAudit!.center = this.flag.pos; //might manually move the flag to adjust the center location while initially getting to CL2
          this.office.createConstructionSite(center, STRUCTURE_SPAWN);
          this.status = ClaimStatus.Finish;
        }
        break;
      case ClaimStatus.Finish:
        if (this.office){
          if (this.office?.find(FIND_MY_SPAWNS)?.length){
            //The home flag will take it from here
            ClaimFlag.initializeHomeRoom(this.officeAudit!);
            this.remove();
          }
        }else{
          this.remove();
          throw `Room was likely destroyed`;
        }
        break;
    }
  }
}
