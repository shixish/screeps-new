import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName } from "utils/constants";
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
  cohorts = {
    claimers: new Cohort(this.name+'-claimers'),
    workers: new Cohort(this.name+'-workers'),
  };

  get status(){
    return this.memory.status ?? ClaimStatus.Audit;
  }

  set status(status:ClaimStatus){
    this.memory.status = status;
  }

  static initializeNewHomeRoom(roomAudit:RoomAudit){
    roomAudit.room.createFlag(roomAudit.center, 'home:'+roomAudit.room.name);
    roomAudit.room.createFlag(roomAudit.controller!.pos, 'upgrade:'+roomAudit.room.name);
    for (const s in roomAudit.sources){
      roomAudit.room.createFlag(roomAudit.sources[s].pos, 'harvest:'+roomAudit.room.name+':'+s);
    }
  }

  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.Normal) return null;

    if (!this.office?.controller?.my){
      const optimalClaimParts = 1;
      const neededClaimParts = optimalClaimParts - (this.cohorts.claimers.counts[CLAIM] || 0);
      const claimer = neededClaimParts > 0 && this.findSpawnableCreep(CreepRoleName.Claimer, body=>(
        neededClaimParts >= body.counts[CLAIM] &&
        neededClaimParts - body.counts[CLAIM]
      ), { cohort: this.cohorts.claimers });
      if (claimer) return claimer;
    }else{
      const optimalWorkerParts = 6;
      const neededWorkerParts = optimalWorkerParts - (this.cohorts.workers.counts[WORK] || 0);
      const remoteWorker = neededWorkerParts > 0 && this.findSpawnableCreep(CreepRoleName.RemoteWorker, body=>(
        body.counts[WORK] > 0 &&
        neededWorkerParts % body.counts[WORK]
      ), { cohort: this.cohorts.workers });
      if (remoteWorker) return remoteWorker;
    }

    return null;
  }

  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work() {
    if (this.domestic){
      this.remove();
      throw `Invalid claim flag.`;
    }
    // if (this.office){
    //   this.flag.room?.visual.text(`status: ${this.status}`, this.flag.pos.x, this.flag.pos.y-1);
    // }
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
            ClaimFlag.initializeNewHomeRoom(this.officeAudit!);
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
