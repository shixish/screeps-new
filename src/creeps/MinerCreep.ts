import { CreepAnchor } from "utils/CreepAnchor";
import { BasicCreep } from "./BasicCreep";

export class MinerCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 1,
    tiers: [
      {
        cost: 250,
        body: [WORK, WORK, MOVE],
        max: (roomAudit:RoomAudit)=>{
          return Math.min(roomAudit.sourceSeats, roomAudit.sources.length*3);
        },
      },
      {
        cost: 550,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE],
        max: (roomAudit:RoomAudit)=>{
          return roomAudit.sources.length;
        },
      }
    ],
    getCreepAnchor: (roomAudit:RoomAudit)=>{
      const sourceAnchor = roomAudit.sources.reduce((out:CreepAnchor<Source>|undefined, source)=>{
        if (source.availableSeats > 0 && (!out || source.occupancy < out.occupancy)){
          out = source;
        }
        return out;
      }, undefined);
      return sourceAnchor;
    },
    // modSpawnOptions: (roomAudit, options, spawner)=>{
    //   const miners = spawner.room.find(FIND_MY_CREEPS, {
    //     filter: (creep:Creep)=>{
    //       creep.memory.role === 'miner';
    //     }
    //   });
    //   miners.map(miner=>miner.memory.anchor);
    //   const sources = spawner.room.find(FIND_SOURCES, {
    //     filter: (source:Source)=>{
    //       return Boolean(miners.find(miner=>miner.memory.anchor === source.id));
    //     }
    //   });
    //   // console.log(`sources`, sources);
    //   if (!sources.length) return;
    //   options.memory.anchor = sources[0].id;
    // },
  }

  work(){
    if (this.spawning) return;
    // if (!this.memory.anchor){
    //   const roomAudit = getRoomAudit(this.room);
    //   const creepAnchor = MinerCreep.config.getCreepAnchor!(roomAudit);
    //   if (creepAnchor){
    //     // console.log(`creepAnchor`, creepAnchor);
    //     this.memory.anchor = creepAnchor.id;
    //     creepAnchor.addOccupant(this.name);
    //   }
    // }

    // super.work();
    const anchor = this.getAnchor();
    this.startMining(anchor);
  }
}
