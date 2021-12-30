import { getRoomAudit } from "managers/room";
import { UPGRADER_STORAGE_MIN } from "utils/constants";
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
      // { //This will consume 15 energy per tick. 1 Source gives 10 energy per tick. This might be too much...
      //   cost: 1700,
      //   body: [
      //     WORK, WORK, WORK, WORK, WORK,
      //     WORK, WORK, WORK, WORK, WORK,
      //     WORK, WORK, WORK, WORK, WORK,
      //     CARRY, CARRY, CARRY, MOVE,
      //   ],
      //   max: (roomAudit:RoomAudit)=>{
      //     return roomAudit.controllerLevel > 5 ? 1 : 0;
      //   }
      // }
    ],
    getCreepAnchor: (roomAudit)=>{
      return roomAudit.controller;
    },
  }

  startTakingFromControllerContainer(){
    //Not using startTakingEnergy because it does more complicated things and this creep should only be concerned with it's designated container
    const roomAudit = getRoomAudit(this.room);
    const container = roomAudit.controller?.containers.find(container=>{
      return container.store.energy > 0;
    });
    if (container){
      if (!this.moveWithinRange(container.pos, 1)){
        this.withdraw(container, RESOURCE_ENERGY);
      }
      return true;
    }
    return false;
  }

  startTakingFromControllerLink(){
    const roomAudit = getRoomAudit(this.room);
    const link = roomAudit.controller?.link;
    if (link && link.store.energy > 0){
      if (!this.moveWithinRange(link.pos, 1)){
        this.withdraw(link, RESOURCE_ENERGY);
      }
      return true;
    }
    return false;
  }

  work(){
    if (this.spawning) return;
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
      if (this.startTakingFromControllerLink()) return;
    }
  }
}
