import { getRoomAudit, RoomSource } from "managers/room";
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
    getCreepAnchor: (roomAudit, room)=>{
      return room.controller;
    },
  }

  work(){
    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (energyCapacity > 0){
      if (this.rememberAction(this.startUpgrading, 'upgrading')) return;
    }
    this.idle();
  }
}
