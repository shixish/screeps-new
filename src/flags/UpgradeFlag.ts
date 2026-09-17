import { CreepPriority, CreepRoleName, FlagType, UPGRADER_STORAGE_MIN } from "utils/constants";
import { areDedicatedMinersInPlace, canFeedController } from "utils/earlyEconomy";
import { BasicFlag } from "./_BasicFlag";
import { RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `upgrade:${roomName}` where roomName is the name of the parent room. */

interface UpgradeFlagMemory extends RemoteFlagMemory{

}

export class UpgradeFlag extends BasicFlag<UpgradeFlagMemory> {
  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.Normal) return null;

    const homeDrones = this.homeAudit.flags[FlagType.Home]?.[0]?.cohorts?.drones;
    /*
      Harvest coverage outranks upgrading, and dedicated miners outrank the static upgrader.
      Until every source has its miner in place (plus the shared canFeedController road/coverage
      gate), do not fund dedicated upgraders or controller couriers.
    */
    if (!canFeedController(this.home, this.homeAudit, homeDrones)) return null;
    if (!areDedicatedMinersInPlace(this.homeAudit)) return null;

    const controllerAnchor = this.homeAudit.controller;
    if (!controllerAnchor) return null;

    //Static upgrader needs the controller-adjacent container to sit on and withdraw from.
    if (!controllerAnchor.containers.length) return null;

    //Send 80% of total energy into the controller. If we're banking then ramp up the usage.
    const upgraderEnergyPerTick = this.homeAudit.totalEnergyIncomePerTick*(this.homeAudit.storedEnergy > UPGRADER_STORAGE_MIN ? 1.2 : 0.8);

    //Couriers ferry energy from source containers / storage into the controller container.
    const roundTrip = controllerAnchor.anchor.pos.getRangeTo(this.homeAudit.center)*2; //rough range estimate
    const energyPerTickForHaul = Math.max(upgraderEnergyPerTick, 2); //at least keep a trickle flowing
    const optimalCourierParts = Math.ceil((roundTrip*energyPerTickForHaul)/50); //can carry 50 energy per carry part
    const neededCourierParts = optimalCourierParts - (controllerAnchor.couriers.counts[CARRY] || 0);
    const courier = neededCourierParts > 0 && this.findSpawnableCreep(CreepRoleName.Courier, body=>(
      body.counts[CARRY] > 0 && neededCourierParts % body.counts[CARRY]
    ), { anchor: controllerAnchor, cohort: controllerAnchor.couriers });
    if (courier) return courier;

    /*
      One dedicated static upgrader on the controller container. Prefer bodies with a single MOVE (walks
      onto the seat once) and small CARRY; pick the largest affordable WORK count that doesn't wildly
      overshoot the energy we expect to feed it.
    */
    const currentUpgraderWork = controllerAnchor.upgraders.counts[WORK] || 0;
    const optimalUpgraderWorkParts = Math.max(2, Math.ceil(upgraderEnergyPerTick)); //upgrade burns 1 energy/WORK/tick
    if (currentUpgraderWork < optimalUpgraderWorkParts){
      const upgrader = this.findSpawnableCreep(CreepRoleName.Upgrader, body=>(
        body.counts[WORK] > 0 &&
        body.counts[CARRY] > 0 &&
        body.counts[MOVE] <= 1 && //0 MOVE + courier tug, or 1 MOVE self-walk fallback
        body.counts[WORK] <= optimalUpgraderWorkParts &&
        //Prefer fewer MOVE (courier tug), then closest WORK match
        body.counts[MOVE]*100 + Math.abs(optimalUpgraderWorkParts - body.counts[WORK])
      ), { anchor: controllerAnchor, cohort: controllerAnchor.upgraders, priority: CreepPriority.Low });
      //Only spawn if it adds WORK vs what's already seated (replace small with larger over time).
      if (upgrader && upgrader.tier.body.counts[WORK] > currentUpgraderWork) return upgrader;
    }

    return null;
  }

  work(){

  }
}
