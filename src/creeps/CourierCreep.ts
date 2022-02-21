import { claimAmount, getResourceSpace } from "utils/tickCache";
import { BasicCreep, CreepBody } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 2,
    max: (roomAudit: RoomAudit)=>{
      //We only need couriers if we have miners available, otherwise the resources should go to basic creeps that can do both
      return Math.min(roomAudit.creepCountsByRole.harvester*2, roomAudit.sources.length*2);
    },
    tiers: [
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 300),
      },
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 400),
      },
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY,
        ], 550),
      },
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 1200),
        max: (roomAudit)=>{
          return roomAudit.sources.length;
        },
      },
    ]
  }

  spreadEnergyNearby(){
    // const maxFillPercentage = 0.75; //75%;
    const resourceType = RESOURCE_ENERGY;
    if (this.canWork) return null; //If this is a worker don't bother giving away your resources
    if (this.store[resourceType] === 0) return null;
    const { target } = this.pos.findInRange(FIND_MY_CREEPS, 1).reduce((out, creep)=>{
      if (creep.id !== this.id && creep.memory.counts.work && creep.memory.seated !== false){
        const amount = getResourceSpace(creep, resourceType);
        if (amount > out.amount){
          out.target = creep;
          out.amount = amount;
        }
      }
      return out;
    }, { target: undefined as Creep|undefined, amount: 0 });
    if (!target) return null;
    if (this.moveWithinRange(target.pos, 1) || this.manageActionCode(this.transfer(target, resourceType))){
      claimAmount(target.id, resourceType, -Math.min(target.store.getFreeCapacity(resourceType), this.store[resourceType]));
      return target;
    }
    return null;
  }

  work(){
    if (this.commute()) return;

    const usedCapacity = this.store.getUsedCapacity();
    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    // const roomAudit = getRoomAudit(this.room);
    let triedStoring = false;

    //Opportunistic.
    // if (this.spreadEnergyNearby()) return; //Sucks because they end up spoon feeding upgraders

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
      if (this.rememberAction(this.startStocking, 'stocking')) return;
      if (!triedStoring && this.rememberAction(this.startStoring, 'storing')) return;
    }

    // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
  }
}
