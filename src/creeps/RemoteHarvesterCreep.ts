import { HarvestFlag } from "flags/HarvestFlag";
import { FlagType } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { getRoomAudit } from "utils/tickCache";
import { BasicCreep } from "./BasicCreep";

export class RemoteHarvesterCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 2,
    tiers: [
      {
        cost: 400,
        body: [WORK, WORK, WORK, MOVE, MOVE],
        max: (roomAudit:RoomAudit)=>{
          return roomAudit.sources.length;
        },
      }
    ],
    getCreepAnchor: (roomAudit:RoomAudit)=>{
      return roomAudit.flags[FlagType.Harvest].find(flagManager=>{
        return flagManager.suffix === roomAudit.room.name;
      });
    },
  }

  getRemoteSource(){
    if (!this.room) return;
    const roomAudit = getRoomAudit(this.room);
    if (!this.memory.anchor){
      const sourceAnchor = roomAudit.sources.reduce((out:CreepAnchor<Source>|undefined, source)=>{
        if (source.availableSeats > 0 && (!out || source.occupancy < out.occupancy)){
          out = source;
        }
        return out;
      }, undefined);
      if (!sourceAnchor) return;
      this.memory.anchor = sourceAnchor.id;
      sourceAnchor.addOccupant(this.name);
      return sourceAnchor.anchor;
    }
    // return roomAudit.sources.find(source=>source.id === this.memory.anchor);
    return Game.getObjectById(this.memory.anchor);
  }

  work(){
    const flag = this.getFlag() as HarvestFlag;
    if (flag){
      //Note flag.room may not exist until we actually get there.
      if (flag.office && this.room.name === flag.room.name){
        const source = this.getRemoteSource();
        if (source){
          this.startHarvesting(source);
        }else{
          console.log(`[${flag.room.name}] Unable to find remote source in room.`);
        }
      }else{
        this.moveTo(flag.pos);
      }
    }
  }
}
