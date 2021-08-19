import { BasicCreep } from "./BasicCreep";

export class MinerCreep extends BasicCreep {
  static config:CreepRole = {
    max: (counts)=>counts.sources,
    tiers: [
      {
        cost: 550,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE]
      }
    ],
    modSpawnOptions: (spawner, options)=>{
      const miners = spawner.room.find(FIND_MY_CREEPS, {
        filter: (creep:Creep)=>{
          creep.memory.role === 'miner';
        }
      });
      miners.map(miner=>miner.memory.targetId);
      const sources = spawner.room.find(FIND_SOURCES, {
        filter: (source:Source)=>{
          return miners.find(miner=>miner.memory.targetId === source.id);
        }
      });
      if (!sources.length) return;
      options.memory.targetId = sources[0].id;
    },
  }

  work(){
    // if (this.rememberAction(this.startMining, 'mining')) return;
  }
}
