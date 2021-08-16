import { USERNAME } from "utils/constants";
import { CreepTier, getCreepName, getHeighestCreepTier } from "utils/creeps";

const CreepTiers:CreepTier[] = [
  {
    cost: 200,
    body: [WORK, MOVE, CARRY]
  },
  {
    cost: 300,
    body: [WORK, MOVE, CARRY, MOVE, CARRY]
  },
];

export class SpawnController extends StructureSpawn{
  bestCreep:CreepTier;

  constructor(spawn:StructureSpawn){
    super(spawn.id);
    this.bestCreep = getHeighestCreepTier(CreepTiers, this.room);
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

      if (room.controller?.level >= 5){
        //https://docs.screeps.com/api/#StructureLink
        console.log('TODO: BUILD LINKS');
      }

      const creeps = this.room.find(FIND_CREEPS);
      if (creeps.length < sources.length * 5){
        if (creeps.length < 3){
          this.spawnCreep([WORK, MOVE, CARRY], getCreepName()); //Starter creeps
        }else{
          this.spawnCreep(this.bestCreep.body, getCreepName());
        }
      }
    }

    // room.find(FIND_SOURCES);
  }
}
