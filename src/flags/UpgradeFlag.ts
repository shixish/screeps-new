import { CreepPriority, CreepRoleName, UPGRADER_STORAGE_MIN } from "utils/constants";
import { BasicFlag } from "./_BasicFlag";
import { RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `upgrade:${roomName}` where roomName is the name of the parent room. */

interface UpgradeFlagMemory extends RemoteFlagMemory{

}

export class UpgradeFlag extends BasicFlag<UpgradeFlagMemory> {
  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.Low) return null;

    //Send 80% of total energy into the controller. If we're banking then ramp up the usage.
    const upgraderEnergyPerTick = this.homeAudit.totalEnergyIncomePerTick*(this.homeAudit.storedEnergy > UPGRADER_STORAGE_MIN ? 2 : 0.8);
    if (this.homeAudit.controller){
      const controllerAnchor = this.homeAudit.controller;

      //Produce couriers to ferry energy to the controller upgraders
      const roundTrip = controllerAnchor.anchor.pos.getRangeTo(this.homeAudit.center)*2; //rough range estimate
      const optimalCourierParts = Math.ceil((roundTrip*upgraderEnergyPerTick)/50); //can carry 50 energy per carry part
      const neededCourierParts = optimalCourierParts - (controllerAnchor.couriers.counts[CARRY] || 0);
      const courier = neededCourierParts > 0 && this.findSpawnableCreep(CreepRoleName.Courier, body=>(
        body.counts[CARRY] > 0 && neededCourierParts % body.counts[CARRY]
      ), { anchor: controllerAnchor, cohort: controllerAnchor.couriers });
      if (courier) return courier;


      // roomAudit.storedEnergy > UPGRADER_STORAGE_MIN
      // if (controllerAnchor.upgraders.list.length < 5){}
      const optimalUpgraderWorkParts = upgraderEnergyPerTick/2; //Upgrading uses 2 Energy per WORK part
      const neededUpgraderParts = optimalUpgraderWorkParts - (controllerAnchor.upgraders.counts[WORK] || 0);
      const optimalUpgrader = neededUpgraderParts > 0 && this.findSpawnableCreep(CreepRoleName.Upgrader, body=>(
        body.counts[WORK] > 0 &&
        optimalUpgraderWorkParts / body.counts[WORK] < 5 &&
        optimalUpgraderWorkParts % body.counts[WORK]
      ), { anchor: controllerAnchor, cohort: controllerAnchor.upgraders, priority:CreepPriority.Low });
      if (optimalUpgrader && optimalUpgrader.tier.body.counts[WORK] <= neededUpgraderParts) return optimalUpgrader;
    }

    // const optimalScoutParts = 1;
    // const neededScoutParts = optimalScoutParts - (this.scouts.counts[MOVE] || 0);
    // const scout = neededScoutParts > 0 && this.findSpawnableCreep(CreepRoleName.Scout, body=>0, { cohort: this.scouts });
    // if (scout) return scout;

    return null;
  }

  work(){

  }
}
