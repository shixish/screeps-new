import { PARTS } from "./constants";

if (!Memory.anchors) Memory.anchors = {};
// export interface CreepManagerMemory{
//   seats?: number;
//   containers: Id<StructureContainer>[];
//   occupancy: Creep['name'][];
// }

export class CreepManager{
  creepList:Creep['name'][];
  counts:CreepPartsCounts = {};

  constructor(creepList:Creep['name'][]){
    this.creepList = creepList;
    creepList.forEach((creepName, i)=>{
      if (!Game.creeps[creepName]) creepList.splice(i,1);
      else {
        this.addBodyParts(Memory.creeps[creepName].counts);
      }
    });
  }

  get length(){
    return this.creepList.length;
  }

  push(creepName:Creep['name']){
    this.creepList.push(creepName);
    this.addBodyParts(Memory.creeps[creepName].counts);
  }

  addBodyParts(counts:CreepPartsCounts){
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
