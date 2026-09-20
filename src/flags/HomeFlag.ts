import { Cohort } from "utils/Cohort";
import { CreepPriority, CreepRoleName } from "utils/constants";
import { areSourcesStaticallyMined, cleanupRedundantRoadSites, drawExitRoadPlan, ensureEarlyRoadPlan, ensureExitRoadPlan, getRoadTileState, getSourceSaturation, isPriorityRoadWorkComplete, packRoadPos, placeEarlyRoadSites, promoteNearbyExitRoadSites, RoadTileState } from "utils/earlyEconomy";
import { syncExitRoadFlags } from "utils/exitRoadFlags";
import { syncExtensionPodFlags } from "utils/extensionPodFlags";
import { drawExtensionPodPlan, ensureExtensionPodPlan, getNextExtensionPod, placeExtensionPodSites, refreshExtensionPodPlan } from "utils/extensionPods";
import { placeNearSpawnStorage } from "utils/nearSpawnStorage";
import { advanceSpawnCirculation, drawSpawnCirculationPlan, ensureSpawnCirculationPlan, isCirculationPhasePlaced } from "utils/spawnCirculation";
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
  buildQueueRetries?: number; //Failed placements for the entry at the head of the queue.
  podFallbackLogged?: boolean; //Sticky: we already reported that the pod plan ran out and we're back on findDiamondPlacement.
}

//How many ticks a queued structure is retried before it's dropped and the stages are allowed to move on.
const MAX_BUILD_QUEUE_RETRIES = 3;

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
    //Ring roads before the interior structure sites so Basics (roads-first in startBuilding) pave the
    //ring instead of racing the extensions/tower/etc. on the same tick the diamond is queued.
    for (const [rx, ry] of diamondRingCoordinates(x, y, diamondSize+1)){
      //Rings overlap with the lattice lanes and with each other, so most of a ring is usually paved already.
      if (getRoadTileState(this.home, packRoadPos(rx, ry)) !== RoadTileState.Missing) continue;
      this.home.createConstructionSite(rx, ry, STRUCTURE_ROAD);
    }
    for (const [dx, dy] of diamondCoordinates(x, y, diamondSize)){
      this.home.createConstructionSite(dx, dy, structureType);
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
    //Same treatment as harvest containers: protect the seated upgrader's box.
    this.homeAudit.controller?.containers.forEach(container=>{
      this.home.createConstructionSite(container.pos, STRUCTURE_RAMPART);
    });
  }

  /* The early road plan is the source of truth for the road-before-upgrade gate. */
  get earlyRoadPlan(){
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    return ensureEarlyRoadPlan(this.home, spawn, this.homeAudit.sources);
  }

  /* Exit roads are planned into memory only - no construction sites, and no part of the road gate. */
  get exitRoadPlan(){
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    return ensureExitRoadPlan(this.home, spawn, this.earlyRoadPlan);
  }

  /*
    The tessellated extension pods. Sticky like the exit roads: planned once, then only read. The plan
    is what STRUCTURE_EXTENSION queue entries are built from (see placeNextExtensionPod), so it has to
    exist before the first CL3 diamond is popped.
  */
  get extensionPodPlan(){
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    //Order matters, and the plan is sticky, so it only gets one shot at this: the circulation lanes are
    //the pod lattice's seed *and* the tiles pods must keep their extensions off. Ensure them first or a
    //room planned on its very first tick lays pods that don't know the lanes exist.
    ensureSpawnCirculationPlan(this.home, spawn);
    this.exitRoadPlan;
    return ensureExtensionPodPlan(this.home, spawn);
  }

  /*
    Builds the next unbuilt pod of the plan instead of re-deriving a placement from the current
    structures. Returns false when there is no plan or every pod is already built, which is the caller's
    signal to fall back to findDiamondPlacement.

    Throws when the pod couldn't be fully placed. That is deliberate: the caller's retry/backoff already
    knows how to put the queue entry back, and the pod stays unbuilt so the retry targets the same pod.
    A tile that is blocked for good reads as Satisfied rather than Missing (see getPodExtensionState), so
    a permanently blocked tile can't spin here forever - the pod goes built with fewer than 5 extensions
    and the plan moves on.
  */
  placeNextExtensionPod():boolean{
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    if (!spawn) return false;
    const plan = refreshExtensionPodPlan(this.home, this.extensionPodPlan);
    const pod = getNextExtensionPod(plan);
    if (!pod){
      if (!this.memory.podFallbackLogged){
        this.memory.podFallbackLogged = true;
        console.log(`[${this.roomName}] extension pod plan exhausted (${plan?.pods.length ?? 0} pods), falling back to findDiamondPlacement`);
      }
      return false;
    }
    const remaining = placeExtensionPodSites(this.home, pod);
    if (remaining > 0) throw `extension pod ${pod.id} at (${pod.x},${pod.y}) still needs ${remaining} extension sites`;
    pod.built = true;
    return true;
  }

  /*
    Storage goes in the core carve-out next to the spawn rather than wherever the structure matrix
    happens to point (see utils/nearSpawnStorage). Returns false when every near-spawn tile is taken,
    which is the caller's signal to fall back to findDiamondPlacement - a storage somewhere is still
    worth far more than no storage at all.
  */
  placeStorageNearSpawn():boolean{
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    if (!spawn) return false;
    return placeNearSpawnStorage(this.home, spawn);
  }

  /*
    Early construction runs strictly in priority order. Nothing is allowed to feed the controller until
    both road batches have their construction sites placed (see isPriorityRoadWorkComplete).
      0: the spawn circulation X - the four diagonals touching the spawn (see utils/spawnCirculation)
      1: roads out to each source plus roads across that source's harvest seats
      2: a road from the spawn to the controller
      3: the near-spawn swamp tiles the road paths didn't already cover (swamp walks 5x slower)
      4: plan the exit roads (memory only, nothing is built)
      5: source containers, deferred so they can't hold up the roads
  */
  createConstructionSitesCL1():boolean{
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    if (!spawn) return false; //Everything here is laid out relative to the spawn.
    switch(this.buildSubStage){
      case 0:{
        /*
          The X, not an orthogonal cross. (spawn.x±1, spawn.y) and (spawn.x, spawn.y±1) are the arm
          slots of the spawn's own extension pod, so paving them fights the diamond lattice every
          later pod is placed on. advanceSpawnCirculation (HomeFlag.work) does the placing; this only
          waits for it.
        */
        if (isCirculationPhasePlaced(this.home, ensureSpawnCirculationPlan(this.home, spawn).phase1)) this.buildSubStage++;
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
        //Near-spawn swamp. Sized/capped in earlyEconomy - swamp roads cost 5x a plain road to build.
        if (placeEarlyRoadSites(this.home, this.earlyRoadPlan.swamp ?? []) === 0) this.buildSubStage++;
      }
      break;
      case 4:{
        //Exit roads: one route per real exit, closest first, planned into memory. Nothing is built here.
        const exitPlan = this.exitRoadPlan;
        console.log(`[${this.roomName}] planned ${exitPlan.routes.length} exit road routes (${exitPlan.plannedTiles.length} tiles)`);
        this.buildSubStage++;
      }
      break;
      case 5:{
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
        /*
          Circulation phase 2: the spawn's own Manhattan-2 road ring plus the rings of the four
          edge-neighbour lattice centres, so traffic can go around the base rather than down one lane.
          The old (±2,±1)/(±1,±2) ring this replaces sat off-lattice and boxed the pods out.
          advanceSpawnCirculation places these; wait until every tile has a site or a road.
        */
        if (isCirculationPhasePlaced(this.home, ensureSpawnCirculationPlan(this.home, spawn).phase2)) this.buildSubStage++;
      }
      break;
      case 1:{
        //Need to wait for the initial construction sites to be built before proceeding since they will be used in the pathing calculations
        this.homeAudit.sources.forEach(source=>{
          const [ container ] = source.containers;
          const sourceRoadPath = getSpawnRoadPath(spawn, container?.pos || source.pos);
          sourceRoadPath.forEach(step=>{
            //The path prefers tiles that are already roads, so most steps need nothing placed on them.
            if (getRoadTileState(this.home, packRoadPos(step.x, step.y)) !== RoadTileState.Missing) return;
            this.home.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
          });
        });
        if (this.home.controller){
          const controllerRoadPath = getSpawnRoadPath(spawn, this.home.controller.pos);
          controllerRoadPath.forEach(step=>{
            if (getRoadTileState(this.home, packRoadPos(step.x, step.y)) !== RoadTileState.Missing) return;
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

        /*
          No extension diamond queued here: the first four extensions are the spawn circulation
          pockets, placed straight onto the lattice by advanceSpawnCirculation once the phase 2 roads
          are actually built. CL3's queued diamond still adds 5 more, for 9 of the 10 RCL3 allows.
        */

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
        /*
          Storage first in the queue so the site exists a tick or two after RCL4 and couriers can start
          filling it the moment it's finished. Queue order is not build order: Basics rank roads first,
          then everything else, and storage last (see BasicCreep.startBuilding), so roads and extensions
          still go up before the 30k buffer.
        */
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
        if (getRoadTileState(this.home, packRoadPos(step.x, step.y)) !== RoadTileState.Missing) return;
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
      //Nothing outranks this, otherwise a pricier request (a static miner for instance) could sit there
      //waiting on energy that no creep is left alive to deliver.
      return this.findSpawnableCreep(CreepRoleName.Basic, true, { cohort: this.cohorts.drones, priority: CreepPriority.Now });
    }

    /*
      Stage 1: general purpose harvest drones. These collect energy themselves and carry it back into
      the spawn. Keep making them until the sources are saturated (see getSourceSaturation), at which
      point another drone wouldn't raise the room's harvest rate.

      Drones are only the harvest plan until the source containers come online. Once every source has a
      container with a dedicated static miner sat on it, the harvest flags own the harvest (miner +
      couriers) and the drone pool stops growing - surplus workers go into construction below instead.
    */
    const saturation = getSourceSaturation(this.homeAudit, this.cohorts.drones);
    if (!saturation.saturated && !areSourcesStaticallyMined(this.homeAudit)){
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
    //Ensure exit roads are planned (including rooms that already passed CL1 stage 4) then draw them.
    const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
    if (spawn) this.exitRoadPlan;
    drawExitRoadPlan(this.home); //Planned exit roads, see earlyEconomy.
    syncExitRoadFlags(this.home); //Durable map markers for the same plan, see exitRoadFlags. Self throttled.
    //Same shape for the extension pods: plan once, draw every tick, durable flags on a throttle.
    if (spawn) this.extensionPodPlan;
    drawExtensionPodPlan(this.home);
    syncExtensionPodFlags(this.home);

    if (spawn){
      /*
        Spawn circulation staging runs every tick, outside the build stages. Rooms that were planned
        before it existed are already past CL1/CL2 and would otherwise never get the lattice roads or
        their four pocket extensions.
      */
      advanceSpawnCirculation(this.home, spawn);
      drawSpawnCirculationPlan(this.home);

      /*
        Repair pass for the priority roads. The CL1 substages only place these once; if a planned tile
        ever goes back to Missing (a site removed, a road destroyed) nothing would re-place it and the
        road gate would stay false forever. Only runs while the gate is actually failing.
      */
      if (!isPriorityRoadWorkComplete(this.home)){
        const plan = this.earlyRoadPlan;
        if (placeEarlyRoadSites(this.home, plan.source) === 0) placeEarlyRoadSites(this.home, plan.controller);
      }

      /*
        Promote exit road segments near the spawn and existing roads so the exit routes are gradually
        paved outward. Also place outstanding pod ring roads so the lattice roads go down even before
        the extensions are queued. Both are throttled through the same MAX_EARLY_ROAD_SITES cap.
      */
      promoteNearbyExitRoadSites(this.home, spawn);
      const podPlan = this.home.memory.extensionPods;
      if (podPlan && podPlan.roadTiles.length > 0){
        placeEarlyRoadSites(this.home, podPlan.roadTiles);
      }

      /*
        Sweep road sites that ended up on a tile that already has a road. Every placer above skips those
        tiles, so this only ever catches the odd one out (a site placed the tick a road completed, a
        road rebuilt under a site), but such a site can never be built and would hold a site slot forever.
        Self-throttled to ROAD_SITE_CLEANUP_INTERVAL.
      */
      cleanupRedundantRoadSites(this.home);
    }

    //The building placement logic is heavy on CPU so only try to place one thing per tick.
    //Do the build queue before createConstructionSites so that things queued will be constructed on the following tick.
    const structureType = this.buildQueue.shift();
    if (structureType){
      try{
        /*
          Extensions come out of the tessellated pod plan, in plan order, so consecutive pods share road
          edges instead of landing wherever the current structure matrix happens to point, and storage
          goes into the near-spawn core. Everything else (towers, spawns) still gets a single structure
          with its own road cross, and both planners fall through to that when they run out of room.
        */
        const planned =
          structureType === STRUCTURE_EXTENSION ? this.placeNextExtensionPod() :
          structureType === STRUCTURE_STORAGE ? this.placeStorageNearSpawn() :
          false;
        if (!planned) this.createDiamondConstructionSites(structureType);
        this.memory.buildQueueRetries = 0;
      }catch(e:any){
        /*
          findDiamondPlacement throws when it can't fit the diamond right now, which is often temporary
          (the room is full of other sites, or a pod is half built). Dropping the queue entry on the
          first throw is how a room ends up at RCL3 with zero extensions and a 300 energy cap, so put it
          back and retry - but bounded, otherwise buildQueue never empties and the stages never advance.
        */
        const retries = (this.memory.buildQueueRetries ?? 0) + 1;
        if (retries <= MAX_BUILD_QUEUE_RETRIES){
          this.memory.buildQueueRetries = retries;
          this.buildQueue.push(structureType);
        }else{
          this.memory.buildQueueRetries = 0;
          console.log(`[${this.roomName}] dropping queued ${structureType} after ${MAX_BUILD_QUEUE_RETRIES} failed placements`);
        }
        console.log(`[${this.roomName}] createDiamondConstructionSites error:`, e, e.stack);
      }
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
