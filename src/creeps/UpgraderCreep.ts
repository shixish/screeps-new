import { getRoomAudit, claimAmount } from "utils/tickCache";
import { followCourierTug } from "utils/seatTug";
import { BasicCreep, CreepBody } from "./BasicCreep";

/*
  Dedicated static upgrader: sits on the container next to the controller, pulls energy from that
  container, and relentlessly upgrades. Small CARRY (right next to the box) and 1 MOVE to walk onto
  the seat - same spirit as the static source miners. Couriers (see startStocking / UpgradeFlag) keep
  the controller container supplied once source miners are producing.
*/
export class UpgraderCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 1,
    tiers: [
      {
        //0 MOVE: courier tugs onto the controller container. Tiny CARRY since the box is underfoot.
        body: new CreepBody([
          WORK, WORK,
          CARRY,
        ], 250),
      },
      {
        //1 MOVE self-walk fallback if no courier is free to tug.
        body: new CreepBody([
          WORK, WORK,
          CARRY,
          MOVE,
        ], 300),
      },
      {
        body: new CreepBody([
          WORK, WORK, WORK, WORK,
          CARRY,
          MOVE,
        ], 500),
      },
      {
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY,
          MOVE,
        ], 750),
      },
      {
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY,
          MOVE,
        ], 1150),
      },
      {
        body: new CreepBody([
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY, CARRY,
          MOVE, MOVE,
        ], 1750),
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
        //couriers try to fill up these creeps so tell the couriers to not bother if you're already going to grab energy from the container nearby
        claimAmount(this.id, resourceType, Math.min(container.store.getUsedCapacity(resourceType), this.store.getCapacity()));
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
        claimAmount(this.id, resourceType, Math.min(link.store.getUsedCapacity(resourceType), this.store.getCapacity()));
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
