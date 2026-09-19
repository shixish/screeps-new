import { getRoomAudit } from "utils/tickCache";
import { followCourierTug } from "utils/seatTug";
import { BasicCreep, CreepBody } from "./BasicCreep";

/*
  Dedicated static upgrader: sits on the container next to the controller, pulls energy from that
  container, and relentlessly upgrades. Same spirit as the static source miners - maximize WORK for the
  energy budget and let the courier tug do the walking - with one hard floor: upgradeController spends
  energy out of the creep's own store, so a 0 CARRY upgrader has 0 capacity and can never upgrade at
  all. One CARRY used to be the floor; the first tier now buys two. 100 capacity is 50 ticks of
  upgrading between withdraws instead of 25, and it leaves real free space for a passing courier to
  hand energy straight to the seated creep (see CourierCreep/startSpreading) instead of relying on the
  container underfoot being stocked.
*/
export class UpgraderCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 1,
    tiers: [
      /*
        Max WORK + enough CARRY + 0 MOVE (courier tug seats it, see utils/seatTug). The small tiers
        keep a 1 MOVE self-walk sibling for when no courier is free. At the CL1 cap of 300 the spare
        50 on top of [WORK, WORK, CARRY] can never buy a third WORK, so it goes to a second CARRY
        rather than a MOVE - tug seating already handles the walking, and 100 capacity halves how
        often the creep has to stop upgrading to refill.
      */
      {
        body: new CreepBody([
          WORK, WORK,
          CARRY, CARRY,
        ], 300),
      },
      {
        //1 MOVE self-walk fallback if no courier is free to tug. Over the CL1 cap, so CL2 and up only.
        body: new CreepBody([
          WORK, WORK,
          CARRY, CARRY,
          MOVE,
        ], 350),
      },
      {
        //The room's first four extensions (spawn circulation pockets) buy this: max WORK for 500 that
        //still keeps the two CARRY the courier feed wants.
        body: new CreepBody([
          WORK, WORK, WORK, WORK,
          CARRY, CARRY,
        ], 500),
      },
      {
        //CL2 cap (550).
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK,
          CARRY,
        ], 550),
      },
      {
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK,
          CARRY,
          MOVE,
        ], 600),
      },
      {
        //CL3 cap (800). Second CARRY so a bigger body isn't withdrawing every other tick.
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY,
        ], 800),
      },
      {
        //CL4 cap (1300).
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK,
          CARRY, CARRY,
        ], 1300),
      },
      {
        //15 WORK is the RCL8 controller cap of 15 energy/tick.
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY, CARRY,
        ], 1650),
      }
    ],
  }

  startTakingFromControllerContainer(){
    //Not using startTakingEnergy because it does more complicated things and this creep should only be concerned with it's designated container
    const resourceType = RESOURCE_ENERGY;
    const roomAudit = getRoomAudit(this.room);
    const container = roomAudit.controller?.containers.find(container=>{
      return container.store.energy > 0;
    });
    if (container){
      if (this.moveWithinRange(container.pos, 1) || this.manageActionCode(this.withdraw(container, resourceType))){
        /*
          Deliberately no claim against our own store. Couriers size us up with getResourceSpace(),
          which is free capacity *plus* the claim, so the old positive self-claim advertised twice the
          room we actually had rather than waving them off. Direct feeding a seated upgrader is wanted
          now (see CourierCreep/startSpreading), so just let the real free space speak for itself -
          worst case a withdraw and a hand-off land on the same tick and the transfer tops off
          whatever the withdraw left room for.
        */
        return container;
      }
    }
    return null;
  }

  startTakingFromControllerLink(){
    const resourceType = RESOURCE_ENERGY;
    const roomAudit = getRoomAudit(this.room);
    const link = roomAudit.controller?.link;
    if (link && link.store.energy > 0){
      if (this.moveWithinRange(link.pos, 1) || this.manageActionCode(this.withdraw(link, resourceType))){
        //No self-claim here either - see startTakingFromControllerContainer.
        return link;
      }
    }
    return null;
  }

  /* Park on the controller container (or within upgrade range if the box isn't built yet). */
  seatAtController(){
    const roomAudit = getRoomAudit(this.room);
    const controller = this.room.controller;
    if (!controller) return true;

    const containers = roomAudit.controller?.containers ?? [];
    if (containers.length){
      const seatContainer = containers.find(container=>{
        return this.pos.isEqualTo(container.pos) || !container.pos.lookFor(LOOK_CREEPS).length;
      });
      if (seatContainer){
        if (!this.pos.isEqualTo(seatContainer.pos)){
          this.memory.seated = false; //Disable resource spreading while we shuffle onto the box
          this.moveTo(seatContainer);
          return true;
        }
        this.memory.seated = true;
        return false;
      }
      //Seat is occupied this tick (a courier passing through): keep upgrading from range instead of
      //stalling, and take the seat as soon as it clears.
      this.memory.seated = false;
      return this.moveWithinRange(controller.pos, 3);
    }

    //No container yet: get within upgrade range and wait.
    if (this.moveWithinRange(controller.pos, 1, 3)){
      this.memory.seated = false;
      return true;
    }
    this.memory.seated = true;
    return false;
  }

  work(){
    if (followCourierTug(this)) return;
    if (this.seatAtController()) return;

    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (energyCapacity >= this.workCount){ //Upgrade takes 1 energy per work
      this.startUpgrading();
    }else{
      if (this.startTakingFromControllerContainer()) return;
      // if (this.startTakingFromControllerLink()) return;
    }
  }
}
