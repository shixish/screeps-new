import { CreepRoles, getCreepName } from "managers/creeps";
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
      // const spawnableCreep = roomAudit.getPrioritySpawnableCreep();
      const spawnableCreep = roomAudit.getHighestSpawnableFlagCreep();
      if (spawnableCreep){

        const { role, tier, anchor, flag, cohort } = spawnableCreep;
        if (tier.body.cost > this.room.energyAvailable) return;
        // console.log(`Spawn flag creep`, JSON.stringify({
        //   role: spawnableCreep.role,
        //   flag: spawnableCreep.flag?.name,
        //   tier: spawnableCreep.tier?.body.counts,
        //   anchor: spawnableCreep.anchor?.id,
        //   cohort: spawnableCreep.cohort?.id,
        // }, null, 2));

        const creepName = getCreepName(role);
        const options:MandateProps<SpawnOptions, 'memory'> = {
          memory: {
            role,
            counts: tier.body.counts,
          }
        };
        if (anchor){
          options.memory.anchor = anchor.id;
        }
        if (flag){
          options.memory.flag = flag.name;
        }
        // if (config.modSpawnOptions) config.modSpawnOptions(roomAudit, options, this);
        // console.log(`Creep Counts:`, JSON.stringify(roomAudit.creepCountsByRole, null, 2));
        console.log(`Spawning ${role} creep (cost:${tier.body.cost}) in [${this.room.name}] for ${spawnableCreep.flag?.name}(${spawnableCreep.cohort?.id})`);// with memory:`, JSON.stringify(options, null, 2));
        //Inflate the number now so that any other spawns in the room don't try to build the same thing. This is only sufficient for this tick. The room audit needs to count creeps being produced in spawns.
        roomAudit.creepCountsByRole[role]++; //TODO: This can likely be deprecated
        console.log(`New ${role} creep count:`, roomAudit.creepCountsByRole[role]);
        this.spawnCreep(tier.body.parts, creepName, options);
        if (cohort) cohort.push(creepName); //Track the creep cohort allocation
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
