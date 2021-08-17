import { USERNAME } from "utils/constants";

class TowerController extends StructureTower {
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

  respondToActionCode(action:ScreepsReturnCode, target: RoomPosition | { pos: RoomPosition }){
    if (action === OK){
      return true;
    } else {
      console.log(`action error`, action);
    }
    return false;
  }

  startAttacking(){
    const target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (!target) return false;
    const action = this.attack(target);
    return this.respondToActionCode(action, target);
  }

  startRepairing():boolean{
    const repairable = this.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure)=>{
        const owner = (structure as any).owner;
        return structure.hits < (this.maxRepair ? Math.min(structure.hitsMax, this.maxRepair) : structure.hitsMax) && (!owner || owner == USERNAME)
      }
    });
    if (!repairable) return false;
    const action = this.repair(repairable);
    return this.respondToActionCode(action, repairable);
  }

  startHealing():boolean{
    const healable = this.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (creep)=>creep.hits < creep.hitsMax
    });
    if (!healable) return false;
    const action = this.heal(healable);
    return this.respondToActionCode(action, healable);
  }

  work() {
    if (this.store.energy === 0) return;
    if (this.startAttacking()) return;
    if (this.startHealing()) return;
    if (this.startRepairing()) return;
  }
}
