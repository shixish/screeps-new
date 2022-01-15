import { FlagType } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { getRoomAudit } from "utils/tickCache";
import { HarvesterCreep } from "./HarvesterCreep";

export class RemoteHarvesterCreep extends HarvesterCreep {
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

      // const sourceAnchor = roomAudit.sources.reduce((out:CreepAnchor<Source>|undefined, source)=>{
      //   if (source.availableSeats > 0 && (!out || source.occupancy < out.occupancy)){
      //     out = source;
      //   }
      //   return out;
      // }, undefined);
      // return sourceAnchor;
    },
  }

  // work(){
  //   if (this.spawning) return;
  //   // if (!this.memory.anchor){
  //   //   const roomAudit = getRoomAudit(this.room);
  //   //   const creepAnchor = MinerCreep.config.getCreepAnchor!(roomAudit);
  //   //   if (creepAnchor){
  //   //     // console.log(`creepAnchor`, creepAnchor);
  //   //     this.memory.anchor = creepAnchor.id;
  //   //     creepAnchor.addOccupant(this.name);
  //   //   }
  //   // }

  //   // super.work();
  //   const anchor = this.getAnchor();
  //   if (anchor){
  //     if (!this.memory.seated){
  //       this.memory.seated = false; //This will disable resource spreading which will slow down these already slow creeps
  //       if (this.moveWithinRange(anchor.pos, 1)) return;
  //       const roomAudit = getRoomAudit(this.room);
  //       const sourceAnchor = roomAudit.sources.find(source=>source.id === this.memory.anchor);
  //       if (!sourceAnchor!.containers.length){
  //         //If this source doesn't have any containers near it yet just have a seat anywhere
  //         this.memory.seated = true;
  //       }else{
  //         const seatContainer = sourceAnchor!.containers.find(container=>{
  //           //If you're already over a container or there's a open container nearby
  //           return this.pos.isEqualTo(container.pos) || !container.pos.lookFor(LOOK_CREEPS).length;
  //         });
  //         //Another creep might be temporarily sitting on the desired container, or there might be multiple miners but only one box.
  //         if (seatContainer){
  //           if (this.pos.isEqualTo(seatContainer.pos)){
  //             this.memory.seated = true;
  //           }else{
  //             this.moveTo(seatContainer);
  //             return;
  //           }
  //         }
  //       }
  //     }
  //   }
  //   this.startHarvesting(anchor);
  // }
}
