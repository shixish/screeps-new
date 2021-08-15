import { USERNAME } from "utils/constants";
import { getCreepName } from "utils/creeps";

export class SpawnController extends StructureSpawn{
  constructor(spawn:StructureSpawn){
    super(spawn.id);
  }

  getRepairableCreeps(){
    // if (room.memory.storage.energy > 1000){
    return this.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: function (creep: Creep) {
        return creep.ticksToLive !== undefined && creep.ticksToLive < 1400;// && !creep.memory.obsolete;
      }
    });
  }

  work(){
    const room = this.room;
    if (!(room.controller?.owner?.username === USERNAME)) return;

    const repairable = this.getRepairableCreeps();
    if (repairable.length){
      //TODO: Repair the lowest creep
      // this.renewCreep
    }
    if (!this.spawning) {
      this.spawnCreep([WORK, MOVE, CARRY], getCreepName());
    }

    // room.find(FIND_SOURCES);
  }
}
