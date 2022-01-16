import { HarvestFlag } from "flags/HarvestFlag";
import { CreepRoleName, FlagType } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { getRoomAudit } from "utils/tickCache";
import { BasicCreep } from "./BasicCreep";

let lastFlagManager:HarvestFlag|undefined; //Pass the last accessed flagManager between max and getCeepAnchor functions
export class RemoteHarvesterCreep extends BasicCreep<HarvestFlag> {
  static config:CreepRole = {
    authority: 2,
    max: (roomAudit: RoomAudit)=>{
      const flagManager = roomAudit.flags[FlagType.Harvest].find(flagManager=>{
        return flagManager.home.name == roomAudit.room.name;
      });
      lastFlagManager = flagManager;
      if (flagManager){
        //Office room may not initially have vision
        const sourceCount = flagManager.office?.find(FIND_SOURCES).length || 1;
        const currentCreepCount = flagManager.followerRoleCounts[CreepRoleName.RemoteHarvester] || 0;
        //One creep per source in the office room
        return Math.max(sourceCount-currentCreepCount, 0);
      }
      return 0;
    },
    tiers: [
      {
        cost: 400,
        body: [WORK, WORK, WORK, MOVE, MOVE],
      }
    ],
    getCreepAnchor: (roomAudit:RoomAudit)=>{
      return lastFlagManager;
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
    if (!this.flag) throw 'Invalid flag given to RemoteHarvestCreep';
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
