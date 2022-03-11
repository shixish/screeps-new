import { CreepRoleName, PARTS } from "./constants";

if (!Memory.cohorts) Memory.cohorts = {};
export interface CohortMemory{
  list?: Creep['name'][];
  counts?: Partial<CreepPartsCounts>;
}

export class Cohort<AbstractCohortMemory extends CohortMemory = CohortMemory>{
  id: string;

  constructor(id:string){
    this.id = id;
    let stale = false;
    this.list.forEach((creepName, i)=>{
      if (!Game.creeps[creepName]){
        this.list.splice(i,1);
        if (!stale && Memory.creeps[creepName]){
          this.subtractBodyParts(Memory.creeps[creepName].counts);
        }else{
          stale = true;
        }
      }
    });
    if (stale) this.rebuildBodyParts();
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
    const creep = Memory.creeps[creepName];
    if (creep){
      this.list.push(creepName);
      this.addBodyParts(Memory.creeps[creepName].counts);
    }else{
      throw `Tried to add a creep that doesn't exist to Cohort: ${this.id}`;
    }
  }

  destroy(){
    this.list.forEach((creepName)=>{
      const creep = Game.creeps[creepName];
      if (creep) creep.suicide();
    });
    delete Memory.cohorts[this.id];
  }

  private subtractBodyParts(counts:Partial<CreepPartsCounts>){
    for (let part of PARTS){
      const count = counts[part] ?? 0;
      if (count > 0) this.counts[part] = (this.counts[part] ?? 0) - count;
    }
  }

  private addBodyParts(counts:Partial<CreepPartsCounts>){
    for (let part of PARTS){
      const count = counts[part] ?? 0;
      if (count > 0) this.counts[part] = (this.counts[part] ?? 0) + count;
    }
  }

  private rebuildBodyParts(){
    this.memory.counts = {};
    this.list.forEach(creepName=>{
      this.addBodyParts(Memory.creeps[creepName].counts);
    });
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
