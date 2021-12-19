import { getRoomAudit } from "managers/room";
import { FlagType } from "utils/constants";
import { BasicCreep } from "./BasicCreep";

export class RemoteWorkerCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 3,
    tiers: [
      {
        cost: 1200,
        body: [
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ],
        max: (roomAudit)=>{
          for (let flagName in roomAudit.flags){
            const flagManager = roomAudit.flags[flagName];
            // console.log(`flagManager.type`, flagManager.type, JSON.stringify(flagManager.followers, null, 2));
            if (flagManager.type === FlagType.Claim && flagManager.suffix === roomAudit.name && flagManager.room && flagManager.room.controller?.my){
              return Math.max(2-flagManager.followers.length, 0);
            }
          }
          return 0;
        }
      }
    ],
    getCreepAnchor: (roomAudit)=>{
      for (let flagName in roomAudit.flags){
        const flagManager = roomAudit.flags[flagName];
        if (flagManager.type === FlagType.Claim && flagManager.suffix === roomAudit.name){
          return flagManager;
        }
      }
      return;
    },
  }

  work(){
    //Basically the same thing as a basic creep but will take on more responsibilities to jump start things
    if (this.spawning) return;
    const flag = this.getFlag();
    if (flag && flag.room.name !== this.room.name){
      this.moveTo(flag.pos);
      return;
    }

    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    const roomAudit = getRoomAudit(this.room);

    //Remote workers are usually the best miners available in an eary room, so don't bother picking up. Go straight to the source if there's room to do so.
    if (roomAudit.creepCountsByRole.harvester < roomAudit.sourceSeats){
      if (this.rememberAction(this.startMining, 'mining')) return;
    }
    if (this.rememberAction(this.startPickup, 'pickup')) return;
    if (this.rememberAction(this.startTakingEnergy, 'taking')) return;

    if (energyCapacity > 0){ //Do something with the energy
      if (this.commute()) return;
      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading', 'building', 'repairing'])) return;
      // if (this.rememberAction(this.startRepairing, 'repairing', ['upgrading'])) return;
      if (this.rememberAction(this.startBuilding, 'building', ['upgrading'])) return;
      // if (this.rememberAction(this.startSpreading, 'spreading')) return;
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
      if (this.rememberAction(this.startStoring, 'storing')) return;
    }

    this.idle();

    // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
  }
}
