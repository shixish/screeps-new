import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName } from "utils/constants";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

export interface DefendFlagMemory extends RemoteFlagMemory{

}

export class DefendFlag extends RemoteFlag<DefendFlagMemory> {
  /* Flag name should be in the form: `defend:${roomName}` where roomName is the name of the parent room. */
  cohorts = {
    melee: new Cohort(this.name+'-melee'),
  }
  // hostiles = this.office && [ ...this.office.find(FIND_HOSTILE_CREEPS), ...this.office.find(FIND_HOSTILE_STRUCTURES) ];

  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.High) return null;
    const optimalMeleeParts = 6; //TODO
    const neededMeleeParts = optimalMeleeParts - (this.cohorts.melee.counts[ATTACK] || 0);
    const melee = neededMeleeParts > 0 && this.findSpawnableCreep(CreepRoleName.Melee, body=>(
      neededMeleeParts % body.counts[ATTACK]
    ), { cohort: this.cohorts.melee });
    if (melee) return melee;
    return null;
  }

  work() {
    if (this.office && !this.office.find(FIND_HOSTILE_CREEPS).length && !this.office.find(FIND_HOSTILE_STRUCTURES).length){
      this.remove();
    }
  }
}
