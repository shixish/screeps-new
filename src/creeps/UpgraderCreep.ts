import { getRoomAudit, RoomSource } from "managers/room";
import { BasicCreep } from "./BasicCreep";

export class UpgraderCreep extends BasicCreep {
  static role:CreepRoleName = 'upgrader';
  static config:CreepRole = {
    authority: 1,
    tiers: [
      // {
      //   cost: 250,
      //   body: [WORK, WORK, MOVE],
      //   max: (roomAudit)=>{
      //     return Math.min(roomAudit.sourceSeats, roomAudit.sources.length*3);
      //   },
      // },
      // {
      //   cost: 550,
      //   body: [WORK, WORK, WORK, WORK, WORK, MOVE],
      //   max: (roomAudit)=>{
      //     return roomAudit.sources.length;
      //   },
      // }
    ],
    getCreepAnchor: (roomAudit)=>{
      const sourceAnchor = roomAudit.sources.reduce((out:RoomSource|undefined, source)=>{
        if (!out || source.occupancy < out.occupancy){
          out = source;
        }
        return out;
      }, undefined);
      return sourceAnchor;
    },
  }

  work(){
    // if (this.rememberAction(this.startMining, 'mining')) return;
  }
}
