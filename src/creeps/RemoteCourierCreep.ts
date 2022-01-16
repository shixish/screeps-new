import { HarvestFlag } from "flags/HarvestFlag";
import { CreepRoleName, FlagType } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { claimAmount, getClaimedAmount, getRoomAudit } from "utils/tickCache";
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
        const currentCreepCount = flagManager.followerRoleCounts[CreepRoleName.RemoteCourier] || 0;
        const max = sourceCount;// * 2;
        return Math.max(max-currentCreepCount, 0);
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

  // startRemotePickup(storedTarget:TargetableTypes){
  //   if (!this.canCarry) return null;
  //   const freeCapacity = this.store.getFreeCapacity();
  //   if (freeCapacity == 0) return null;
  //   const checkResourceAmount = (resource:Resource)=>{
  //     return getClaimedAmount(resource.id, resource.resourceType) < resource.amount;
  //   };
  //   const resource =
  //     storedTarget instanceof Resource && storedTarget.resourceType && checkResourceAmount(storedTarget) && storedTarget ||
  //     this.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
  //       filter: (resource)=>{
  //         //If the loose resource is sitting on a container just grab from the container instead so we can take a bigger bite and move on.
  //         if (resource.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_CONTAINER && (structure as StructureContainer).store.getFreeCapacity() === 0)) return false;
  //         return checkResourceAmount(resource);
  //       }
  //     });
  //   if (resource){
  //     if (this.moveWithinRange(resource.pos, 1) || this.manageActionCode(this.pickup(resource))){
  //       claimAmount(resource.id, resource.resourceType, Math.min(freeCapacity, resource.amount));
  //       return resource;
  //     }
  //   }

  //   const checkCapacity = (target:Tombstone|Ruin)=>{
  //     return target.store.getUsedCapacity() > 0;
  //   };
  //   const tombstone =
  //     storedTarget instanceof Tombstone && checkCapacity(storedTarget) && storedTarget ||
  //     storedTarget instanceof Ruin && checkCapacity(storedTarget) && storedTarget ||
  //     this.pos.findClosestByRange(FIND_TOMBSTONES, {
  //       filter: checkCapacity
  //     }) ||
  //     this.pos.findClosestByRange(FIND_RUINS, {
  //       filter: checkCapacity
  //     });
  //   if (tombstone){
  //     const resourceType = RESOURCES_ALL.find(resourceType=>{
  //       return tombstone.store[resourceType] > 0 && getClaimedAmount(tombstone.id, resourceType) < tombstone.store[resourceType];
  //     });
  //     if (!resourceType){
  //       // console.log('Invalid resource type in tombstone:', JSON.stringify(tombstone.store));
  //       return null;
  //     }
  //     if (this.moveWithinRange(tombstone.pos, 1) || this.manageActionCode(this.withdraw(tombstone, resourceType))){
  //       const amount = Math.min(freeCapacity, tombstone.store[resourceType]);
  //       claimAmount(tombstone.id, resourceType, amount);
  //       return tombstone;
  //     }
  //   }
  //   return null;
  // }

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

  // startCommuting(storedTarget?:TargetableTypes){
  //   if (this.room.name === this.flag!.home.name) return null;
  //   const findExit = ()=>{
  //     const exitConstant = this.room.findExitTo(this.flag!.home);
  //     return this.pos.findClosestByRange(exitConstant as ExitConstant);
  //   };

  //   const target = storedTarget || findExit();
  //   if (!target) return null;
  //   this.moveTo(target);
  //   return target;
  // }

  startRemotePickup(storedTarget:TargetableTypes){
    const getUnclaimedResourceAmount = (resource:Resource)=>{
      return resource.amount - getClaimedAmount(resource.id, resource.resourceType);
    };

    const findAvailableOfficeResource = ()=>{
      let most:number|undefined;
      return this.flag!.office!.find(FIND_DROPPED_RESOURCES).reduce((out, resource)=>{
        const amount = getUnclaimedResourceAmount(resource);
        if (!out || most! < amount){
          most = amount;
          out = resource;
        }
        return out;
      }, undefined as Resource|undefined);
    };
    const target =
      storedTarget instanceof Resource && getUnclaimedResourceAmount(storedTarget) > 0 && storedTarget ||
      findAvailableOfficeResource();

    if (!target) return null;
    return this.startPickup(target);
  }

  work(){
    if (!this.flag) throw 'Invalid flag given to RemoteCourierCreep';
    if (!this.flag.office){
      //This indicates that we don't have vision of the room yet. Just start moving towards the flag.
      this.moveTo(this.flag.pos);
      return;
    }

    const isAtHome = this.room.name === this.flag!.home.name;
    // const isAtOffice = this.room.name === this.flag!.roomName;

    const freeSpace = this.store.getFreeCapacity(RESOURCE_ENERGY);
    if (freeSpace > 0){
      //Note: Sometimes the path may lead to other rooms so once we lock on a target it should just keep following it's known path
      if (this.rememberAction(this.startRemotePickup, 'pickup')) return;
    }else{
      if (this.rememberAction(this.startReturning, 'returning')) return;
      if (this.rememberAction(this.startStocking, 'stocking')) return;
      if (this.rememberAction(this.startStoring, 'storing')) return;
      if (isAtHome){
        this.drop(RESOURCE_ENERGY); //Lame move but ok for now
      }
    }

    // If nothing was successful, reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
  }
}
