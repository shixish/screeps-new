import { ClaimFlag } from "flags/ClaimFlag";
import { BasicCreep, CreepBody } from "./BasicCreep";

export class RemoteBuilderCreep extends BasicCreep<ClaimFlag> {
  static config:CreepRole = {
    authority: 3,
    tiers: [
      {
        body: new CreepBody([
          WORK,
          MOVE, CARRY,
          MOVE, CARRY,
        ], 300),
      },
      {
        body: new CreepBody([
          WORK, MOVE,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ], 550),
      },
      {
        body: new CreepBody([
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ], 800),
      },
      {
        body: new CreepBody([
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ], 1200),
      },
    ],
  }

  work(){
    const energy = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (this.rememberAction(this.startPickup, 'pickup')) return;
    if (this.rememberAction(this.startTakingEnergy, 'taking')) return;

    if (energy > 0){ //Do something with the energy
      if (this.rememberAction(this.startRepairing, 'repairing', ['upgrading'])) return;
      if (this.rememberAction(this.startBuilding, 'building', ['upgrading'])) return;
      if (this.commute()) return;

      if (this.flag && this.flag.roomName !== this.room.name){
        this.moveTo(this.flag.pos);
        return;
      }
    }

    this.idle();

    // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
  }
}
