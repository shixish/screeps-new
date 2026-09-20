import { getRoadTileState, hasBuiltRoad, isBuildableCoord, packRoadPos, RoadTileState, unpackRoadPosX, unpackRoadPosY } from "./earlyEconomy";
import { diamondCoordinates, diamondRingCoordinates } from "./map";
import { computeWalkCostMap, tileIndex, UNREACHABLE_COST } from "./spawnPlacement";

/*
  Tessellated extension pods.

  A pod is the shape the room already builds one at a time: a Manhattan-1 cross of 5 extensions inside
  the Manhattan-2 road ring around it. What's new here is that the pods are laid out on a lattice
  instead of being re-derived from the current structures every time the build queue wants another five
  extensions.

  The lattice is L = Z*(2,2) + Z*(2,-2). Its shortest vectors are (+-2,+-2) and (+-4,0)/(0,+-4), all of
  Manhattan length 4, which is exactly the bound that keeps one pod's extensions off another pod's road
  ring, and its determinant is 8 - so every lattice cell holds 5 extensions and 3 net road tiles and the
  tiling has no gaps and no leftovers. Two consequences worth the whole module:

    - Road economy. An isolated pod pays 8 roads for 5 extensions (1.60). Tessellated pods share a whole
      diamond edge (3 tiles) with each of their four +-(2,2) neighbours, so the steady-state cost is
      3 roads per 5 extensions (0.60) - a 2.7x cut in build *and* decay-repair spend.
    - The search space is tiny. Z^2/L has index 8, so the entire plan is determined by which of
      EXTENSION_POD_PHASES the lattice is anchored on. Rotations add nothing: L maps to itself under a
      90 degree turn about a centre.

  Everything here is plan-only in the same sense as the exit roads: planExtensionPods runs once per room
  and writes centres into room.memory.extensionPods, drawExtensionPodPlan paints it every tick, and
  placeExtensionPodSites is the one function that touches the world - called from HomeFlag when the
  build queue pops a STRUCTURE_EXTENSION.

  To read the plan from the console: `JSON.stringify(Memory.rooms['W1N4'].extensionPods)`.
*/

//Manhattan radius of the extension cross and of the road ring around it - the shape HomeFlag has always built.
export const EXTENSION_POD_SIZE = 1;
export const EXTENSION_POD_RING = 2;

//Basis of L. Kept as data so the tests can assert the lattice rather than trusting the derived helpers.
export const EXTENSION_POD_LATTICE = [[2, 2], [2, -2]] as const;

//Extensions per pod, and the number of pods the RCL8 cap allows (60 extensions / 5).
export const EXTENSION_POD_EXTENSIONS = 5;
export const EXTENSION_POD_MAX = 12;

//Usable ring tiles a pod needs. All 8: a pod missing road is a pod the fillers have to walk around.
export const EXTENSION_POD_RING_MIN = 8;

//Manhattan radius kept clear of pod extensions around the spawn, for storage, towers, links and the
//spawn circulation lanes. Radius 3 pushes the first pods one lattice step out, which is the price of
//not having to tear an extension down when the core planner lands.
export const EXTENSION_POD_CORE_RESERVE = 3;

//Harvest seats, the mineral pad and the controller container stay free of extensions. Same radius
//getStructureCostMatrix blocks with (map.ts), so the two planners agree on what's off limits.
export const EXTENSION_POD_BLOCK_RANGE = 2;

/*
  The 8 lattice phases, as anchors (ax, ay) in {0,1,2,3} x {0,1}. Z^2/L has index 8 so this is the whole
  space - and the naive "(x,y) mod 4 / mod 2" guess is wrong, e.g. (0,2) is not a ninth phase, it is the
  (2,0) phase shifted by the lattice vector (-2,2).
*/
export const EXTENSION_POD_PHASES:readonly (readonly [number, number])[] = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1],
];

/* What a tile is used for, relative to a lattice anchor. Every tile in the room is exactly one of these. */
export enum PodTileRole{
  Centre, //Both offsets even and (u+v) % 4 === 0. The extension at the middle of a pod. Density 1/8.
  Arm, //Mixed parity. The four extensions N/E/S/W of a centre. Density 1/2.
  DiagonalRoad, //Both offsets odd. A ring edge tile, shared by 2 pods. Density 1/4.
  AxisRoad, //Both offsets even and (u+v) % 4 === 2. A ring corner, shared by 4 pods. Density 1/8.
}

/* How much of a pod a tile is allowed to carry. Ordered, so `>=` reads as "at least good enough for". */
export enum PodTileUse{
  Blocked = 0, //Wall, rim, or something else already owns the tile.
  RoadOnly = 1, //Can take a ring road but never an extension: an existing road, the core, a planned route.
  Free = 2, //Open ground - extension or road.
}

export interface ExtensionPodMemory{
  id: string; //`pod-${order}`, stable for the life of the plan (cf. ExitRoadSegmentMemory.id).
  x: number; //Pod centre. The 5 extension and 8 road tiles are derived from this, never stored.
  y: number;
  order: number; //Build order, 0 = first. One buildQueue STRUCTURE_EXTENSION pop == one pod.
  score: number; //Planner score at plan time, kept for debugging and replan comparisons.
  built?: boolean; //Sticky, set once every extension tile has a structure or a site (cf. EarlyRoadPlanMemory.complete).
}

export interface ExtensionPodPlanMemory{
  anchorX: number; //A pod centre; together with anchorY this pins the lattice phase.
  anchorY: number;
  phase: number; //0..7, index into EXTENSION_POD_PHASES. Redundant with the anchor, kept for logging.
  pods: ExtensionPodMemory[]; //Ordered, at most EXTENSION_POD_MAX.
  roadTiles: number[]; //Union of every pod ring, packRoadPos, for road cost matrices.
  planned: number; //Game.time the plan was built (cf. ExitRoadPlanMemory.planned).
  version?: number; //Plan version stamp - when this mismatches EXTENSION_POD_PLAN_VERSION, replan.
}

const mod = (value:number, divisor:number)=>((value%divisor)+divisor)%divisor;

const dedupePacked = (packed:number[])=>{
  const seen:number[] = [];
  packed.forEach(tile=>{
    if (!seen.includes(tile)) seen.push(tile);
  });
  return seen;
};

/*
  Which role the lattice assigns a tile, given the anchor. Closed form, no search: the four cases below
  partition Z^2, which is what makes the tiling gapless.
*/
export function classifyPodTile(x:number, y:number, anchorX:number, anchorY:number):PodTileRole{
  const u = x-anchorX, v = y-anchorY;
  const evenU = mod(u, 2) === 0, evenV = mod(v, 2) === 0;
  if (evenU && evenV) return mod(u+v, 4) === 0 ? PodTileRole.Centre : PodTileRole.AxisRoad;
  if (!evenU && !evenV) return PodTileRole.DiagonalRoad;
  return PodTileRole.Arm;
}

export const isPodCentre = (x:number, y:number, anchorX:number, anchorY:number)=>(
  classifyPodTile(x, y, anchorX, anchorY) === PodTileRole.Centre
);

/* The 5 extension tiles of a pod, packed, centre first. */
export const getPodExtensionTiles = (x:number, y:number)=>(
  [...diamondCoordinates(x, y, EXTENSION_POD_SIZE)].map(([tx, ty])=>packRoadPos(tx, ty))
);

/*
  The 8 road tiles of a pod, packed and deduplicated. diamondRingCoordinates yields 12 entries for 8
  tiles - when dx or dy is 0 the positive and negative mirrors are the same tile - and that quirk must
  not reach the scoring code, where it would count a blocked axis tile twice.
*/
export const getPodRoadTiles = (x:number, y:number)=>(
  dedupePacked([...diamondRingCoordinates(x, y, EXTENSION_POD_RING)].map(([tx, ty])=>packRoadPos(tx, ty)))
);

/* The four +-(2,2) neighbours. Each shares a whole diamond edge - 3 ring tiles - with this pod. */
export const getPodEdgeNeighbours = (x:number, y:number):[number, number][]=>(
  [[x+2, y+2], [x+2, y-2], [x-2, y+2], [x-2, y-2]]
);

/* The four +-(4,0)/(0,+-4) neighbours. Each shares exactly one ring tile, the axis road between them. */
export const getPodCornerNeighbours = (x:number, y:number):[number, number][]=>(
  [[x+4, y], [x-4, y], [x, y+4], [x, y-4]]
);

/* Lattice centres of one phase that fit inside the buildable box. Centres only - tiles are derived. */
export function getPodCentresForPhase(anchorX:number, anchorY:number, min = 2, max = 47):[number, number][]{
  const centres:[number, number][] = [];
  for (let y = min; y <= max; y++){
    for (let x = min; x <= max; x++){
      if (isPodCentre(x, y, anchorX, anchorY)) centres.push([x, y]);
    }
  }
  return centres;
}

/* The Manhattan-radius core kept clear of pod extensions. Packed, so it drops straight into `reserved`. */
export const getExtensionPodCoreReserve = (x:number, y:number, radius = EXTENSION_POD_CORE_RESERVE)=>(
  [...diamondCoordinates(x, y, radius)].map(([tx, ty])=>packRoadPos(tx, ty))
);

/*
  Every tile another road layer has already promised. Used twice: as the seed constraint's definition of
  "the network", and as the W_PLANNED_ROAD term - a ring tile on a planned route is a road somebody else
  is already paying for.
*/
export function getPlannedRoadTiles(room:Room):number[]{
  const early = room.memory.earlyRoads;
  const exit = room.memory.exitRoads;
  const circulation = room.memory.spawnCirculation;
  return dedupePacked(([] as number[]).concat(
    early ? early.source.concat(early.controller, early.swamp ?? []) : [],
    exit ? exit.plannedTiles : [],
    circulation ? circulation.phase1.concat(circulation.phase2) : [],
  ));
}

/* Core reserve plus every planned road: tiles a pod may road over but must never put an extension on. */
export const getExtensionPodReservedTiles = (room:Room, spawn:StructureSpawn)=>(
  dedupePacked(getExtensionPodCoreReserve(spawn.pos.x, spawn.pos.y).concat(getPlannedRoadTiles(room)))
);

/*
  The placement mask, as PodTileUse values. Walls and the two-tile rim are Blocked (structures can't go
  there at all), harvest/mineral/controller surroundings and everything in `reserved` are RoadOnly, and
  anything solid that already stands in the room is Blocked - except roads, which are RoadOnly because a
  ring tile that already has a road is a road we don't have to build.
*/
export function buildPodPlacementMatrix(room:Room, reserved:number[] = []):CostMatrix{
  const terrain = room.getTerrain();
  const matrix = new PathFinder.CostMatrix();

  for (let y = 0; y < 50; y++){
    for (let x = 0; x < 50; x++){
      //Same buildable clamp findDiamondPlacement uses - nothing can be built within 2 tiles of the edge.
      const buildable = terrain.get(x, y) !== TERRAIN_MASK_WALL && x >= 2 && y >= 2 && x <= 47 && y <= 47;
      matrix.set(x, y, buildable ? PodTileUse.Free : PodTileUse.Blocked);
    }
  }

  const demoteToRoad = (x:number, y:number)=>{
    if (matrix.get(x, y) === PodTileUse.Free) matrix.set(x, y, PodTileUse.RoadOnly);
  };

  //Harvest seats, the mineral pad and the controller container: roads yes, extensions never.
  const clearAround = (pos:RoomPosition)=>{
    for (const [bx, by] of diamondCoordinates(pos.x, pos.y, EXTENSION_POD_BLOCK_RANGE)) demoteToRoad(bx, by);
  };
  room.find(FIND_SOURCES).forEach(source=>clearAround(source.pos));
  room.find(FIND_MINERALS).forEach(mineral=>clearAround(mineral.pos));
  if (room.controller) clearAround(room.controller.pos);

  const occupy = (pos:RoomPosition, structureType:StructureConstant)=>{
    if (structureType === STRUCTURE_ROAD) demoteToRoad(pos.x, pos.y);
    else if (structureType !== STRUCTURE_RAMPART) matrix.set(pos.x, pos.y, PodTileUse.Blocked);
  };
  room.find(FIND_STRUCTURES).forEach(structure=>occupy(structure.pos, structure.structureType));
  room.find(FIND_CONSTRUCTION_SITES).forEach(site=>occupy(site.pos, site.structureType));

  reserved.forEach(packed=>demoteToRoad(unpackRoadPosX(packed), unpackRoadPosY(packed)));
  return matrix;
}

export interface ExtensionPodScoreWeights{
  adjacent: number;
  roadReuse: number;
  plannedRoad: number;
  swampRoad: number;
  spawnDistance: number;
  sourceDistance: number;
}

/*
  `adjacent` has to dominate or the planner scatters pods along cheap road instead of tessellating, and
  the tessellation is the entire point (0.60 roads per extension vs 1.60).

  The swamp term is deliberately asymmetric: an extension costs the same on swamp as on plain, a road
  costs 5x to build *and* 5x to repair. So a phase that lands its 3/8 road tiles on plain and its 5/8
  extension tiles on swamp is strictly cheaper, and only the ring tiles are penalised here.
*/
/*
  Plan version stamp. Increment to force all existing pod plans to replan on deploy - used when the scoring
  weights or placement rules change enough that old plans are wrong.
*/
export const EXTENSION_POD_PLAN_VERSION = 2;

export const EXTENSION_POD_SCORE_WEIGHTS:ExtensionPodScoreWeights = {
  adjacent: 6,
  roadReuse: 3,
  plannedRoad: 2,
  swampRoad: 2,
  spawnDistance: 1.5,
  sourceDistance: 2.5,
};

export interface ExtensionPodScoreInput{
  edgeNeighbours: number; //Accepted +-(2,2) neighbours, 0..4. Drives the tessellation.
  ringRoadTiles: number; //Ring tiles that already have a road or a road construction site.
  ringPlannedTiles: number; //Ring tiles sitting on another layer's planned road.
  ringSwampTiles: number; //Ring tiles on swamp - 5x the build and repair bill.
  spawnDistance: number; //Walk cost spawn -> centre. The filler's round trip.
  sourceDistance: number; //Mean walk cost source -> centre. The courier's round trip.
}

export function scoreExtensionPod(input:ExtensionPodScoreInput, weights = EXTENSION_POD_SCORE_WEIGHTS){
  return (
    weights.adjacent*input.edgeNeighbours +
    weights.roadReuse*input.ringRoadTiles +
    weights.plannedRoad*input.ringPlannedTiles -
    weights.swampRoad*input.ringSwampTiles -
    weights.spawnDistance*input.spawnDistance -
    weights.sourceDistance*input.sourceDistance
  );
}

interface PodCandidate{
  x: number;
  y: number;
  centre: number; //packRoadPos of (x,y), the candidate's key.
  roadTiles: number[];
  seed: boolean; //Ring touches an existing or planned road, so this pod may start a cluster.
  base: Omit<ExtensionPodScoreInput, 'edgeNeighbours'>;
}

const hasRoad = (room:Room, x:number, y:number)=>(
  room.lookForAt(LOOK_STRUCTURES, x, y).some(structure=>structure.structureType === STRUCTURE_ROAD) ||
  room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(site=>site.structureType === STRUCTURE_ROAD)
);

/*
  Every pod of one phase that clears the mask, with the parts of its score that don't depend on which
  other pods get accepted. Distance maps are Dijkstra floods shared across all 8 phases, so this is the
  cheap half of the planner.
*/
function collectPodCandidates(
  room:Room,
  matrix:CostMatrix,
  anchorX:number,
  anchorY:number,
  plannedTiles:number[],
  spawnCosts:number[],
  sourceCosts:number[][],
):Map<number, PodCandidate>{
  const terrain = room.getTerrain();
  const candidates = new Map<number, PodCandidate>();

  getPodCentresForPhase(anchorX, anchorY).forEach(([x, y])=>{
    const extensionTiles = getPodExtensionTiles(x, y);
    if (extensionTiles.length !== EXTENSION_POD_EXTENSIONS) return;
    for (const packed of extensionTiles){
      if (matrix.get(unpackRoadPosX(packed), unpackRoadPosY(packed)) < PodTileUse.Free) return;
    }

    const roadTiles = getPodRoadTiles(x, y);
    let usableRing = 0, ringRoadTiles = 0, ringPlannedTiles = 0, ringSwampTiles = 0, seed = false;
    roadTiles.forEach(packed=>{
      const rx = unpackRoadPosX(packed), ry = unpackRoadPosY(packed);
      if (matrix.get(rx, ry) >= PodTileUse.RoadOnly) usableRing++;
      if (terrain.get(rx, ry) === TERRAIN_MASK_SWAMP) ringSwampTiles++;
      if (hasRoad(room, rx, ry)){
        ringRoadTiles++;
        seed = true;
      }
      if (plannedTiles.includes(packed)){
        ringPlannedTiles++;
        seed = true;
      }
    });
    if (usableRing < EXTENSION_POD_RING_MIN) return;

    const index = tileIndex(x, y);
    const spawnDistance = spawnCosts[index];
    if (spawnDistance === UNREACHABLE_COST) return; //Walled off from the spawn - nobody could ever fill it.
    const reachable = sourceCosts.map(costs=>costs[index]).filter(cost=>cost !== UNREACHABLE_COST);
    const sourceDistance = reachable.length ? reachable.reduce((sum, cost)=>sum+cost, 0)/reachable.length : spawnDistance;

    candidates.set(packRoadPos(x, y), {
      x, y,
      centre: packRoadPos(x, y),
      roadTiles,
      seed,
      base: { ringRoadTiles, ringPlannedTiles, ringSwampTiles, spawnDistance, sourceDistance },
    });
  });

  return candidates;
}

interface GrownPhase{
  pods: { x:number, y:number, score:number }[];
  phaseScore: number;
}

/*
  Greedy region growth (report section 3.5). The seed has to touch the existing road network, then every
  later pod has to share a diamond edge with one already accepted - frontier-only growth is what makes
  the 3-roads-per-5-extensions economy real rather than theoretical.

  The phase score discounts by acceptance order, so the choice of phase is dominated by the pods that
  actually get built at CL3-CL5. A plan that is wonderful at RCL8 and bad at RCL3 is a bad plan.
*/
function growPhase(candidates:Map<number, PodCandidate>, weights:ExtensionPodScoreWeights, max = EXTENSION_POD_MAX):GrownPhase|null{
  const accepted:{ x:number, y:number, score:number }[] = [];
  const acceptedCentres = new Set<number>();

  const countAcceptedNeighbours = (candidate:PodCandidate)=>getPodEdgeNeighbours(candidate.x, candidate.y)
    .reduce((count, [nx, ny])=>count + (acceptedCentres.has(packRoadPos(nx, ny)) ? 1 : 0), 0);

  const pick = (eligible:(candidate:PodCandidate)=>boolean, edgeNeighbours:(candidate:PodCandidate)=>number)=>{
    let best:PodCandidate|undefined, bestScore = 0;
    candidates.forEach(candidate=>{
      if (acceptedCentres.has(candidate.centre) || !eligible(candidate)) return;
      const score = scoreExtensionPod({ ...candidate.base, edgeNeighbours: edgeNeighbours(candidate) }, weights);
      //Ties break on the packed centre so replanning the same room lands the same way.
      if (!best || score > bestScore || (score === bestScore && candidate.centre < best.centre)){
        best = candidate;
        bestScore = score;
      }
    });
    return best ? { candidate: best, score: bestScore } : null;
  };

  const seed = pick(candidate=>candidate.seed, ()=>0);
  if (!seed) return null;
  accepted.push({ x: seed.candidate.x, y: seed.candidate.y, score: seed.score });
  acceptedCentres.add(seed.candidate.centre);

  while (accepted.length < max){
    const next = pick(candidate=>countAcceptedNeighbours(candidate) > 0, countAcceptedNeighbours);
    if (!next) break;
    accepted.push({ x: next.candidate.x, y: next.candidate.y, score: next.score });
    acceptedCentres.add(next.candidate.centre);
  }

  const phaseScore = accepted.reduce((sum, pod, index)=>sum + pod.score/(index+1), 0);
  return { pods: accepted, phaseScore };
}

/*
  Build order (report section 3.6): nearest the spawn first, but every pod after the first has to share
  an edge with one already ordered, so the road network grows outward connected instead of jumping.
*/
function orderPods(pods:{ x:number, y:number, score:number }[], spawnCosts:number[]){
  const remaining = pods.slice();
  const ordered:typeof pods = [];
  const orderedCentres = new Set<number>();
  const cost = (pod:{ x:number, y:number })=>spawnCosts[tileIndex(pod.x, pod.y)];

  while (remaining.length){
    const connected = remaining.filter(pod=>getPodEdgeNeighbours(pod.x, pod.y)
      .some(([nx, ny])=>orderedCentres.has(packRoadPos(nx, ny))));
    //The first pod has nothing to connect to, and a cluster can be cut off by a replan - fall back to all.
    const pool = ordered.length && connected.length ? connected : remaining;
    const next = pool.reduce((best, pod)=>(
      cost(pod) < cost(best) || (cost(pod) === cost(best) && packRoadPos(pod.x, pod.y) < packRoadPos(best.x, best.y)) ? pod : best
    ), pool[0]);
    ordered.push(next);
    orderedCentres.add(packRoadPos(next.x, next.y));
    remaining.splice(remaining.indexOf(next), 1);
  }
  return ordered;
}

export interface ExtensionPodPlanOptions{
  max?: number;
  weights?: ExtensionPodScoreWeights;
  reserved?: number[];
}

/*
  The whole plan in one pass: one Dijkstra flood per goal, then 8 phase growths over the same masks.
  Expensive (roughly 30k mask lookups plus a handful of floods), so this only ever runs once per room.
*/
export function planExtensionPods(room:Room, spawn:StructureSpawn, opts:ExtensionPodPlanOptions = {}):ExtensionPodPlanMemory{
  const max = opts.max ?? EXTENSION_POD_MAX;
  const weights = opts.weights ?? EXTENSION_POD_SCORE_WEIGHTS;
  const reserved = opts.reserved ?? getExtensionPodReservedTiles(room, spawn);
  const plannedTiles = getPlannedRoadTiles(room);
  const matrix = buildPodPlacementMatrix(room, reserved);

  const terrain = room.getTerrain();
  const getTerrainAt = (x:number, y:number)=>terrain.get(x, y);
  const spawnCosts = computeWalkCostMap(spawn.pos, getTerrainAt);
  const sourceCosts = room.find(FIND_SOURCES).map(source=>computeWalkCostMap(source.pos, getTerrainAt));

  const grownPhases = EXTENSION_POD_PHASES.map(([anchorX, anchorY])=>{
    const candidates = collectPodCandidates(room, matrix, anchorX, anchorY, plannedTiles, spawnCosts, sourceCosts);
    return growPhase(candidates, weights, max);
  });
  const bestPhase = grownPhases.reduce((best, grown, phase)=>{
    if (!grown) return best;
    const incumbent = best < 0 ? null : grownPhases[best];
    return !incumbent || grown.phaseScore > incumbent.phaseScore ? phase : best;
  }, -1);

  //Every phase is boxed in (a tiny or heavily walled room). Store the empty plan anyway so the caller
  //falls back to findDiamondPlacement instead of re-running this every tick.
  const phase = bestPhase < 0 ? 0 : bestPhase;
  const [anchorX, anchorY] = EXTENSION_POD_PHASES[phase];
  const grown:GrownPhase = grownPhases[bestPhase] ?? { pods: [], phaseScore: 0 };

  const pods = orderPods(grown.pods, spawnCosts).map((pod, order)=>({
    id: `pod-${order}`,
    x: pod.x,
    y: pod.y,
    order,
    score: Math.round(pod.score*100)/100,
    //Spawn circulation may already have filled a pod (its four pocket extensions sit on this lattice).
    //Marking it built here is what stops the build queue re-placing sites that are already standing.
    ...(isExtensionPodBuilt(room, pod) ? { built: true } : {}),
  }));

  const roadTiles = dedupePacked(pods.reduce((out, pod)=>out.concat(getPodRoadTiles(pod.x, pod.y)), [] as number[]));
  return { anchorX, anchorY, phase, pods, roadTiles, planned: Game.time, version: EXTENSION_POD_PLAN_VERSION };
}

export function getExtensionPodPlan(room:Room){
  return room.memory.extensionPods;
}

/*
  Invalidates an existing pod plan by deleting it from memory. Orphan flags are cleaned by the next sync.
  Called when the plan is stale or bad - scoring weights changed, lattice rules changed, or pods are
  stranded far from sources with terrible scores.
*/
export function invalidateExtensionPodPlan(room:Room){
  delete room.memory.extensionPods;
}

/* Plan once per room, same sticky-memory shape as the early/exit road plans. */
export function ensureExtensionPodPlan(room:Room, spawn:StructureSpawn){
  const existing = room.memory.extensionPods;
  //Replan if the version stamp is missing or mismatched - scoring weights or rules changed.
  if (existing && existing.version !== EXTENSION_POD_PLAN_VERSION){
    console.log(`[${room.name}] extension pod plan version mismatch (${existing.version ?? 'none'} != ${EXTENSION_POD_PLAN_VERSION}), replanning`);
    invalidateExtensionPodPlan(room);
  }
  return room.memory.extensionPods || (room.memory.extensionPods = planExtensionPods(room, spawn));
}

/*
  State of one planned extension tile. Mirrors RoadTileState: a tile that can never take an extension
  (wall, rim, or something else already owns it) counts as Satisfied rather than outstanding work, so a
  single blocked tile can't pin a pod as unbuilt forever and stall the build queue on it.
*/
export enum PodExtensionState{
  Missing,
  Pending,
  Satisfied,
}

export function getPodExtensionState(room:Room, packed:number):PodExtensionState{
  const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
  if (!isBuildableCoord(x, y)) return PodExtensionState.Satisfied;
  if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return PodExtensionState.Satisfied;
  for (const structure of room.lookForAt(LOOK_STRUCTURES, x, y)){
    if (structure.structureType !== STRUCTURE_RAMPART) return PodExtensionState.Satisfied;
  }
  for (const site of room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)){
    return site.structureType === STRUCTURE_EXTENSION ? PodExtensionState.Pending : PodExtensionState.Satisfied;
  }
  return PodExtensionState.Missing;
}

/* A pod is built once none of its five extension tiles is outstanding work. */
export const isExtensionPodBuilt = (room:Room, pod:{ x:number, y:number })=>(
  getPodExtensionTiles(pod.x, pod.y).every(packed=>getPodExtensionState(room, packed) !== PodExtensionState.Missing)
);

/* Re-reads the world and updates the sticky `built` flags. Cheap enough for the flag sync throttle. */
export function refreshExtensionPodPlan(room:Room, plan = getExtensionPodPlan(room)){
  if (!plan) return plan;
  plan.pods.forEach(pod=>{
    if (!pod.built && isExtensionPodBuilt(room, pod)) pod.built = true;
  });
  return plan;
}

/* The pod the next STRUCTURE_EXTENSION pop should build: lowest order that isn't finished yet. */
export function getNextExtensionPod(plan?:ExtensionPodPlanMemory){
  return plan?.pods.find(pod=>pod.built !== true);
}

/*
  The one function here that touches the world. Road sites on the 8 ring tiles first, then extension
  sites on the 5 cross tiles, skipping anything that already has the right structure or site. Roads go
  down first so the same tick's builders (BasicCreep.startBuilding prioritises STRUCTURE_ROAD) can start
  paving before the extensions appear as competing sites. Returns how many extension tiles still need a
  site, so 0 means the pod is fully placed - the caller marks it built and the next queue pop moves on
  to the next pod.
*/
export function placeExtensionPodSites(room:Room, pod:{ x:number, y:number }){
  //Ring roads first. Shared with neighbouring pods, so most are already placed by the time a pod in
  //the middle of the cluster comes up - but the first pods of a ring must pave before their crosses.
  getPodRoadTiles(pod.x, pod.y).forEach(packed=>{
    //Satisfied covers a tile that's already paved, Pending a tile that already has a road site: either
    //way there's nothing to place, and a second site on a built road would never be buildable anyway.
    if (getRoadTileState(room, packed) !== RoadTileState.Missing) return;
    room.createConstructionSite(unpackRoadPosX(packed), unpackRoadPosY(packed), STRUCTURE_ROAD);
  });

  let remaining = 0;
  getPodExtensionTiles(pod.x, pod.y).forEach(packed=>{
    if (getPodExtensionState(room, packed) !== PodExtensionState.Missing) return;
    const result = room.createConstructionSite(unpackRoadPosX(packed), unpackRoadPosY(packed), STRUCTURE_EXTENSION);
    //ERR_FULL / ERR_RCL_NOT_ENOUGH are "not right now": leave the tile outstanding and let the build
    //queue's retry/backoff bring us back. Anything else means the tile is blocked, and getPodExtensionState
    //will report it Satisfied on the next pass so it can't stall the pod.
    if (result !== OK) remaining++;
  });

  return remaining;
}

const POD_PLANNED_COLOR = '#88aaff';
const POD_NEXT_COLOR = '#ffaa44';
const POD_BUILT_COLOR = '#66dd88';

/*
  Mirrors drawExitRoadPlan: the plan painted every tick, no flags involved (those live in extensionPodFlags).
  Brighter and thicker than before for better visibility.
*/
export function drawExtensionPodPlan(room:Room){
  const plan = getExtensionPodPlan(room);
  if (!plan) return;
  const next = getNextExtensionPod(plan);
  plan.pods.forEach(pod=>{
    const color = pod.built ? POD_BUILT_COLOR : (pod === next ? POD_NEXT_COLOR : POD_PLANNED_COLOR);
    const opacity = pod.built ? 0.3 : 0.7;
    const strokeWidth = pod === next ? 0.08 : 0.05;
    getPodExtensionTiles(pod.x, pod.y).forEach(packed=>{
      const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
      room.visual.rect(x-0.4, y-0.4, 0.8, 0.8, { fill: 'transparent', stroke: color, strokeWidth, opacity });
    });
    getPodRoadTiles(pod.x, pod.y).forEach(packed=>{
      const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
      //Ring tiles are shared between neighbouring pods, so most of them are paved long before the pod
      //itself is built. Draw those as completed instead of as another planned dot on top of a road.
      const built = hasBuiltRoad(room, x, y);
      room.visual.circle(x, y, { radius: built ? 0.1 : 0.15, fill: color, opacity: opacity*(built ? 0.25 : 0.7) });
    });
    const label = `#${pod.order} (${pod.x},${pod.y})${pod.score >= 0 ? '+' : ''}${pod.score}`;
    room.visual.text(label, pod.x, pod.y+0.15, { font: 0.45, color, opacity: 0.95, backgroundColor: '#000000', backgroundPadding: 0.05 });
  });
}
