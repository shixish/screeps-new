Implement spawn-circulation staging in /workspace/screeps-new on branch cursor/spawn-circulation-diamond.

You have full write permission. Edit files, run tests, commit.

## Verified repo identifiers (use these exact names)
- Flag: src/flags/HomeFlag.ts
- Economy utils: src/utils/earlyEconomy.ts
- Packing: packRoadPos / unpackRoadPosX / unpackRoadPosY
- Batch roads: placeEarlyRoadSites
- Exit-road pattern to mirror: ensureExitRoadPlan, drawExitRoadPlan, RoomMemory.exitRoads
- Queue field: buildQueue (NOT buildQueue)
- Types: src/global.d.ts RoomMemory
- Tests: test/unit/*.test.ts ; run `pnpm run test-unit`
- Build: `pnpm run build`

## PRIORITY 1 (required) — Spawn circulation that places sites

Geometry for spawn (sx,sy), diamond lattice step (2,2):

### Phase 1 — X roads (CL1 buildSubStage 0)
Replace orthogonal cross currently at HomeFlag CL1 case 0:
  (sx±1,sy), (sx,sy±1)
with diagonals:
  (sx-1,sy-1), (sx-1,sy+1), (sx+1,sy-1), (sx+1,sy+1)
Skip wall/OOB/blocked tiles.

### Phase 2 — Expand diamond one step (CL2)
Replace CL2 case 0 knight-ring (sx±2,sy±1)/(sx±1,sy±2):
1. Complete Manhattan-2 diamond ring around spawn: add (sx±2,sy), (sx,sy±2). With Phase 1 this is 8 roads.
2. One tessellation step: edge centres (sx±2,sy±2). Union of Manhattan-2 road rings around those centres (dedupe). Exclude spawn tile and non-buildable.
3. New src/utils/spawnCirculation.ts with:
   - pure offset helpers
   - ensureSpawnCirculationPlan(room, spawn)
   - areSpawnCirculationRoadsComplete(room) — every phase2 tile has STRUCTURE_ROAD (built, not merely a site)
   - placeSpawnCirculationRoadSites(room) — batch like placeEarlyRoadSites
   - placeSpawnCirculationExtensions(room) — up to 4 STRUCTURE_EXTENSION at (sx±2,sy±2); fallbacks if blocked; never on spawn
   - drawSpawnCirculationPlan(room)
4. RoomMemory.spawnCirculation:
   { phase1:number[]; phase2:number[]; extensions:{x:number;y:number}[];
     roadsComplete?:boolean; extensionsPlaced?:boolean; planned:number }

### HomeFlag wiring
- CL1 case 0: place Phase 1 from plan
- CL2: place Phase 2 road sites; wait until areSpawnCirculationRoadsComplete; then placeSpawnCirculationExtensions
- Remove CL2 buildQueue.push(STRUCTURE_EXTENSION) for the first 5-pack so you do not double-place via createDiamondConstructionSites. Comment that CL2 uses the 4 circulation pockets.
- Keep source/controller road substages + containers
- work(): drawSpawnCirculationPlan each tick alongside drawExitRoadPlan

### Tests
test/unit/spawnCirculation.test.ts covering pure geometry (X, ring-2, edge centres, union, 4 pockets).

## PRIORITY 2 (optional)
Plan-only extensionPods.ts (memory+draw, no createConstructionSite). Skip if P1 takes the time.

## Finish
pnpm run test-unit && pnpm run build must pass.
Commit on cursor/spawn-circulation-diamond:
  Stage spawn X-roads + diamond circulation, then 4 pocket extensions
Leave no uncommitted code patches. Print a short summary.
