import { USERNAME } from "utils/constants";

export class TowerController extends StructureTower {
  private maxRepairTiers:{ [key:number]: number } = {
    3: 25000, //tower starts at 3
    4: 50000,
    5: 250000,
    6: 500000,
    7: 1000000,
    8: 1500000
  };
  //Don't repair walls more this amount, based on control level
  private maxRepair = this.room.controller && this.maxRepairTiers[this.room.controller.level];

  constructor(tower:StructureTower){
    super(tower.id);
  }

  respondToActionCode(action:ScreepsReturnCode){
    if (action === OK){
      return true;
    } else {
      console.log(`Tower action error`, action);
    }
    return false;
  }

  startAttacking(){
    const target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (!target) return false;
    const action = this.attack(target);
    return this.respondToActionCode(action);
  }

  startRepairing():boolean{
    const repairable = this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure)=>{
        const mine = (structure as any).my || !(structure as any).owner;
        return structure.hits < (this.maxRepair ? Math.min(structure.hitsMax, this.maxRepair) : structure.hitsMax) && mine;
      }
    });
    if (!repairable) return false;
    const action = this.repair(repairable);
    return this.respondToActionCode(action);
  }

  startHealing():boolean{
    const healable = this.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (creep)=>creep.hits < creep.hitsMax
    });
    if (!healable) return false;
    const action = this.heal(healable);
    return this.respondToActionCode(action);
  }

  work() {
    this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure)=>{
        const mine = (structure as any).my || !(structure as any).owner;
        return structure.hits < (this.maxRepair ? Math.min(structure.hitsMax, this.maxRepair) : structure.hitsMax) && mine;
      }
    });

    if (this.store.energy < 10) return; //Actions take 10 energy
    if (this.startAttacking()) return;
    if (this.startHealing()) return;
    if (this.startRepairing()) return;
  }
}
