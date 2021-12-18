import { getRoomAudit } from "managers/room";
import { BasicCreep } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 1,
    max: (roomAudit: RoomAudit)=>{
      //We only need couriers if we have miners available, otherwise the resources should go to basic creeps that can do both
      return Math.min(roomAudit.creepCountsByRole.miner*2, roomAudit.sources.length*2);
    },
    tiers: [
      {
        cost: 300,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
      },
      {
        cost: 400,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
      },
      {
        cost: 550,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY,
        ],
      },
      // {
      //   cost: 1200,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //   ],
      //   max: (roomAudit)=>{
      //     return roomAudit.sources.length;
      //   },
      // },
    ]
  }

  work(){
    if (this.spawning) return;

    const usedCapacity = this.store.getUsedCapacity();
    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    // const roomAudit = getRoomAudit(this.room);
    let triedStoring = false;

    /* this stuff deals with minerals */
    if (this.rememberAction(this.startTransferringMinerals, 'transferring')) return;
    if (usedCapacity > 0 && usedCapacity !== energyCapacity){
      //if filled with stuff other than energy
      if (this.rememberAction(this.startStoring, 'storing')) return;
      triedStoring = true;
    }

    /* this stuff deals with energy */
    if (this.rememberAction(this.startPickup, 'pickup')) return;
    if (this.rememberAction(this.startTakingEnergy, 'taking')) return;

    if (energyCapacity > 0){ //Do something with the energy
      // if (this.memory.office && this.memory.office !== this.room.name){
      //   const direction = this.room.findExitTo(this.memory.office);
      //   if (direction === ERR_NO_PATH) return console.log(`No path to office found.`);
      //   if (direction === ERR_INVALID_ARGS) return console.log(`Invalid office args.`);
      //   const exit = this.pos.findClosestByRange(direction);
      //   this.say('commuting');
      //   this.moveTo(exit!);
      //   return;
      // }
      if (this.rememberAction(this.startEnergizing, 'energizing')) return;
      if (this.rememberAction(this.startSpreading, 'spreading')) return;
      if (!triedStoring && this.rememberAction(this.startStoring, 'storing')) return;
    }

    // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
  }
}
