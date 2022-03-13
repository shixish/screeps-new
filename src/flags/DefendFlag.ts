import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName } from "utils/constants";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

export interface DefendFlagMemory extends RemoteFlagMemory{

}

export class DefendFlag extends RemoteFlag<DefendFlagMemory> {
  /* Flag name should be in the form: `defend:${roomName}` where roomName is the name of the parent room. */
  melee:Cohort = new Cohort(this.name+'-melee');
  // hostiles = this.office && [ ...this.office.find(FIND_HOSTILE_CREEPS), ...this.office.find(FIND_HOSTILE_STRUCTURES) ];

  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.High) return null;
    const optimalMeleeParts = 6; //TODO
    const neededMeleeParts = optimalMeleeParts - (this.melee.counts[ATTACK] || 0);
    const Melee = neededMeleeParts > 0 && this.findSpawnableCreep(CreepRoleName.Melee, body=>(
      neededMeleeParts % body.counts[ATTACK]
    ), { cohort: this.melee });
    if (Melee) return Melee;
    return null;
  }

  work() {
    if (this.office && !this.office.find(FIND_HOSTILE_CREEPS).length && !this.office.find(FIND_HOSTILE_STRUCTURES).length){
      this.remove();
    }
  }

  remove(){
    this.melee.destroy();
    super.remove();
  }
}
