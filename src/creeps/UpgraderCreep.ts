import { UPGRADER_STORAGE_MIN } from "utils/constants";
import { getRoomAudit, claimAmount } from "utils/tickCache";
import { BasicCreep } from "./BasicCreep";

export class UpgraderCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 1,
    max: (roomAudit:RoomAudit)=>roomAudit.controller?.containers.length ? 1 : 0,
    tiers: [
      {
        cost: 350,
        body: [
          WORK, WORK,
          CARRY, CARRY,
          MOVE,
        ],
      },
      {
        cost: 650,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY,
          MOVE,
        ],
      },
      {
        cost: 1200,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY,
          MOVE, MOVE,
        ],
        // max: (roomAudit:RoomAudit)=>{
        //   //My couriers aren't bringing them enough energy to actually keep 2 of them busy
        //   return 1; //+ (roomAudit.storedEnergy > UPGRADER_STORAGE_MIN ? 1 : 0);
        // },
      },
      { //This will consume 15 energy per tick. 1 Source gives 10 energy per tick. This might be too much...
        cost: 1800,
        requires: roomAudit=>roomAudit.storedEnergy > UPGRADER_STORAGE_MIN,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY, CARRY,
          MOVE, MOVE, MOVE,
        ]
      }
    ],
    getCreepAnchor: (roomAudit)=>{
      return roomAudit.controller;
    },
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

  work(){
    if (!this.memory.seated){
      this.memory.seated = false; //This will disable resource spreading which will slow down these already slow creeps
      if (this.moveWithinRange(this.room.controller!.pos, 1)) return;
      this.memory.seated = true; //The creep doesn't necessarily need to sit on a link
    }

    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (energyCapacity >= this.workCount){ //Upgrade takes 1 energy per work
      this.startUpgrading();
    }else{
      if (this.startTakingFromControllerContainer()) return;
      // if (this.startTakingFromControllerLink()) return;
    }
  }
}
