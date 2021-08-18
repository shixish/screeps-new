import { CreepRoles, SpawnerCounts, USERNAME } from "utils/constants";
import { creepCountParts, getCreepName, getHeighestCreepTier } from "utils/creeps";

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
    if (!(this.room.controller?.owner?.username === USERNAME)) return; //Not sure if this is necessary

    const repairable = this.getRepairableCreeps();
    if (repairable.length){
      //TODO: Repair the lowest creep
      // this.renewCreep
    }
    if (!this.spawning){
      // const sources = this.room.find(FIND_SOURCES);
      // sources.forEach(source=>{
      //   // this.room.createConstructionSite(source.pos.x, source.pos.y-1, STRUCTURE_ROAD); //Top
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y-1, STRUCTURE_ROAD); //Top Right
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y, STRUCTURE_ROAD); //Right
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Right
      //   // this.room.createConstructionSite(source.pos.x, source.pos.y+1, STRUCTURE_ROAD); // Bottom
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Left
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y, STRUCTURE_ROAD); //Left
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y-1, STRUCTURE_ROAD); //Top Left
      // });

      if (this.room.controller?.level >= 5){
        //https://docs.screeps.com/api/#StructureLink
        console.log('TODO: BUILD LINKS');
      }

      const creeps = this.room.find(FIND_MY_CREEPS);
      const creepCountsByRole = creeps.reduce((out, result)=>{
        const role = Memory.creeps[result.name].role;
        out[role] = out[role] === undefined ? 1 : out[role] + 1;
        return out;
      }, {} as { -readonly [key in keyof typeof CreepRoles]: number } );

      // console.log(`creepCountsByRole`, JSON.stringify(creepCountsByRole));

      // this.spawnCreep([WORK, MOVE, CARRY], getCreepName());
      for (const roleName in CreepRoles){
        const role = CreepRoles[roleName];
        if ((creepCountsByRole[roleName] || 0) < role.max(this.counts)){
          const body = getHeighestCreepTier(role.tiers, this.room).body;
          const name = getCreepName(roleName);
          this.spawnCreep(body, name, {
            memory: {
              role: roleName,
              counts: creepCountParts(body)
            }
          });
        }
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
