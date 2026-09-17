import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName } from "utils/constants";
import { ensureEarlyRoadPlan, getSourceSaturation, isPriorityRoadWorkComplete, placeEarlyRoadSites } from "utils/earlyEconomy";
import { diamondCoordinates, diamondRingCoordinates, findDiamondPlacement, getBestContainerLocation, getSpawnRoadPath, getStructureCostMatrix } from "utils/map";
import { BasicFlag, BasicFlagMemory } from "./_BasicFlag";

// enum HomeStatus{
//   Audit,
//   Build,
// }

export interface HomeFlagMemory extends BasicFlagMemory{
  buildStage?: number;
  buildSubStage?: number;
  buildQueue?: BuildableStructureConstant[];
}

export class HomeFlag extends BasicFlag<HomeFlagMemory> {
  cohorts = {
    scouts: new Cohort(this.name+'-scouts'),
    drones: new Cohort(this.name+'-drones'),
    builders: new Cohort(this.name+'-builders'),
  }

  get buildStage(){
    return this.memory.buildStage ?? 0;
  }

  set buildStage(buildStage:number){
    this.memory.buildStage = buildStage;
    this.memory.buildSubStage = 0;
  }

  get buildSubStage(){
    return this.memory.buildSubStage ?? 0;
  }

  set buildSubStage(buildSubStage:number){
    this.memory.buildSubStage = buildSubStage;
  }

  get buildQueue(){
    return this.memory.buildQueue || (this.memory.buildQueue = []);
  }

  // get maxExtensionCount(){
  //   switch(this.room.controller?.level){
  //     case 2:
  //       return 5;
  //     case 3:
  //       return 10;
  //     case 4:
  //       return 20;
  //     case 5:
  //       return 30;
  //     case 6:
  //       return 40;
  //     case 7:
  //       return 50;
  //     case 8:
  //       return 60;
  //     default:
  //       return 0;
  //   }
  // }

  createDiamondConstructionSites(structureType:BuildableStructureConstant){
    const diamondSize = structureType === STRUCTURE_EXTENSION ? 1 : 0;
    //Weight towards building next to the spawn when placing small diamonds for things like towers and storage
    const structureMatrix = diamondSize === 0 ? getStructureCostMatrix(this.home, 4, STRUCTURE_SPAWN) : getStructureCostMatrix(this.home, 4);
    const [x, y] = findDiamondPlacement(this.home, diamondSize, structureMatrix);
    for (const [dx, dy] of diamondCoordinates(x, y, diamondSize)){
      this.home.createConstructionSite(dx, dy, structureType);
    }
    for (const [rx, ry] of diamondRingCoordinates(x, y, diamondSize+1)){
      this.home.createConstructionSite(rx, ry, STRUCTURE_ROAD);
    }
  }

  createRampartConstructionSites(){
    this.home.find(FIND_MY_STRUCTURES, {
      filter: structure=>structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_TOWER || structure.structureType === STRUCTURE_STORAGE
    }).forEach(structure=>{
      this.home.createConstructionSite(structure.pos, STRUCTURE_RAMPART);
    });
    this.homeAudit.sources.forEach(source=>{
      source.containers.forEach(container=>{
        this.home.createConstructionSite(container.pos, STRUCTURE_RAMPART);
      });
    });
  }

  /* The early road plan is the source of truth for the road-before-upgrade gate. */
  get earlyRoadPlan(){
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    return ensureEarlyRoadPlan(this.home, spawn, this.homeAudit.sources);
  }

  /*
    Early construction runs strictly in priority order. Nothing is allowed to feed the controller until
    both road batches have their construction sites placed (see isPriorityRoadWorkComplete).
      0: roads right around the spawn so the drones don't trip over each other on the way out
      1: roads out to each source plus roads across that source's harvest seats
      2: a road from the spawn to the controller
      3: source containers, deferred so they can't hold up the roads
  */
  createConstructionSitesCL1():boolean{
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    if (!spawn) return false; //Everything here is laid out relative to the spawn.
    switch(this.buildSubStage){
      case 0:{
        this.home.createConstructionSite(spawn.pos.x-1, spawn.pos.y, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x+1, spawn.pos.y, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x, spawn.pos.y-1, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x, spawn.pos.y+1, STRUCTURE_ROAD);

        this.buildSubStage++;
      }
      break;
      case 1:{
        if (placeEarlyRoadSites(this.home, this.earlyRoadPlan.source) === 0) this.buildSubStage++;
      }
      break;
      case 2:{
        if (placeEarlyRoadSites(this.home, this.earlyRoadPlan.controller) === 0) this.buildSubStage++;
      }
      break;
      case 3:{
        this.homeAudit.sources.forEach(source=>{
          const sourceContainerPos = getBestContainerLocation(source.pos, spawn.pos);
          this.home.createConstructionSite(sourceContainerPos, STRUCTURE_CONTAINER);
        });

        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL2():boolean{
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    switch(this.buildSubStage){
      case 0:{
        //Make an outer ring around the first spawn. This will help place towers and storage later.
        this.home.createConstructionSite(spawn.pos.x-2, spawn.pos.y-1, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x-1, spawn.pos.y-2, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x+2, spawn.pos.y-1, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x+1, spawn.pos.y-2, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x-2, spawn.pos.y+1, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x-1, spawn.pos.y+2, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x+2, spawn.pos.y+1, STRUCTURE_ROAD);
        this.home.createConstructionSite(spawn.pos.x+1, spawn.pos.y+2, STRUCTURE_ROAD);

        this.buildSubStage++;
      }
      break;
      case 1:{
        //Need to wait for the initial construction sites to be built before proceeding since they will be used in the pathing calculations
        this.homeAudit.sources.forEach(source=>{
          const [ container ] = source.containers;
          const sourceRoadPath = getSpawnRoadPath(spawn, container?.pos || source.pos);
          sourceRoadPath.forEach(step=>{
            this.home.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
          });
        });
        if (this.home.controller){
          const controllerRoadPath = getSpawnRoadPath(spawn, this.home.controller.pos);
          controllerRoadPath.forEach(step=>{
            this.home.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
          });
        }

        this.buildSubStage++;
      }
      break;
      case 2:{
        if (this.home.controller){
          const controllerContainerPos = getBestContainerLocation(this.home.controller.pos, spawn.pos);
          this.home.createConstructionSite(controllerContainerPos, STRUCTURE_CONTAINER);
        }

        //Build 5 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);

        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL3():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_TOWER);

        //Build 5 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new tower
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL4():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_STORAGE);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new storage
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL5():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_TOWER);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new tower
        return true;
      }
    }
    return false;
  }

  createExtractorConstructionSites(){
    const [ mineral ] = this.home.find(FIND_MINERALS);
    if (mineral){
      const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
      this.home.createConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);

      const mineralContainerPos = getBestContainerLocation(mineral.pos, spawn.pos);
      this.home.createConstructionSite(mineralContainerPos, STRUCTURE_CONTAINER);

      const controllerRoadPath = getSpawnRoadPath(spawn, mineralContainerPos);
      controllerRoadPath.forEach(step=>{
        this.home.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      });
    }
  }

  createConstructionSitesCL6():boolean{
    this.createExtractorConstructionSites();

    //Build 10 extensions:
    this.buildQueue.push(STRUCTURE_EXTENSION);
    this.buildQueue.push(STRUCTURE_EXTENSION);

    return true;
  }

  createConstructionSitesCL7():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_TOWER);
        this.buildQueue.push(STRUCTURE_SPAWN);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new spawn
        return true;
      }
    }
    return false;
  }

  createConstructionSitesCL8():boolean{
    switch(this.buildSubStage){
      case 0:{
        this.buildQueue.push(STRUCTURE_SPAWN);

        //Build 10 extensions:
        this.buildQueue.push(STRUCTURE_EXTENSION);
        this.buildQueue.push(STRUCTURE_EXTENSION);

        this.buildSubStage++;
      }
      break;
      case 1:{
        this.createRampartConstructionSites(); //Build a rampart on the new spawn
        return true;
      }
    }
    return false;
  }

  createConstructionSites(){
    const stageResult:boolean = (()=>{
      switch(this.buildStage){
        case 0:
          const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
          //Claim flag should get the first spawn set up.
          return Boolean(spawn);
        case 1: return this.createConstructionSitesCL1();
        case 2: return this.createConstructionSitesCL2();
        case 3: return this.createConstructionSitesCL3();
        case 4: return this.createConstructionSitesCL4();
        case 5: return this.createConstructionSitesCL5();
        case 6: return this.createConstructionSitesCL6();
        case 7: return this.createConstructionSitesCL7();
        case 8: return this.createConstructionSitesCL8();
        default:
          throw 'invalid this.buildStage';
      }
    })();

    //If the callback returns true it means the stage is done and we can proceed.
    if (stageResult){
      this.buildStage++;
    }
  }

  getRequestedCreep(currentPriorityLevel:CreepPriority){
    if (currentPriorityLevel < CreepPriority.Normal) return null;
    if (this.homeAudit.creeps.length === 0){
      //Bootstrap: build whatever we can afford right now, otherwise the room can never recover.
      return this.findSpawnableCreep(CreepRoleName.Basic, true, { cohort: this.cohorts.drones });
    }

    /*
      Stage 1: general purpose harvest drones. These collect energy themselves and carry it back into
      the spawn. Keep making them until the sources are saturated (see getSourceSaturation), at which
      point another drone wouldn't raise the room's harvest rate.
    */
    const saturation = getSourceSaturation(this.homeAudit, this.cohorts.drones);
    if (!saturation.saturated){
      const neededWorkParts = saturation.work - saturation.workUsed;
      //Prefer the body whose WORK count lands closest to the throughput we're still missing.
      const drone = this.findSpawnableCreep(CreepRoleName.Basic, body=>(
        body.counts[WORK] > 0 &&
        body.counts[CARRY] > 0 && //Drones have to be able to haul the energy home themselves
        Math.abs(neededWorkParts - body.counts[WORK])
      ), { cohort: this.cohorts.drones });
      if (drone) return drone;
    }

    //Stage 2: the sources are covered, so surplus workers go into construction and then the controller.

    // const optimalScoutParts = 1;
    // const neededScoutParts = optimalScoutParts - (this.cohorts.scouts.counts[MOVE] || 0);
    // const scout = neededScoutParts > 0 && this.findSpawnableCreep(CreepRoleName.Scout, body=>0, { cohort: this.cohorts.scouts });
    // if (scout) return scout;

    const optimalBuilderParts = this.getOptimalBuilderParts(this.home!);
    const neededBuilderParts = optimalBuilderParts - (this.cohorts.builders.counts[WORK] || 0);
    const builder = neededBuilderParts > 0 && this.findSpawnableCreep(CreepRoleName.Basic, body=>(
      body.counts[WORK] > 0 &&
      neededBuilderParts % body.counts[WORK]
    ), { cohort: this.cohorts.builders });
    if (builder) return builder;

    return null;
  }

  // claimCreeps(){
  //   this.requiredBodyPartsByRole[CreepRoleName.Upgrader] = {
  //     [WORK]: 5*this.homeAudit.sources.length,
  //   };

  //   this.requiredBodyPartsByRole[CreepRoleName.Courier] = {
  //     [CARRY]: 12*this.homeAudit.sources.length,
  //   };
  // }

  work() {
    if (!this.home || !this.home.controller?.my) throw `Flag isn't in a valid room: ${this.roomName}`;

    // this.claimCreeps();

    const controllerLevel = this.home.controller?.level || 0;
    this.home.visual.text(this.buildStage > 8 ? `8` : `${controllerLevel} → ${this.buildStage}`, this.home.controller.pos.x, this.home.controller.pos.y-1, { font: 0.5 });
    if (!isPriorityRoadWorkComplete(this.home)){
      //Upgrading is gated until the priority roads are placed, so make that obvious in the room.
      this.home.visual.text(`roads first`, this.home.controller.pos.x, this.home.controller.pos.y-1.5, { font: 0.4, color: '#ff9999' });
    }

    try{
      //The building placement logic is heavy on CPU so only try to place one thing per tick.
      //Do the build queue before createConstructionSites so that things queued will be constructed on the following tick.
      const structureType = this.buildQueue.shift();
      if (structureType){
        this.createDiamondConstructionSites(structureType);
      }
    }catch(e:any){
      //TODO: What happens if createDiamondConstructionSites fails? We'll have to fix it manually :shrug:
      console.log(`[${this.roomName}] createDiamondConstructionSites error:`, e, e.stack);
    }

    try{
      if (controllerLevel >= this.buildStage && this.home.find(FIND_MY_CONSTRUCTION_SITES).length === 0 && this.buildQueue.length === 0){
        this.createConstructionSites();
      }
    }catch(e:any){
      console.log(`[${this.roomName}] createConstructionSites error:`, e, e.stack);
    }
  }
}
