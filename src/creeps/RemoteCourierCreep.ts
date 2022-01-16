import { HarvestFlag } from "flags/HarvestFlag";
import { FlagType } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { getRoomAudit } from "utils/tickCache";
import { BasicCreep } from "./BasicCreep";

let lastFlagManager:HarvestFlag|undefined; //Pass the last accessed flagManager between max and getCeepAnchor functions
export class RemoteCourierCreep extends BasicCreep<HarvestFlag> {
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
        const max = sourceCount;// * 2;
        return Math.max(max-flagManager.followers.length, 0);
      }
      return 0;
    },
    tiers: [
      {
        cost: 400,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
      },
    ],
    getCreepAnchor: (roomAudit:RoomAudit)=>{
      return lastFlagManager;
    },
  }

  getAnchoredSource(office:Room){
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

  startReturning(storedTarget?:TargetableTypes){
    if (this.room.name === this.flag!.home.name) return null;
    const findExit = ()=>{
      const exitConstant = this.room.findExitTo(this.flag!.home);
      return this.pos.findClosestByRange(exitConstant as ExitConstant);
    };

    const target = storedTarget || findExit();
    if (!target) return null;
    this.moveTo(target);
    return target;
  }

  work(){
    if (!this.flag) throw 'Invalid flag given to RemoteCourierCreep';
    if (!this.flag.office) return;

    const energy = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (energy > 0){ //Do something with the energy
      if (this.rememberAction(this.startReturning, 'returning')) return;
      if (this.rememberAction(this.startStocking, 'stocking')) return;
      if (this.rememberAction(this.startStoring, 'storing')) return;
    }else{
      if (this.rememberAction(this.startPickup, 'pickup')) return;
    }

    if (this.flag.office){ //The room may not initially have vision

      if (this.rememberAction(this.startEnergizing, 'energizing', ['upgrading', 'building', 'repairing'])) return;
    }else{
      this.moveTo(this.flag.pos);
    }
  }
}
