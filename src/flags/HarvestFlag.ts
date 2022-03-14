import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName, FlagType, USERNAME } from "utils/constants";
import { random } from "utils/random";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
enum HarvestStatus{
  Audit,
  Harvest,
}

interface HarvestSourceData{
  // path:Record<Room['name'], string>;
  pathCost: number;
}

interface HarvestFlagMemory extends RemoteFlagMemory{
  status?: HarvestStatus;
  sourceData:Record<string, HarvestSourceData>; //Source['id']
  totalMoveCost: number;
}

export class HarvestFlag extends RemoteFlag<HarvestFlagMemory> {
  claimers?:Cohort = this.domestic ? undefined : new Cohort(this.name+'-claimers');
  scouts?:Cohort = this.domestic ? undefined : new Cohort(this.name+'-scouts');

  get status(){
    return this.memory.status ?? HarvestStatus.Audit;
  }

  set status(status:HarvestStatus){
    this.memory.status = status;
  }

  get sourceData(){
    return this.memory.sourceData || (this.memory.sourceData = {});
  }

  // officeIsBeingReserved(){
  //   return !this.office?.controller?.my && this.office?.controller?.reservation && this.office?.controller?.reservation?.username !== USERNAME;
  // }

  getTotalEnergyPerTick(){
    if (!this.officeAudit) return 0;
    return this.officeAudit!.sources.reduce((total, source)=>total+source.getOptimalEnergyPerTick(), 0);
  }

  getRequestedCreep(currentPriorityLevel:CreepPriority){
    console.log(`test`);
    if (currentPriorityLevel < CreepPriority.Normal) return null;
    // if (!this.officeAudit){
    //   if (!this.domestic){
    //     const optimalScoutParts = 1;
    //     const neededScoutParts = optimalScoutParts - (this.scouts!.counts[MOVE] || 0);
    //     const scout = neededScoutParts > 0 && this.findSpawnableCreep(CreepRoleName.Scout, undefined, { cohort: this.scouts });
    //     if (scout) return scout;
    //   }
    //   return null;
    // }

    if (this.officeIsHostile){
      console.log(`this.officeAudit.flags.defend.length`, this.officeAudit?.flags.defend.length);
      if (!this.officeAudit?.flags.defend.length){
        //This is spawning infinite flags! Whoops...

        this.office!.createFlag(this.office!.controller!.pos, `defend:${this.homeRoomName}:${random()}`);
      }
      return null;
    }

    if (!this.officeAudit) return null;

    //Take care of one source at a time. This way we can get it into production asap, funding other things.
    for (const sourceAnchor of this.officeAudit.sources){
      // console.log(`sourceAnchor.harvesters.counts`, JSON.stringify(sourceAnchor.harvesters.counts));
      const optimalHarvesterParts = sourceAnchor.getOptimalWorkParts();
      const neededHarvesterParts = optimalHarvesterParts - (sourceAnchor.harvesters.counts[WORK] || 0);
      // this.flag.room?.visual.text(`Harvester: ${optimalHarvesterParts} - ${neededHarvesterParts}`, this.flag.pos.x, this.flag.pos.y+2);

      const harvester = neededHarvesterParts > 0 && sourceAnchor.availableSeats > 0 && this.findSpawnableCreep(CreepRoleName.Harvester, body=>(
        body.counts[WORK] > 0 &&
        (this.domestic ? body.counts[MOVE] === 1 : body.counts[MOVE] >= 2) &&
        neededHarvesterParts / body.counts[WORK] <= sourceAnchor.totalSeats &&
        neededHarvesterParts % body.counts[WORK]
      ), { anchor: sourceAnchor, cohort: sourceAnchor.harvesters });
      if (harvester) return harvester;

      // 3000 energy nodes can optimially mine at 10 energy per tick, so 1500 nodes are 5 per tick
      const energyPerTick = sourceAnchor.getOptimalEnergyPerTick();
      const roundTrip = this.memory.totalMoveCost*2; //ticks (both directions)
      const optimalCourierParts = Math.ceil((roundTrip*energyPerTick)/50); //can carry 50 energy per carry part
      const neededCourierParts = optimalCourierParts - (sourceAnchor.couriers.counts[CARRY] || 0);
      // this.flag.room?.visual.text(`Courier: ${optimalCourierParts} - ${neededCourierParts}`, this.flag.pos.x, this.flag.pos.y+3);

      const courierType = this.domestic ? CreepRoleName.Courier : CreepRoleName.RemoteCourier;
      const courier = neededCourierParts > 0 && this.findSpawnableCreep(courierType, body=>(
        body.counts[CARRY] > 0 && neededCourierParts % body.counts[CARRY]
      ), { anchor: sourceAnchor, cohort: sourceAnchor.couriers });
      if (courier) return courier;
    }

    if (!this.domestic){
      // console.log(`claimer`);
    }

    // if (sourceCount > 1){
    //   this.requiredBodyPartsByRole[CreepRoleName.Claimer] = {
    //     [CLAIM]: 1,
    //   }
    // }


    // const constructionProgress = this.officeAudit.constructionSites.reduce((out, structure)=>out + (structure.progressTotal-structure.progress), 0);
    // const repairableHits = this.office!.find(FIND_STRUCTURES, {
    //   filter: structure=>{
    //     return structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER
    //   }
    // }).reduce((out, structure)=>out + (structure.hitsMax-structure.hits), 0);

    // /* One WORK use 1 energy/tick:
    //   - build at 5 points/tick
    //   - repair at 100 hits/tick
    // */
    // // 1500 ticks is how long a creep will live. It's ok to be a little wasteful if it gets the job done faster.

    // //Recall that building on swamp costs a lot more so the cost isn't just a function of distance.
    // const buildWork = constructionProgress && (constructionProgress/5)/500; //500 indicates that we will be up to 3 (1500/500=3) times inefficient when initially building
    // const repairWork = repairableHits && (repairableHits/100)/1500; //Maximally efficient for repairing roads since it's not urgent.
    // // this.totalNeededParts[WORK] = Math.ceil(Math.min(buildWork + repairWork, energyPerTick));
    // this.requiredBodyPartsByRole[CreepRoleName.RemoteHarvester] = {
    //   [WORK]: Math.ceil(Math.min(buildWork + repairWork, energyPerTick)),
    // };

    return null;
  }

  audit(){
    if (this.status !== HarvestStatus.Audit || !this.officeAudit) return;

    const exit = this.office?.findExitTo(this.home) as ExitConstant;
    const getExitRange = (source:CreepSourceAnchor)=>source.anchor.pos.findClosestByRange(exit)!.getRangeTo(source);
    //Sort the sources by range to the exit that connects rooms. This way we build the road to the closest one first, then leverage that road when connecting to the second source.
    const sources = this.office !== this.home ? this.officeAudit.sources.sort((a, b)=>getExitRange(a) - getExitRange(b)) : this.officeAudit.sources;

    const paths:PathFinderPath[] = [];
    const getPathToSource = (source:CreepSourceAnchor)=>{
      return PathFinder.search(this.homeAudit.center, {
        pos: source.pos,
        range: 1,
      }, {
        //Prefer roads which use weight 1
        plainCost: 2,
        swampCost: 2,
        roomCallback: function(roomName) {
          const room = Game.rooms[roomName];
          if (!room) return false; //PathFinder supports searches which span multiple rooms
          const costs = new PathFinder.CostMatrix;

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

    let totalMoveCost = 0;
    sources.forEach(source=>{
      // const sourceFlagName = FlagType.Harvest+':'+this.office!.name+':'+source.id;
      // const sourceFlag = Game.flags[sourceFlagName] || this.office!.createFlag(source.pos, sourceFlagName);
      const path:PathFinderPath = getPathToSource(source);
      paths.push(path); //This will allow the second source to use the path drawn for the first source.
      // Room.serializePath(path);
      path.path.forEach(step=>{
        const room = Game.rooms[step.roomName];
        room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
        room.visual.circle(step.x, step.y);
      });
      // source.stepCount = path.ops;
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
  }

  remove(){
    this.claimers?.destroy();
    this.scouts?.destroy();
    super.remove();
  }
}
