import { CreepRoleName, PARTS } from "./constants";

if (!Memory.cohorts) Memory.cohorts = {};
export interface CohortMemory{
  list?: Creep['name'][];
  counts?: CreepPartsCounts;
}

export abstract class Cohort<AbstractCreep extends BasicCreep = BasicCreep, AbstractCohortMemory extends CohortMemory = CohortMemory>{
  id:string|Id<RoomObject>;

  constructor(id:string|Id<RoomObject>){
    this.id = id;
    this.list.forEach((creepName, i)=>{
      if (!Game.creeps[creepName]){
        this.list.splice(i,1);
        this.subtractBodyParts(Memory.creeps[creepName].counts);
      }
    });
  }

  get occupancy(){
    return this.list.length;
  }

  get list(){
    return this.memory.list || (this.memory.list = []);
  }

  get counts(){
    return this.memory.counts || (this.memory.counts = {});
  }

  get memory():AbstractCohortMemory{
    return (Memory.cohorts[this.id] || (Memory.cohorts[this.id] = {})) as AbstractCohortMemory;
  }

  push(creepName:Creep['name']){
    this.list.push(creepName);
    this.addBodyParts(Memory.creeps[creepName].counts);
  }

  destroy(){
    this.list.forEach((creepName)=>{
      const creep = Game.creeps[creepName];
      if (creep) creep.suicide();
    });
    delete Memory.cohorts[this.id];
  }

  private subtractBodyParts(counts:CreepPartsCounts){
    for (let part of PARTS){
      this.counts[part] = (this.counts[part] ?? 0) - (counts[part] ?? 0);
    }
  }

  private addBodyParts(counts:CreepPartsCounts){
    for (let part of PARTS){
      this.counts[part] = (this.counts[part] ?? 0) + (counts[part] ?? 0);
    }
  }

  // static addBodyParts(counts1:CreepPartsCounts, counts2:CreepPartsCounts){
  //   const out = {} as CreepPartsCounts;
  //   for (let part of PARTS){
  //     out[part] = (counts1[part] || 0) + (counts2[part] || 0);
  //   }
  //   return out;
  // }

  // countBodyParts(part:undefined):CreepPartsCounts;
  // countBodyParts(part:BodyPartConstant):number;
  // countBodyParts(part?:BodyPartConstant){
  //   if (part){
  //     return this.creepList.reduce((out, occupant)=>{
  //       const counts = Memory.creeps[occupant].counts;
  //       out = out + (counts[part] || 0);
  //       return out;
  //     }, 0);
  //   }else{
  //     return this.creepList.reduce((out, occupant)=>{
  //       const counts = Memory.creeps[occupant].counts;
  //       for (let c in counts){
  //         out[c as BodyPartConstant] = (out[c as BodyPartConstant] || 0) + (counts[c as BodyPartConstant] || 0);
  //       }
  //       return out;
  //     }, {} as CreepPartsCounts);
  //   }
  // }
}
