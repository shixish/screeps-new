import { maxStorageFill, TOWER_REPAIR_STORAGE_MIN } from "utils/constants";
import { claimAmount, getClaimedAmount } from "utils/tickCache";

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
  get maxRepair(){
    return this.maxRepairTiers[this.room.controller!.level];
  }

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

  static repairEffectiveness(distance:number){
    switch(distance){
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        return 800;
      case 6:
        return 760;
      case 7:
        return 720;
      case 8:
        return 680;
      case 9:
        return 640;
      case 10:
        return 600;
      case 11:
        return 560;
      case 12:
        return 520;
      case 13:
        return 480;
      case 14:
        return 440;
      case 15:
        return 400;
      case 16:
        return 360;
      case 17:
        return 320;
      case 18:
        return 280;
      case 19:
        return 240;
      case 20:
      default:
        return 200;
    }
  }

  static healEffectiveness(distance:number){
    switch(distance){
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        return 400;
      case 6:
        return 380;
      case 7:
        return 360;
      case 8:
        return 340;
      case 9:
        return 320;
      case 10:
        return 300;
      case 11:
        return 280;
      case 12:
        return 260;
      case 13:
        return 240;
      case 14:
        return 220;
      case 15:
        return 200;
      case 16:
        return 180;
      case 17:
        return 160;
      case 18:
        return 140;
      case 19:
        return 120;
      case 20:
      default:
        return 100;
    }
  }

  static attackEffectiveness(distance:number){
    switch(distance){
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        return 600;
      case 6:
        return 570;
      case 7:
        return 540;
      case 8:
        return 510;
      case 9:
        return 480;
      case 10:
        return 450;
      case 11:
        return 420;
      case 12:
        return 390;
      case 13:
        return 360;
      case 14:
        return 330;
      case 15:
        return 300;
      case 16:
        return 270;
      case 17:
        return 240;
      case 18:
        return 210;
      case 19:
        return 180;
      case 20:
      default:
        return 150;
    }
  }

  startRepairing():boolean{
    const resourceType = 'repair';
    if (this.store.energy < 200) return false; //Leave energy to attack scouts that are stomping my construction sites (what fucking cunts)
    const storageIsFull = this.room.storage && this.room.storage.store.energy > TOWER_REPAIR_STORAGE_MIN;

    maxStorageFill
    const repairable = this.room.find(FIND_STRUCTURES, {
      filter: (structure:OwnedStructure)=>{
        const repairAmount = TowerController.repairEffectiveness(this.pos.getRangeTo(structure));
        const maxHits = storageIsFull && structure.hitsMax || Math.min(structure.hitsMax, this.maxRepair);
        return structure.hits + getClaimedAmount(structure.id, resourceType) + repairAmount < maxHits && (structure.my || !structure.owner);
      }
    });
    //Sort by lowest current hitpoints first
    repairable.sort((a, b)=>{
      return a.hits - b.hits;
    });
    const structure = repairable[0];
    // const structure = this.pos.findClosestByRange(FIND_STRUCTURES, {
    //   filter: (structure)=>{
    //     const mine = (structure as any).my || !(structure as any).owner;
    //     return structure.hits < (this.maxRepair ? Math.min(structure.hitsMax, this.maxRepair) : structure.hitsMax) && mine;
    //   }
    // });
    if (!structure) return false;
    const action = this.repair(structure);
    const ok = this.respondToActionCode(action);
    const repairAmount = TowerController.repairEffectiveness(this.pos.getRangeTo(structure));
    if (ok) claimAmount(this.id, resourceType, Math.min(structure.hitsMax-structure.hits, repairAmount));
    return ok;
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
