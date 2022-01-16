import { HarvestFlag } from "flags/HarvestFlag";
import { CreepRoleName, FlagType } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { getRoomAudit } from "utils/tickCache";
import { BasicCreep } from "./BasicCreep";

export class RemoteHarvesterCreep extends BasicCreep<HarvestFlag> {
  static config:CreepRole = {
    authority: 2,
    tiers: [
      {
        cost: 400,
        body: [WORK, WORK, WORK, MOVE, MOVE],
      }
    ],
    getCreepFlag: (roomAudit:RoomAudit)=>{
      return roomAudit.flags[FlagType.Harvest].find(flagManager=>{
        return flagManager.getAvailableFollowersByRole(CreepRoleName.RemoteHarvester) > 0;
      });
    },
  }

  getAnchoredSource(office:Room|undefined){
    if (!office) return;
    const roomAudit = getRoomAudit(office);
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
    if (!this.flag) throw `Invalid flag given to RemoteHarvestCreep ${this.name}`;
    //The room may not initially have vision
    const source = this.getAnchoredSource(this.flag.office);
    if (source){
      this.startHarvesting(source);
    }else if (this.flag.roomName === this.room.name){
      throw `Unable to find remote source in room.`;
    }else{
      this.moveTo(this.flag.pos);
    }
  }
}
