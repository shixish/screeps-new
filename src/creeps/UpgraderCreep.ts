import { getRoomAudit } from "managers/room";
import { BasicCreep } from "./BasicCreep";

export class UpgraderCreep extends BasicCreep {
  static role:CreepRoleName = 'upgrader';
  static config:CreepRole = {
    authority: 1,
    tiers: [
      {
        cost: 650,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY, MOVE
        ],
        max: (roomAudit)=>{
          return roomAudit.controllerLevel > 5 ? 1 : 0;
        },
      }
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
