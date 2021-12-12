import { getRoomAudit } from "managers/room";
import { BasicCreep } from "./BasicCreep";

export class UpgraderCreep extends BasicCreep {
  static role:CreepRoleName = 'upgrader';
  static config:CreepRole = {
    authority: 1,
    max: (roomAudit:RoomAudit)=>{
      return roomAudit.controllerLevel > 5 ? 1 : 0;
    },
    tiers: [
      {
        cost: 650,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          CARRY, MOVE
        ],
      },
      {
        cost: 1150,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY, MOVE
        ],
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

  work(){
    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (energyCapacity > this.biteSize){
      this.startUpgrading();
    }else{
      const roomAudit = getRoomAudit(this.room);
      const container = roomAudit.controller?.containers.find(container=>{
        return container.store.energy > 0;
      });
      if (container) this.startTaking(container);
    }
    this.idle();
  }
}
