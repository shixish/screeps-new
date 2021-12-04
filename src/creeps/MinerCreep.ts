import { RoomSource } from "utils/room";
import { BasicCreep } from "./BasicCreep";

export class MinerCreep extends BasicCreep {
  static role:CreepRoleName = 'miner';
  static config:CreepRole = {
    authority: 1,
    tiers: [
      {
        cost: 250,
        body: [WORK, WORK, MOVE],
        max: (roomAudit)=>{
          return Math.min(roomAudit.sourceSeats, roomAudit.sources.length*3);
        },
      },
      {
        cost: 550,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE],
        max: (roomAudit)=>{
          return roomAudit.sources.length;
        },
      }
    ],
    getCreepAnchor: (roomAudit)=>{
      const sourceAnchor = roomAudit.sources.reduce((out:RoomSource|null, source)=>{
        if (!out || source.occupancy < out.occupancy){
          out = source;
        }
        return out;
      }, null);
      return sourceAnchor?.id;
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

  // work(){
  //   super.work();
  //   // if (this.rememberAction(this.startMining, 'mining')) return;
  // }
}
