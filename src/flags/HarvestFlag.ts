import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName, FlagType, USERNAME } from "utils/constants";
import { canBootstrapCourier, canSpawnStaticMiners, canSpawnNextStaticMiner, couriersRequiredForNextStaticMiner, getRoadTileState, isBalancedHaulBody, packRoadPos, RoadTileState } from "utils/earlyEconomy";
import { getBestContainerLocation } from "utils/map";
import { random } from "utils/random";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
enum HarvestStatus{
  Audit,
  Harvest,
}

//Rough round-trip distance to fall back on when a source can't be pathed to (another room, mostly).
const DEFAULT_SOURCE_PATH_COST = 50;

interface HarvestSourceData{
  // path:Record<Room['name'], string>;
  pathCost: number;
}

interface HarvestFlagMemory extends RemoteFlagMemory{
  status?: HarvestStatus;
  sourceData: {[id: string]: HarvestSourceData}; //(Id<Source>)
  totalMoveCost: number;
}

export class HarvestFlag extends RemoteFlag<HarvestFlagMemory> {
  cohorts = this.domestic ? undefined : {
    claimers: new Cohort(this.name+'-claimers'),
    builders: new Cohort(this.name+'-builders'),
    scouts: new Cohort(this.name+'-scouts'),
  };

  get status(){
    return this.memory.status ?? HarvestStatus.Audit;
  }

  set status(status:HarvestStatus){
    this.memory.status = status;
  }

  get sourceData(){
    return this.memory.sourceData || (this.memory.sourceData = {});
  }

  private _sources:CreepSourceAnchor[]|undefined;
  /*
    The sources this flag is responsible for. ClaimFlag drops one `harvest:` flag per source in a home
    room, so a domestic flag only owns the source it is standing on - otherwise every flag would ask for
    a miner for every source. Remote flags are placed by hand anywhere in the room, so they keep
    covering all of them.
  */
  get sources():CreepSourceAnchor[]{
    if (this._sources) return this._sources;
    const sources = this.officeAudit?.sources ?? [];
    const owned = this.domestic && sources.filter(source=>source.pos.isEqualTo(this.pos));
    return this._sources = (owned && owned.length ? owned : sources);
  }

  /*
    Distance from the room center out to a source, used to size the courier fleet. audit() fills this in
    for every source it measures, but getRequestedCreep can run before the first audit (and the audit
    can fail to path), so fall back to measuring it on demand rather than throwing.
  */
  getSourcePathCost(sourceAnchor:CreepSourceAnchor){
    const stored = this.sourceData[sourceAnchor.id];
    if (stored) return stored.pathCost;
    const path = PathFinder.search(this.homeAudit.center, { pos: sourceAnchor.pos, range: 1 }, {
      plainCost: 2,
      swampCost: 3,
    });
    //A room we can't path into is roughly a room away, which is close enough to size a courier with.
    const pathCost = path.incomplete ? DEFAULT_SOURCE_PATH_COST : path.cost;
    this.sourceData[sourceAnchor.id] = { pathCost };
    return pathCost;
  }

  // officeIsBeingReserved(){
  //   return !this.office?.controller?.my && this.office?.controller?.reservation && this.office?.controller?.reservation?.username !== USERNAME;
  // }

  getTotalEnergyPerTick(){
    if (!this.officeAudit) return 0;
    return this.sources.reduce((total, source)=>total+source.getOptimalEnergyPerTick(), 0);
  }

  /*
    One dedicated static miner per source. The body is the biggest zero-CARRY harvester the room can
    afford without overshooting the source's useful throughput (5 WORK == 10 energy/tick on a 3000
    energy source), and we only ask for one when that body would actually add WORK the source isn't
    covering yet. That keeps a single optimally sized miner on the container instead of a pile of tiny
    ones filling every seat, while still letting an early 2 WORK miner be replaced by a 5 WORK one once
    the extensions are up - the small one then retires on its own.
  */
  getRequestedMiner(sourceAnchor:CreepSourceAnchor){
    if (sourceAnchor.availableSeats <= 0) return null;
    const optimalWorkParts = sourceAnchor.getOptimalWorkParts();
    if (optimalWorkParts <= 0) return null; //Invaded sources aren't worth mining.
    const currentWorkParts = sourceAnchor.harvesters.counts[WORK] ?? 0;
    if (currentWorkParts >= optimalWorkParts) return null;

    const miner = this.findSpawnableCreep(CreepRoleName.Harvester, body=>(
      body.counts[CARRY] === 0 && //Static miners drop straight into the container, they never haul.
      body.counts[WORK] <= optimalWorkParts &&
      //Domestic: 0 MOVE (courier tug) or 1 MOVE (self-walk fallback). Remote still needs travel MOVE.
      (this.domestic ? body.counts[MOVE] <= 1 : body.counts[MOVE] >= 2) &&
      //Prefer more WORK, then fewer MOVE (tug over self-walk) for domestic.
      (optimalWorkParts - body.counts[WORK]) * 10 + (this.domestic ? body.counts[MOVE] : 0)
    ), { anchor: sourceAnchor, cohort: sourceAnchor.harvesters, priority: CreepPriority.High });

    //Only worth a seat if it brings more WORK than whatever is already sitting on this source.
    if (miner && miner.tier.body.counts[WORK] > currentWorkParts) return miner;
    return null;
  }

  /*
    The bootstrap courier. Deliberately unsized: the point isn't haul throughput, it's that the room
    has *a* courier at all - that's what unlocks the static miner gate and provides the seat tug.

    Sizing it was the idle-room bug. getRequestedCourier rounds the haul down to
    ceil(pathCost*2*energyPerTick/50) CARRY parts, and a source sat next to the spawn has a path cost
    of 0-1, so that lands on 0 or 1 parts. The tier filter then asks for a body with at most that many
    CARRY parts, the smallest Courier tier has 3, every tier is rejected and no courier is ever
    requested - so no miner, no harvest coverage, no upgrader, and a spawn that sits full forever.

    So: skip the sizing entirely and ask for the cheapest real courier body. Once a miner is actually
    filling the container, getRequestedCourier's normal sizing grows the fleet from there.
  */
  getBootstrapCourier(sourceAnchor:CreepSourceAnchor, onlyIfUncovered = true){
    //Spread the bootstrap couriers over the sources first; the room-wide count is the real cap.
    if (onlyIfUncovered && (sourceAnchor.couriers.counts[CARRY] ?? 0) > 0) return null;
    const courierType = this.domestic ? CreepRoleName.Courier : CreepRoleName.RemoteCourier;
    return this.findSpawnableCreep(courierType, body=>(
      body.counts[CARRY] > 0 &&
      body.counts[MOVE] > 0 && //It has to be able to walk to the container on its own.
      body.counts[CARRY] //Smallest body wins - this is a bootstrap, not a haul plan.
    ), { anchor: sourceAnchor, cohort: sourceAnchor.couriers, priority: CreepPriority.High });
  }

  /*
    Couriers haul what the static miner drops into the source container, and also tug 0-MOVE
    miners onto their seats. Sized off the round trip and the miner's actual output; see
    getBootstrapCourier for the first one.
  */
  getRequestedCourier(sourceAnchor:CreepSourceAnchor){
    const minerWorkParts = sourceAnchor.harvesters.counts[WORK] ?? 0;
    if (minerWorkParts === 0) return null; //Nothing is filling the container yet.

    // 3000 energy nodes can optimially mine at 10 energy per tick, so 1500 nodes are 5 per tick.
    // A part-grown miner produces less than that (2 energy per WORK part), so size the haul to it.
    const energyPerTick = Math.min(sourceAnchor.getOptimalEnergyPerTick(), minerWorkParts*2);
    if (energyPerTick <= 0) return null;
    const moveCost = this.getSourcePathCost(sourceAnchor)*2; //ticks (both directions)
    // const moveCost = this.memory.totalMoveCost; //This is the sum of both sources. This makes the math a little simpler which may help keep creep sizes whole/large
    const optimalCourierParts = Math.ceil((moveCost*energyPerTick)/50); //can carry 50 energy per carry part
    const neededCourierParts = optimalCourierParts - (sourceAnchor.couriers.counts[CARRY] ?? 0);
    if (neededCourierParts <= 0) return null;

    const courierType = this.domestic ? CreepRoleName.Courier : CreepRoleName.RemoteCourier;
    return this.findSpawnableCreep(courierType, body=>(
      neededCourierParts >= body.counts[CARRY] &&
      neededCourierParts % body.counts[CARRY]
    ), { anchor: sourceAnchor, cohort: sourceAnchor.couriers, priority: CreepPriority.Normal });
  }

  /*
    Courier tier upgrade. Extensions raise energyCapacityAvailable long before the couriers spawned at
    300 expire, and everything that comes next leans on the haul fleet: a 0-MOVE 5 WORK miner is dead
    weight until a courier can tug it onto its seat, and a fat upgrader just starves behind an
    undersized fleet. So once a bigger balanced courier body is affordable, that replacement outranks
    the miner/upgrader upgrades below it (see needsCourierTierUpgrade).
  */
  getUpgradedCourier(){
    if (!this.courierFleetNeedsUpgrade()) return null;
    const tierCost = this.getMaxAffordableBodyCost(CreepRoleName.Courier, isBalancedHaulBody);
    //Put the replacement on the source whose haul cover is thinnest.
    const sourceAnchor = this.sources.filter(source=>source.containers.length).reduce((thinnest, source)=>{
      if (!thinnest) return source;
      return (source.couriers.counts[CARRY] ?? 0) < (thinnest.couriers.counts[CARRY] ?? 0) ? source : thinnest;
    }, undefined as CreepSourceAnchor|undefined);
    if (!sourceAnchor) return null;
    return this.findSpawnableCreep(CreepRoleName.Courier, body=>(
      body.cost === tierCost &&
      isBalancedHaulBody(body) &&
      0 //Exactly the tier we measured - nothing to rank.
    ), { anchor: sourceAnchor, cohort: sourceAnchor.couriers, priority: CreepPriority.High });
  }

  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.Normal) return null;

    if (this.officeIsHostile) return null;

    if (!this.officeAudit){
      if (this.cohorts){
        const optimalScoutParts = 1;
        const neededScoutParts = optimalScoutParts - (this.cohorts.scouts.counts[MOVE] || 0);
        const scout = neededScoutParts > 0 && this.findSpawnableCreep(CreepRoleName.Scout, undefined, { cohort: this.cohorts.scouts });
        if (scout) return scout;
      }
      return null;
    }

    //Mining too much and not spending it gets things clogged up...
    if (this.domestic || this.home.storage && this.home.storage.store.getFreeCapacity() > 5000){
      const audit = this.officeAudit;

      /*
        Domestic static-miner gates (see canBootstrapCourier / canSpawnStaticMiners /
        canSpawnNextStaticMiner):
          all source containers + ≥1 Basic per source. Roads are NOT part of this - see
          canBootstrapCourier for why they used to be and why that soft-locked the room.
        Until that passes, ask for nothing here — HomeFlag drones keep harvesting.
        Then bootstrap courier #1 before miner #1; before miner #2+ bootstrap courier #2
        (couriersRequiredForNextStaticMiner) so haul/tug capacity keeps up.
      */
      if (this.domestic){
        if (!canBootstrapCourier(audit)) return null;

        //Bootstrap enough couriers for the *next* static miner (1 for the first, 2 for the second+).
        const couriersNeeded = couriersRequiredForNextStaticMiner(audit);
        if ((audit.creepCountsByRole[CreepRoleName.Courier] ?? 0) < couriersNeeded){
          for (const onlyIfUncovered of [true, false]){
            for (const sourceAnchor of this.sources){
              if (!sourceAnchor.containers.length) continue;
              const bootstrapCourier = this.getBootstrapCourier(sourceAnchor, onlyIfUncovered);
              if (bootstrapCourier) return bootstrapCourier;
            }
          }
          return null;
        }

        if (!canSpawnStaticMiners(audit)) return null;

        //Tug + haul capacity scales before the specialists get heavier - see getUpgradedCourier.
        const upgradedCourier = this.getUpgradedCourier();
        if (upgradedCourier) return upgradedCourier;
      }

      //Take care of one source at a time. This way we can get it into production asap, funding other things.
      for (const sourceAnchor of this.sources){
        /*
          Staging gate: a static miner has zero CARRY, so without a container to drop into everything it
          mines just rots on the ground. Before the container is built the HomeFlag drones (Basic creeps
          that carry their own energy home) stay the harvest plan, and this flag asks for nothing.
        */
        if (!sourceAnchor.containers.length) continue;

        //Miners outrank further courier growth for this source — but only when courier count covers
        //the next miner (1st needs ≥1 courier, 2nd+ needs ≥2). Domestic only; remotes keep old pace.
        if (!this.domestic || canSpawnNextStaticMiner(audit)){
          const miner = this.getRequestedMiner(sourceAnchor);
          if (miner) return miner;
        }

        const courier = this.getRequestedCourier(sourceAnchor);
        if (courier) return courier;
      }
    }

    if (this.cohorts){
      if (this.cohorts.claimers?.list.length === 0){ //Only make the largest single Claimer creep
        const optimalClaimParts = 2;
        const neededClaimParts = optimalClaimParts - (this.cohorts.claimers.counts[CLAIM] || 0);
        const claimer = neededClaimParts > 0 && this.findSpawnableCreep(CreepRoleName.Claimer, body=>(
          // neededClaimParts >= body.counts[CLAIM] &&
          // neededClaimParts % body.counts[CLAIM]
          neededClaimParts - body.counts[CLAIM]
        ), { cohort: this.cohorts.claimers });
        if (claimer) return claimer;
      }

      const optimalBuilderParts = this.getOptimalBuilderParts(this.office!)//, this.getTotalEnergyPerTick());
      const neededBuilderParts = optimalBuilderParts - (this.cohorts.builders.counts[WORK] || 0);
      const remoteBuilder = neededBuilderParts > 0 && this.findSpawnableCreep(CreepRoleName.RemoteBuilder, body=>(
        body.counts[WORK] > 0 &&
        neededBuilderParts % body.counts[WORK]
      ), { cohort: this.cohorts.builders });
      if (remoteBuilder) return remoteBuilder;
    }

    return null;
  }

  audit(){
    if (!this.officeAudit) return;

    const exit = this.office?.findExitTo(this.home) as ExitConstant;
    const getExitPos = (source:CreepSourceAnchor)=>source.anchor.pos.findClosestByRange(exit)!;
    const getExitRange = (source:CreepSourceAnchor)=>getExitPos(source).getRangeTo(source);
    //Sort the sources by range to the exit that connects rooms. This way we build the road to the closest one first, then leverage that road when connecting to the second source.
    const sources = this.domestic ? this.sources : this.sources.slice().sort((a, b)=>getExitRange(a) - getExitRange(b));

    /*
      HomeFlag owns the early layout of a home room (spawn roads, then source roads/seats, then the
      controller road, then the source containers in CL1 substage 3). A domestic audit therefore only
      measures the paths it needs for the courier math instead of racing HomeFlag with a second set of
      container and road sites.
    */
    const sourceContainers = sources.map(source=>{
      const [ container ] = source.containers;
      return container?.pos || getBestContainerLocation(source.pos, this.domestic ? this.homeAudit.center : getExitPos(source));
    });
    if (!this.domestic){
      sourceContainers.forEach(containerPos=>{
        this.office!.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
      });
    }

    const paths:PathFinderPath[] = [];
    const getPathToPos = (pos:RoomPosition)=>{
      return PathFinder.search(this.homeAudit.center, {
        pos,
        range: 1,
      }, {
        //Prefer roads which use weight 1
        plainCost: 2,
        swampCost: 3, //Swamps cost a bit more since we'll have to maintain roads over them
        roomCallback: function(roomName) {
          const room = Game.rooms[roomName];
          if (!room) return false; //PathFinder supports searches which span multiple rooms
          const costs = new PathFinder.CostMatrix;

          sourceContainers.forEach(containerPos=>{
            costs.set(containerPos.x, containerPos.y, 0xff);
          });

          room.find(FIND_STRUCTURES).forEach(function(structure) {
            if (structure.structureType === STRUCTURE_ROAD) {
              // Favor roads over plain tiles
              costs.set(structure.pos.x, structure.pos.y, 1);
            } else if (structure.structureType !== STRUCTURE_RAMPART || !structure.my) {
              costs.set(structure.pos.x, structure.pos.y, 0xff);
            }
          });

          paths.forEach(path=>{
            path.path.forEach(step=>{
              costs.set(step.x, step.y, 1); //Prefer to reuse previous paths
            });
          });

          //This doesn't exactly work since the new construction sites don't exist until the next tick.
          room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
            if (site.structureType === STRUCTURE_ROAD) {
              costs.set(site.pos.x, site.pos.y, 1);
            } else if (site.structureType !== STRUCTURE_RAMPART) {
              costs.set(site.pos.x, site.pos.y, 0xff);
            }
          });
          return costs;
        },
      });
    };

    //Make construction zones to each source. This will make the second pass cheaper.
    sourceContainers.forEach((containerPos, p)=>{
      const path:PathFinderPath = getPathToPos(containerPos);
      if (!path.path.length){
        //Domestic sources can sit right next to the center, which just means there's no road to build.
        if (this.domestic) return;
        throw `Unable to find a path to source:${sources[p].id}`;
      }
      paths.push(path); //This will allow future paths to reuse these cheaper paths
      if (this.domestic) return; //HomeFlag places the domestic roads.
      path.path.forEach(step=>{
        const room = Game.rooms[step.roomName];
        //Routes reuse existing lanes (the cost matrix makes roads cheap), so most steps are already
        //paved or already queued - placing and painting those again is just noise on top of a road.
        if (getRoadTileState(room, packRoadPos(step.x, step.y)) !== RoadTileState.Missing) return;
        room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
        room.visual.circle(step.x, step.y);
      });
    });

    let totalMoveCost = 0;
    sourceContainers.forEach((containerPos, p)=>{
      const source = sources[p];
      //We have to run it again otherwise the counts come out too high since they weren't calculated with the lower path weights
      const path:PathFinderPath = getPathToPos(containerPos);
      this.sourceData[source.id] = { pathCost: path.cost };
      totalMoveCost += path.cost;
    });
    this.memory.totalMoveCost = totalMoveCost;
    this.status = HarvestStatus.Harvest;
  }

  // claimCreeps(){
  //   if (this.officeAudit){
  //     const sourceCount = this.officeAudit.sources.length;

  //     // this.totalNeededParts[CLAIM] = sourceCount > 1 ? 1 : 0; //don't bother claiming rooms with only 1 source...
  //     if (sourceCount > 1){
  //       this.requiredBodyPartsByRole[CreepRoleName.Claimer] = {
  //         [CLAIM]: 1,
  //       }
  //     }

  //     // 3000 energy nodes can optimially mine at 10 energy per tick, so 1500 nodes are 5 per tick
  //     const energyPerTick = sourceCount*(this.officeAudit.controller?.anchor.my?10:5);
  //     const roundTrip = this.memory.totalMoveCost*2; //ticks
  //     // this.totalNeededParts[CARRY] = (roundTrip*energyPerTick)/50;
  //     this.requiredBodyPartsByRole[CreepRoleName.RemoteCourier] = {
  //       [CARRY]: (roundTrip*energyPerTick)/50,
  //     }

  //     const constructionProgress = this.officeAudit.constructionSites.reduce((out, structure)=>out + (structure.progressTotal-structure.progress), 0);
  //     const repairableHits = this.office!.find(FIND_STRUCTURES, {
  //       filter: structure=>{
  //         return structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER
  //       }
  //     }).reduce((out, structure)=>out + (structure.hitsMax-structure.hits), 0);

  //     /* One WORK use 1 energy/tick:
  //       - build at 5 points/tick
  //       - repair at 100 hits/tick
  //     */
  //     // 1500 ticks is how long a creep will live. It's ok to be a little wasteful if it gets the job done faster.

  //     //Recall that building on swamp costs a lot more so the cost isn't just a function of distance.
  //     const buildWork = constructionProgress && (constructionProgress/5)/500; //500 indicates that we will be up to 3 (1500/500=3) times inefficient when initially building
  //     const repairWork = repairableHits && (repairableHits/100)/1500; //Maximally efficient for repairing roads since it's not urgent.
  //     // this.totalNeededParts[WORK] = Math.ceil(Math.min(buildWork + repairWork, energyPerTick));
  //     this.requiredBodyPartsByRole[CreepRoleName.RemoteHarvester] = {
  //       [WORK]: Math.ceil(Math.min(buildWork + repairWork, energyPerTick)),
  //     };

  //     /*
  //     TODO: Instead of specifying how many of a particular creep to spawn like this I should specify the capacity of the room somehow.
  //     The problem is that this doesn't account for creep tiers, so it does the right job but doesn't bake in a sense of proper scale.

  //     Maybe just specify custom creep parts/tier in here and feed it into a creep role to control the logic.
  //     */
  //     this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = 0;//sourceCount;
  //     this.maxFollowersByRole[CreepRoleName.RemoteCourier] = 0;//sourceCount*2;
  //   }else{
  //     this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = 1;
  //     this.maxFollowersByRole[CreepRoleName.RemoteCourier] = 2;
  //   }
  // }

  work() {
    if (this.status === HarvestStatus.Audit) this.audit();
    for (const sourceAnchor of this.sources){
      this.flag.room?.visual.text(`${this.getSourcePathCost(sourceAnchor)}`, sourceAnchor.pos.x, sourceAnchor.pos.y-1, { font: 0.5 });
    }

    if (this.officeIsHostile){
      if (!this.homeAudit?.flags.defend.length){
        this.office!.createFlag(this.office!.controller!.pos, `defend:${this.homeRoomName}:${random()}`);
      }
    }
  }
}
