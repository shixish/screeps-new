import { BasicCreep } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  static config:CreepRole = {
    max: (counts)=>counts.sources,
    tiers: [
      {
        cost: 250,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          MOVE
        ]
      },
      // {
      //   cost: 400,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     MOVE, MOVE
      //   ]
      // },
      // {
      //   cost: 550,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY
      //   ]
      // },
    ],
    modSpawnOptions: (spawner:StructureSpawn)=>{
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
      return {
        targetId: sources[0].id,
      };
    },
  }

  work(){
    // if (this.rememberAction(this.startMining, 'mining')) return;
  }
}
