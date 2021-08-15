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
    if (!(room.controller?.owner?.username === USERNAME)) return; //Not sure if this is necessary

    const repairable = this.getRepairableCreeps();
    if (repairable.length){
      //TODO: Repair the lowest creep
      // this.renewCreep
    }
    if (!this.spawning){
      const sources = this.room.find(FIND_SOURCES);
      sources.forEach(source=>{
        this.room.createConstructionSite(source.pos.x, source.pos.y-1, STRUCTURE_ROAD); //Top
        this.room.createConstructionSite(source.pos.x+1, source.pos.y-1, STRUCTURE_ROAD); //Top Right
        this.room.createConstructionSite(source.pos.x+1, source.pos.y, STRUCTURE_ROAD); //Right
        this.room.createConstructionSite(source.pos.x+1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Right
        this.room.createConstructionSite(source.pos.x, source.pos.y+1, STRUCTURE_ROAD); // Bottom
        this.room.createConstructionSite(source.pos.x-1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Left
        this.room.createConstructionSite(source.pos.x-1, source.pos.y, STRUCTURE_ROAD); //Left
        this.room.createConstructionSite(source.pos.x-1, source.pos.y-1, STRUCTURE_ROAD); //Top Left
      });

      if (room.controller?.level >= 5){
        //https://docs.screeps.com/api/#StructureLink
        console.log('TODO: BUILD LINKS');
      }

      if (this.room.find(FIND_CREEPS).length < sources.length * 5){
        this.spawnCreep([WORK, MOVE, CARRY], getCreepName());
      }
    }

    // room.find(FIND_SOURCES);
  }
}
