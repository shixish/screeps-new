import { creepCountParts, CreepRoles, getCreepName, getCreepPartsCost } from "managers/creeps";
import { BasicFlag } from "flags/_BasicFlag";
import { CreepAnchor, GenericAnchorType } from "utils/CreepAnchor";
import { getRoomAudit } from "utils/tickCache";

export class SpawnController extends StructureSpawn{
  constructor(spawn:StructureSpawn){
    super(spawn.id);
    // this.bestCreep = getHeighestCreepTier(CreepTiers, this.room);
  }

  getRepairableCreeps(){
    // if (room.memory.storage.energy > 1000){
    return this.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: function (creep: Creep) {
        return creep.ticksToLive !== undefined && creep.ticksToLive < 1400;// && !creep.memory.obsolete;
      }
    });
  }

  get sourceCount(){
    if (this.memory.sourceCount === undefined){
      const sources = this.room.find(FIND_SOURCES);
      this.memory.sourceCount = sources.length;
    }
    return this.memory.sourceCount;
  }

  get counts():SpawnerCounts{
    return {
      controllerLevel: this.room.controller?.level || 0,
      sources: this.sourceCount,
    }
  }

  work(){
    if (!this.spawning){
      const roomAudit = getRoomAudit(this.room);
      const spawnableCreep = roomAudit.getPrioritySpawnableCreep();
      if (spawnableCreep){
        const { role, tier, anchor } = spawnableCreep;
        const name = getCreepName(role);
        const options:MandateProps<SpawnOptions, 'memory'> = {
          memory: {
            role,
            counts: creepCountParts(tier.body),
            // home: this.room.name,
            // office: this.room.name,
          }
        };
        if (anchor instanceof BasicFlag){
          options.memory.flag = anchor.name;
          anchor.addFollower(name);
        }else if (anchor instanceof CreepAnchor){
          options.memory.anchor = anchor.id;
          anchor.addOccupant(name);
        }
        // if (config.modSpawnOptions) config.modSpawnOptions(roomAudit, options, this);
        if (tier.cost > this.room.energyAvailable) return;
        // console.log(`Creep Counts:`, JSON.stringify(roomAudit.creepCountsByRole, null, 2));
        console.log(`Spawning ${role} creep (cost:${tier.cost}) in [${this.room.name}]`);// with memory:`, JSON.stringify(options, null, 2));
        //Inflate the number now so that any other spawns in the room don't try to build the same thing. This is only sufficient for this tick. The room audit needs to count creeps being produced in spawns.
        roomAudit.creepCountsByRole[role]++;
        console.log(`New ${role} creep count:`, roomAudit.creepCountsByRole[role]);
        this.spawnCreep(tier.body, name, options);
      }
    }
  }

  // spawnCreep(body: BodyPartConstant[], name:string = getCreepName(), opts: SpawnOptions = {}){
  //   opts.memory = {
  //     role: 'basic',
  //     counts: creepCountParts(body),
  //     ... opts?.memory
  //   }
  //   return super.spawnCreep(body, name, opts);
  // }
}
