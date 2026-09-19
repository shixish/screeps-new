# Diamond Extension Pods — Design Investigation

**Repo:** `/workspace/screeps-new` @ `63b13d7` (master, clean) · **Scope:** investigation only, nothing implemented.

## 1. Screenshot mapping

### 1.1 The two generators

```ts
// src/utils/map.ts:164
export function* diamondCoordinates(baseX:number, baseY:number, diamondSize = 1)
// src/utils/map.ts:193
export function* diamondRingCoordinates(baseX:number, baseY:number, diamondSize = 2)
```

`diamondCoordinates` yields every tile with **Manhattan** distance `|dx|+|dy| <= diamondSize` (a filled Lee sphere / "diamond"). `diamondRingCoordinates` yields only the shell `|dx|+|dy| === diamondSize`.

| call | tiles | offsets |
|---|---|---|
| `diamondCoordinates(size=0)` | 1 | `(0,0)` |
| `diamondCoordinates(size=1)` | **5** | `(0,0) (+1,0) (−1,0) (0,+1) (0,−1)` |
| `diamondCoordinates(size=2)` | 13 | the 5 above + `(±2,0) (0,±2) (±1,±1)` |
| `diamondRingCoordinates(size=1)` | 4 unique | `(+1,0) (−1,0) (0,+1) (0,−1)` |
| `diamondRingCoordinates(size=2)` | **8 unique** | `(+2,0) (−2,0) (+1,+1) (+1,−1) (−1,+1) (−1,−1) (0,+2) (0,−2)` |

### 1.2 The pod = size‑1 cross + size‑2 ring

```ts
// src/flags/HomeFlag.ts:67-78
createDiamondConstructionSites(structureType:BuildableStructureConstant){
  const diamondSize = structureType === STRUCTURE_EXTENSION ? 1 : 0;
  const structureMatrix = diamondSize === 0 ? getStructureCostMatrix(this.home, 4, STRUCTURE_SPAWN) : getStructureCostMatrix(this.home, 4);
  const [x, y] = findDiamondPlacement(this.home, diamondSize, structureMatrix);
  for (const [dx, dy] of diamondCoordinates(x, y, diamondSize)){
    this.home.createConstructionSite(dx, dy, structureType);
  }
  for (const [rx, ry] of diamondRingCoordinates(x, y, diamondSize+1)){
    this.home.createConstructionSite(rx, ry, STRUCTURE_ROAD);
  }
}
```

For `STRUCTURE_EXTENSION`: **radius 1 → the 5-extension cross**, **ring at radius 2 → the 8-tile road diamond**. Exactly the described "cross of 5 extensions inside a diamond road ring". Footprint = 13 tiles. For everything else (towers, storage, spawn) `diamondSize = 0`: one structure with a 4-tile orthogonal road cross, matrix biased toward the spawn via `weightedBy = STRUCTURE_SPAWN`.

### 1.3 Exact offsets in yield order (including duplicates)

```
diamondCoordinates(bx,by,1):
  (0,0) (+1,0) (−1,0) (0,+1) (0,−1)              // 5 yields, 5 unique

diamondRingCoordinates(bx,by,2):
  dy=0,dx=2 → (+2,0) (+2,0) (−2,0) (−2,0)
  dy=1,dx=1 → (+1,+1) (+1,−1) (−1,+1) (−1,−1)
  dy=2,dx=0 → (0,+2) (0,−2) (0,+2) (0,−2)        // 12 yields, 8 unique
```

**The ring generator double-yields its 4 axis tiles.** The `dy+dx === diamondSize` branch (`map.ts:196-207`) never special-cases `dx === 0` / `dy === 0`, so when `dy === 0` it computes `posY = baseY+0` and `negY = baseY-0` — the same row — and emits `(+2,0)` twice. Same for `dx === 0`. `diamondCoordinates` does *not* have this bug (explicit branches at `map.ts:169-176`). Harmless for `createConstructionSite`; **not** harmless for scoring (§2.5).

### 1.4 Tessellation offset — confirmed: centres at ±(2,2)

Your guess is right, and it's the only offset that works.

Let `E(c)` = 5 extension tiles (Manhattan ≤ 1), `R(c)` = 8 ring tiles (Manhattan = 2).

- **Collision bound.** An extension of pod `c` lands on a road of pod `c'` only if some tile is within 1 of `c` and exactly 2 from `c'` — i.e. only if `|c − c'|₁ ≤ 3`. Any lattice with **minimum Manhattan vector ≥ 4** is collision-free.
- **The lattice.** `L = Z·(2,2) + Z·(2,−2)`. Minimum vectors `(±2,±2)` and `(±4,0)/(0,±4)`, all Manhattan 4 ✔. Determinant `|2·(−2) − 2·2| = 8` → **8 tiles per pod**. (Equivalent basis: `(4,0)&(2,2)` — same lattice.)
- **Membership test.** `(x,y) ∈ L` ⟺ `x`, `y` both even **and** `(x+y) ≡ 0 (mod 4)`.
- **Perfect coverage, zero gaps.** Classify any tile by offset `(u,v)` from the anchor:

| `u,v` parity | `(u+v) mod 4` | role | density |
|---|---|---|---|
| both even | 0 | **pod centre** (extension) | 1/8 |
| both even | 2 | **axis road** (ring corner) | 1/8 |
| both odd | — | **diagonal road** (ring edge tile) | 1/4 |
| mixed (`u+v` odd) | — | **arm extension** (N/E/S/W of a centre) | 1/2 |

Extensions = 1/2 + 1/8 = **5/8**; roads = 1/4 + 1/8 = **3/8**; sum = 1. **Every tile is either an extension or a road — no gaps, no leftovers.** 5 extensions + 3 net road tiles = 8 = cell area, closing the accounting exactly.

- **Edge-to-edge sharing.** Pods at `c` and `c+(2,2)` share **three** ring tiles — `(+1,+1)`, `(+2,0)`, `(0,+2)` — an entire diamond *edge*. Each pod has 8 neighbours: 4 **edge-sharing** at `±(2,2)`/`±(2,−2)` (3 tiles each) and 4 **corner-sharing** at `±(4,0)`/`(0,±4)` (1 tile each). Diagonal ring tiles belong to 2 pods; axis ring tiles to **4**.
- **Road economy.** Isolated pod = 8 roads / 5 extensions (1.60). Tessellated = 3 / 5 (**0.60**) — a 2.7× cut in road build *and* decay-repair cost. This is the strongest argument for tessellating.
- **Walkability.** Roads form a connected 45°-rotated grid: axis roads are degree-4 junctions, diagonal roads are degree-2 links. Travel between junctions costs **exactly the Chebyshev distance** — no detour penalty for through-traffic (`(2,0)→(6,0)` is `(2,0)(3,1)(4,2)(5,1)(6,0)` = 4 steps for distance 4). A few local diagonal-road pairs take a 2-tile detour (`(1,1)→(3,3)`), irrelevant for transit.
- **Fill throughput.** Every extension touches ≥2 roads. A filler on a **diagonal** road tile is in range 1 of **6** extensions; on an **axis** road tile, **4**. The centre extension is reachable because all four of its diagonal neighbours are ring roads.
- **The search space is tiny.** The plan is fully determined by the lattice *phase*. `Z²/L` has index 8 → exactly **8 phases**, enumerable as anchors `(ax, ay) ∈ {0,1,2,3} × {0,1}`. The pattern is invariant under 90° rotation about a centre (`L` maps to itself), so **rotations add no candidates**.
- **RCL fit — already matches the build queue.** `HomeFlag` pushes `STRUCTURE_EXTENSION` once per 5 extensions: CL2 ×1 (`:203`), CL3 ×1 (`:217`), CL4 ×2 (`:236-237`), CL5 ×2 (`:255-257`), CL6 ×2 (`:290-291`), CL7 ×2 (`:302-303`), CL8 ×2 (`:322-323`) = **12 pushes = 12 pods = 60 extensions = the RCL8 cap.** A plan of ≤12 ordered pods is exactly what the queue consumes, one pod per pop.

## 2. Gaps vs. your goals

### 2.1 Single placement, no tessellation (goals 1 & 2)

```ts
// src/utils/map.ts:212
export function findDiamondPlacement(room:Room, diamondSize = 1, structureMatrix:CostMatrix = getStructureCostMatrix(room))
```

Scans 2500 tiles, returns **one** `[bestX, bestY]`. No second pod, no lattice, no phase, no memory. Each pod is re-derived from *current* structures at build time, one per `buildQueue` pop (`HomeFlag.ts:439-441`). Consecutive pods can land at offsets like `(3,1)` or `(4,1)` which are **not** in `L` — leaving orphan tiles, sharing no ring edges, and permanently poisoning the phase for every later pod.

The clustering pressure is worth keeping: `getStructureCostMatrix` (`map.ts:72`) sets structure tiles to `maxValue`, dilates downward, then zeroes the structures (`:122-127`), so a tile's value ≈ `4 − (Chebyshev distance to nearest structure)`; `findDiamondPlacement` maximises the sum, preferring empty tiles hugging existing infrastructure.

### 2.2 Road-overlap constraint (goal 3) — half present, blind to the new plan

```ts
// src/utils/map.ts:228-243
if (valueSum > 0) for (const [rx, ry] of diamondRingCoordinates(x, y, diamondSize+1)){
  if (structureMatrix.get(rx, ry) === 0){
    room.visual.circle(rx, ry, { radius: 0.15, fill:"#FF0000" });
    if (room.lookAt(rx,ry).find(obj=>obj.structure?.structureType === STRUCTURE_ROAD)){
      valueSum += 1;
    }else{
      valueSum -= 2;
      badPlacements += 1;
    }
  }
  if (badPlacements > 1){ valueSum = 0; break; }
}
```

A **soft +1 bonus**, not a constraint, and it only fires for tiles the matrix scored 0. It knows nothing about **planned** roads — `room.memory.exitRoads.plannedTiles` and `room.memory.earlyRoads` are never consulted. Goal 3 is unimplemented.

### 2.3 Source-distance objective (goal 4) — absent

Nothing on the diamond path scores distance to sources, controller, or spawn. The only source-distance code is `getBestCentralLocation` (`map.ts:318`), not on this path. "Near any structure" is a weak proxy that drifts as the room grows.

### 2.4 Plan-before-build (goal 5) — absent, inconsistent with the exit-road layer

Placement happens **at build time** in `HomeFlag.work` (`:436-446`). Contrast the layer that just landed:

> *"Routes are planned once and stored in room memory - nothing here places construction sites"* — `earlyEconomy.ts:185-188`
> *"Draws the planned exit roads every tick so they're visible in the Screeps client **without leaving flags behind**"* — `earlyEconomy.ts:405-409`

With no persisted plan the layout isn't idempotent: destroy an extension and the next pass re-runs against a changed matrix and can produce a different pod. Nothing to visualise, nothing to feed later cost matrices, nothing to reserve tiles against.

### 2.5 Three concrete defects in the existing path

1. **Queued extension batches are silently dropped.**
   ```ts
   // src/flags/HomeFlag.ts:436-446
   try{
     const structureType = this.buildQueue.shift();       // :439  pops first
     if (structureType){ this.createDiamondConstructionSites(structureType); }  // :441  may throw
   }catch(e:any){ console.log(`[${this.roomName}] createDiamondConstructionSites error:`, e, e.stack); }
   ```
   `findDiamondPlacement` throws a bare string when nothing fits (`map.ts:259`: `if (bestValue == 0) throw 'Unable to find a suitable construction diamond!'`). The entry is already shifted off and never restored, so **those 5 extensions are never built** and the room silently stalls below its extension cap. The `//TODO: What happens if createDiamondConstructionSites fails? We'll have to fix it manually :shrug:` at `:444` acknowledges it.

2. **The ring check is anisotropic because of the duplicate yields (§1.3).** A blocked *axis* ring tile is visited twice → scores `−4`, sets `badPlacements = 2` → instant rejection. A blocked *diagonal* tile is visited once (`−2`, `badPlacements = 1`) and tolerated. The comment says *"If more than one road cannot be placed in the ring…"* (`map.ts:238`), but the code means "no blocked axis tiles, at most one blocked diagonal". Road bonuses double-count on axis tiles too.

3. **CPU in the hot loop.** `room.lookAt(rx, ry)` per zero-valued ring tile inside a 2500-iteration scan (`map.ts:231`), plus a `RoomVisual` per candidate (`:230`, `:245-246`).

### 2.6 Core-space conflict (not in the brief, but it will bite)

The tiling is 100% dense — **nowhere** for spawn, storage, towers, links, labs, containers. Worse, existing spawn roads fight the lattice: CL1 sub-stage 0 roads the spawn's four *orthogonal* neighbours (`HomeFlag.ts:120-123`), CL2 sub-stage 0 roads `(±2,±1)`/`(±1,±2)` (`:165-172`). In the lattice, roads around a centre are the **diagonals**. Best case is a spawn on an *arm extension* slot, where 3 of its 4 orthogonal road tiles already agree. Any pod planner must **reserve a core region**.

## 3. Recommended algorithm and scoring

Structure it exactly like `planExitRoads`: expensive, run once, cached in memory, visualised every tick, nothing built.

### 3.1 Inputs, computed once

1. **Placement mask** (0 = unusable): terrain wall; `x < 2 || y < 2 || x > 47 || y > 47` (match `map.ts:144`); the radius-2 diamond around every source, the mineral, and the controller — reuse `map.ts:129-138` (`blockedRange = 2`, `blockPosition`) so harvest seats and container spots stay free; any existing non-road structure or site; the **core reserve** (§2.6). Existing **roads are not blockers** — a ring tile on a road is free road.
2. **Distance maps** — reuse `computeWalkCostMap` (`spawnPlacement.ts:328`), a Dijkstra flood-fill with injected `getTerrain`, already unit-testable without game globals. One map from the spawn, one per source container; ~2500 tiles each, computed once and reused by all 8 phases.
3. **Planned-road sets** — `room.memory.exitRoads.plannedTiles` (`earlyEconomy.ts:215`) and `room.memory.earlyRoads.{source,controller,swamp}` (`:14-19`), all in `packRoadPos` form.

### 3.2 Candidate enumeration — 8 phases is the whole space

```
for phase in 0..7:                       // anchors (ax,ay) ∈ {0,1,2,3} × {0,1}
  for each lattice centre c in 2..47:    // ≈ 288 centres per phase
    pod valid iff:
      - all 5 extension tiles usable
      - ≥ RING_MIN of 8 ring tiles usable        (RING_MIN = 8; allow 7 behind an option)
      - ring connects to the accepted network
```

≈ 2300 validity tests × 13 lookups ≈ 30k ops for the entire room across all phases — trivial once per room, far too much per tick. Cache it.

### 3.3 Per-pod score

```
score(pod) =
  + W_ROAD_REUSE   * ringTilesAlreadyRoadOrSite             // free road, already built
  + W_PLANNED_ROAD * ringTilesOnPlannedRoad                 // exitRoads ∪ earlyRoads     (goal 3)
  + W_ADJACENT     * edgeSharingNeighboursAlreadyAccepted   // 0..4, drives tessellation  (goal 2)
  − W_SWAMP_ROAD   * ringTilesOnSwamp                       // swamp road = 5× to build AND repair
  − W_SPAWN_DIST   * walkCostFromSpawn[centre]              // filler round-trip          (goal 4)
  − W_SOURCE_DIST  * mean(walkCostFromSourceContainer[centre])  // courier round-trip     (goal 4)
```

Starting weights: `W_ADJACENT = 6`, `W_ROAD_REUSE = 3`, `W_PLANNED_ROAD = 2`, `W_SWAMP_ROAD = 2`, `W_SPAWN_DIST = 1`, `W_SOURCE_DIST = 0.5`. `W_ADJACENT` must dominate or the planner scatters pods along cheap roads instead of tessellating.

The swamp term is deliberately asymmetric: **extensions cost the same on swamp, roads cost 5×.** A phase that puts its 3/8 road tiles on plain and its 5/8 extension tiles on swamp is strictly cheaper — a free win and a good phase tie-breaker.

### 3.4 Hard constraints

- **Seed constraint (goal 3):** the *first* accepted pod's ring must share **≥1 tile** with an existing road, a road construction site, or a planned road tile. Later pods inherit it transitively via shared ring edges, so it only needs checking on the seed (and on any new disconnected cluster).
- **No collision** with the mask, the core reserve, or another pod's extensions (automatic on-lattice, proven in §1.4).
- **Cap at 12 pods.** Plan all 12 up front so later pods can't be boxed out; order them for incremental build.

### 3.5 Greedy region growth, then phase selection

```
for each phase:
  seed = highest-scoring valid pod satisfying the seed constraint
  while accepted < 12:
    next = highest-scoring valid pod sharing an edge with an accepted pod   // frontier only
    if none: break
    accept(next)
  phaseScore = Σ score(pod_i) / (i + 1)      // discounted: the first pods matter most
pick argmax(phaseScore)
```

Frontier-only growth keeps the cluster contiguous, which is what makes the 3-roads-per-5-extensions economy real. The discount makes the phase choice dominated by pods built at CL2–CL4 — correct, since a plan that's great at RCL8 but bad at RCL3 is a bad plan.

### 3.6 Build ordering

Order by `walkCostFromSpawn(centre)` ascending, tie-broken by requiring each pod after the first to share an edge with an already-ordered pod. The road network then grows outward connected.

### 3.7 Placement tweaks / candidate variants (goal 4)

1. **Phase sweep (8 anchors)** — the primary lever; cheap and exhaustive.
2. **Seed choice** — three growths per phase: best-scoring pod, nearest-spawn, on the exit-road trunk. 24 runs total, still cheap.
3. **Growth strategy** — greedy-best-first (follows energy) vs. BFS ring growth (most compact, most shared edges) vs. trunk-following (max road reuse). Score and keep the winner.
4. **Swamp-aware bias** — §3.3; often decides between two otherwise-equal phases.
5. **Core carve-out size** — reserve radius 2 vs. 3; radius 3 keeps the CL2 outer ring (`HomeFlag.ts:165-172`) and leaves room for storage + 2 towers, at the cost of pushing pods a lattice step out.
6. **Rotations: not needed** — `L` is rotation-invariant, so rotations are already covered by the 8 phases.

## 4. Memory + flag shapes

### 4.1 Memory (mirrors `ExitRoadPlanMemory`, `earlyEconomy.ts:199-217`)

```ts
// src/utils/extensionPods.ts

export interface ExtensionPodMemory{
  id: string;      //`pod-${order}`, stable for the life of the plan (cf. ExitRoadSegmentMemory.id)
  x: number;       //Pod centre. The 5 extension and 8 road tiles are derived from this, never stored.
  y: number;
  order: number;   //Build order, 0 = first. One buildQueue STRUCTURE_EXTENSION pop == one pod.
  score: number;   //Planner score at plan time, kept for debugging and replan comparisons.
  built?: boolean; //Sticky, set once every extension tile has a structure or a site (cf. EarlyRoadPlanMemory.complete).
}

export interface ExtensionPodPlanMemory{
  anchorX: number;   //A pod centre; together with anchorY this pins the lattice phase.
  anchorY: number;
  phase: number;     //0..7, index into EXTENSION_POD_PHASES. Redundant with the anchor, kept for logging.
  pods: ExtensionPodMemory[];   //Ordered, at most EXTENSION_POD_MAX (12 = the RCL8 extension cap).
  roadTiles: number[];          //Union of every pod ring, packRoadPos, for road cost matrices.
  planned: number;              //Game.time the plan was built (cf. ExitRoadPlanMemory.planned).
}
```

Storing **only the centres** keeps this to ~40 numbers instead of ~250; tiles are recomputed exactly from `x,y` by the pure helpers. `roadTiles` is the one derived list worth caching, because `addCheapExitRoadTiles` (`earlyEconomy.ts:273`) wants a flat packed array.

```ts
// src/global.d.ts:157-170 — add alongside the existing two
  earlyRoads?: import('utils/earlyEconomy').EarlyRoadPlanMemory;   // :164
  exitRoads?:  import('utils/earlyEconomy').ExitRoadPlanMemory;    // :165
  extensionPods?: import('utils/extensionPods').ExtensionPodPlanMemory;  // proposed
```

**Packing footgun:** the repo has two incompatible tile packings — `packRoadPos = x*50 + y` (`earlyEconomy.ts:37`) vs `tileIndex = y*50 + x` (`spawnPlacement.ts:65`). Use `packRoadPos` for memory (matches the road layers), convert explicitly when indexing a `computeWalkCostMap` result.

### 4.2 Flags

Convention is `${FlagType}:${suffix}`, split on `:` limit 2 (`managers/flags.ts:55-58`), suffix re-split per type. `BuildFlag` already documents the exact shape:

```ts
/* Flag name should be in the form: `build:${constructionType}:${random()}` ... */  // src/flags/BuildFlag.ts:5
get constructionType():BuildableStructureConstant|undefined{
  return this._constructionType || (this._constructionType = this.suffix?.split(':', 2)[0] as any);  // :11
}
```

**Recommendation: memory + `RoomVisual` as the source of truth, flags as an opt-in debug/override layer** — matching the precedent exit roads set (*"without leaving flags behind"*, `earlyEconomy.ts:405-409`) and avoiding 12 permanent flags per room.

If you want flags anyway (goal 1 says "flags **or equivalent**"):

```
build:extension:${roomName}-pod${order}      // e.g. build:extension:W1N4-pod0
```

Flag names are **global across the whole world**, not per-room, so the room name in the suffix is mandatory. Place at the pod centre, colour by state (`COLOR_WHITE` planned, `COLOR_GREEN` built). A manually-placed flag **overrides** the planner for that slot — the planner snaps it to the nearest valid lattice centre for the room's phase and pins it, giving hand-tuning without abandoning the lattice. A console helper (`placeExtensionPodFlags(roomName)` / `clearExtensionPodFlags(roomName)`) beats placing them automatically, mirroring the documented `JSON.stringify(Memory.rooms['W1N4'].exitRoads)` inspection route (`earlyEconomy.ts:194-196`).

## 5. Recommendation

### 5.1 Ship the plan-only PR now — don't wait

- **The dependency already landed.** PR #15 provides everything to borrow: `packRoadPos`/`unpackRoadPos*` (`earlyEconomy.ts:37-39`), the planned-tile memory shape (`:213-217`), the `ensure*Plan` once-per-room idiom (`:365-367`), the road-aware cost matrix + `addCheapExitRoadTiles` (`:240`, `:273`), the tick-visualiser pattern (`:410`), and a unit-test file exercising pure helpers with no game globals (`test/unit/exitRoads.test.ts`).
- **Goal 3 needs the exit-road plan to exist, and it now does.** Planning pods *after* exit roads is the right order regardless: `ensureExitRoadPlan` is sticky (`room.memory.exitRoads || (...)`), so pods must adapt to the trunk, never the reverse. Building the planner now locks that direction in.
- **Zero behavioural risk.** Memory + visuals only; `createDiamondConstructionSites` keeps working as today, and the plan is inert until a follow-up teaches the build path to consume it.
- **Useful before it's wired up.** Drawing 12 planned pods over a live room is how you learn whether the §3.3 weights are right — feedback you need *before* anything is built, because extensions are expensive to tear down.
- **The geometry is settled** (§1.4): 8 phases, closed-form classifier, perfect tiling. Nothing left to research.

Explicitly **defer** to a second PR: placing construction sites, consuming pods from `buildQueue`, replanning on structure loss, and the core (storage/tower/link) reservation planner. Because the core planner is deferred, the plan-only PR must take a **conservative reserve radius** (§3.7 item 5) so its pods don't claim tiles the core will need.

### 5.2 Thin prototype scope — exact files

| File | Change |
|---|---|
| `src/utils/extensionPods.ts` | **new** — lattice math, placement mask, scoring, plan builder, visualiser |
| `src/global.d.ts` | **+1 line** — `extensionPods?` on `RoomMemory`, next to `:165` |
| `src/flags/HomeFlag.ts` | **+~8 lines** — `extensionPodPlan` getter next to `exitRoadPlan` (`:100-103`), a `drawExtensionPodPlan(this.home)` call next to `:434`, and a CL2 sub-stage that plans + `console.log`s (mirroring CL1 case 4 at `:141-147`) |
| `test/unit/extensionPods.test.ts` | **new** — pure geometry + scoring tests, no game globals |
| `src/flags/AuditFlag.ts` | *optional* — replace the dead commented diamond experiments (`:16-35`) with a live pod overlay |

```ts
// src/utils/extensionPods.ts — proposed public API

export const EXTENSION_POD_LATTICE = [[2, 2], [2, -2]] as const;   //Basis of L.
export const EXTENSION_POD_PHASES: readonly (readonly [number, number])[];  //The 8 anchors, {0..3} x {0,1}.
export const EXTENSION_POD_MAX = 12;             //RCL8 extension cap / 5 per pod.
export const EXTENSION_POD_RING_MIN = 8;         //Usable ring tiles required for a valid pod.

export enum PodTileRole { Centre, Arm, DiagonalRoad, AxisRoad }

/* Pure lattice math - no game globals, fully unit-testable. */
export function classifyPodTile(x:number, y:number, anchorX:number, anchorY:number):PodTileRole;
export function isPodCentre(x:number, y:number, anchorX:number, anchorY:number):boolean;
export function getPodExtensionTiles(x:number, y:number):number[];   //5 packed, centre first
export function getPodRoadTiles(x:number, y:number):number[];        //8 packed, deduplicated
export function getPodEdgeNeighbours(x:number, y:number):[number, number][];   //4 centres at +-(2,2)
export function getPodCornerNeighbours(x:number, y:number):[number, number][]; //4 centres at +-(4,0)/(0,+-4)

/* Room-aware. */
export function buildPodPlacementMatrix(room:Room, reserved?:number[]):CostMatrix;
export function scoreExtensionPod(input:ExtensionPodScoreInput):number;
export function planExtensionPods(room:Room, spawn:StructureSpawn, opts?:ExtensionPodPlanOptions):ExtensionPodPlanMemory;
export function ensureExtensionPodPlan(room:Room, spawn:StructureSpawn):ExtensionPodPlanMemory;
export function getExtensionPodPlan(room:Room):ExtensionPodPlanMemory|undefined;
export function drawExtensionPodPlan(room:Room):void;

/* Deliberately NOT in this PR - the follow-up construction hook, named so the seam is obvious:
   placeExtensionPodSites(room, pod) -> remaining, shaped like placeEarlyRoadSites (earlyEconomy.ts:132). */
```

`getPodRoadTiles` must **deduplicate** — `diamondRingCoordinates` yields 12 entries for 8 tiles (§1.3). A deduped wrapper is the cheapest way to stop that quirk spreading into scoring code.

### 5.3 Tests the PR should carry (these are the hand-derived claims above)

1. `diamondCoordinates(x,y,1)` → exactly `(0,0) (±1,0) (0,±1)`, 5 unique.
2. `diamondRingCoordinates(x,y,2)` → 12 yields, 8 unique; the 4 axis tiles are the duplicated ones.
3. `getPodEdgeNeighbours` returns the 4 `±(2,2)` centres, each sharing exactly 3 road tiles with the pod.
4. `getPodCornerNeighbours` returns the 4 `±(4,0)/(0,±4)` centres, each sharing exactly 1 road tile.
5. Over a tiled patch: **no gaps**, **no extension/road collisions**, extension density 5/8, road density 3/8.
6. `classifyPodTile` agrees with a brute-force "nearest lattice centre" classification over a 20×20 patch.
7. Exactly 8 distinct phases, and `(0,2)` reproduces the `(2,0)` phase (it is `≡ (2,0) mod L`) — a regression guard against a naive `mod 4 / mod 2` phase id.
8. The road graph over a tiled patch is connected under 8-directional movement.
9. Scoring: a pod sharing 4 edges outscores an isolated pod with the same distance/terrain.

### 5.4 Fold in while you're here (cheap, low risk)

- **Don't lose queued extensions** (§2.5 item 1) — move `buildQueue.shift()` outside the `try`, or `unshift` on failure, in `HomeFlag.ts:436-446`. Live bug today, independent of pods.
- **Deduplicate the ring generator** — or leave `diamondRingCoordinates` alone and route new code through `getPodRoadTiles`. Changing the generator alters `findDiamondPlacement`'s scoring (§2.5 item 2), so the wrapper is safer for a plan-only PR.
- **Drop the `RoomVisual` calls out of `findDiamondPlacement`'s scan loop** (`map.ts:230`, `:245-246`) or gate them behind a `visualize` flag, matching `visualizeMatrix`/`getBestCentralLocation` (`map.ts:58`, `:318`).

## 6. Key signatures and memory types, with references

### `src/utils/map.ts`

```ts
// :72
export function getStructureCostMatrix(room:Room, maxDistance = 4, weightedBy?:StructureConstant)
// :129-134  - the source/mineral/controller exclusion the pod planner should reuse
const blockedRange = 2;
const blockPosition = (pos:RoomPosition)=>{
  for (const [dx, dy] of diamondCoordinates(pos.x, pos.y, blockedRange)){ matrix.set(dx, dy, 0); }
};
// :144      - buildable clamp
if (terrain.get(x, y) === TERRAIN_MASK_WALL || x < 2 || y < 2 || x > 47 || y > 47) { matrix.set(x, y, 0); }
// :164
export function* diamondCoordinates(baseX:number, baseY:number, diamondSize = 1)
// :193
export function* diamondRingCoordinates(baseX:number, baseY:number, diamondSize = 2)
// :212
export function findDiamondPlacement(room:Room, diamondSize = 1, structureMatrix:CostMatrix = getStructureCostMatrix(room))
// :259
if (bestValue == 0) throw 'Unable to find a suitable construction diamond!';
// :318
export function getBestCentralLocation(room:Room, matrix:CostMatrix = getTerrainCostMatrix(room), visualize = false)
// :339
export function getBestContainerLocation(pos:RoomPosition, center:RoomPosition)
```

### `src/flags/HomeFlag.ts`

```ts
// :42-44
get buildQueue(){ return this.memory.buildQueue || (this.memory.buildQueue = []); }
// :67
createDiamondConstructionSites(structureType:BuildableStructureConstant)
// :100-103
get exitRoadPlan(){
  const [ spawn ] = this.home.find(FIND_MY_SPAWNS);
  return ensureExitRoadPlan(this.home, spawn, this.earlyRoadPlan);
}
// :120-123   spawn orthogonal road cross (conflicts with the lattice, §2.6)
// :141-147   CL1 sub-stage 4: plan exit roads, build nothing - the template for pod planning
// :165-172   CL2 sub-stage 0: spawn outer ring at (+-2,+-1)/(+-1,+-2)
// :433-434
if (this.home.find(FIND_MY_SPAWNS).length) this.exitRoadPlan;
drawExitRoadPlan(this.home);
// :439-441   the shift-then-throw bug (§2.5)
```

### `src/utils/earlyEconomy.ts`

```ts
// :14-19
export interface EarlyRoadPlanMemory{
  source: number[]; controller: number[]; swamp?: number[]; complete?: boolean;
}
// :37-39
export const packRoadPos = (x:number, y:number)=>x*50+y;
export const unpackRoadPosX = (packed:number)=>Math.floor(packed/50);
export const unpackRoadPosY = (packed:number)=>packed%50;
// :48
const isBuildableCoord = (x:number, y:number)=>x >= 1 && y >= 1 && x <= 48 && y <= 48;
// :132
export function placeEarlyRoadSites(room:Room, positions:number[], limit = MAX_EARLY_ROAD_SITES)
// :199-217
export interface ExitRoadSegmentMemory{ id: string; tiles: number[]; promoted?: boolean; }
export interface ExitRoadRouteMemory{ exit: ExitConstant; order: number; cost: number; path: number[]; segments: ExitRoadSegmentMemory[]; }
export interface ExitRoadPlanMemory{ routes: ExitRoadRouteMemory[]; plannedTiles: number[]; planned: number; }
// :220-226
export const EXIT_ROAD_ROAD_COST = 1; export const EXIT_ROAD_PLAIN_COST = 2; export const EXIT_ROAD_EDGE_COST = 10;
export const EXIT_ROAD_SEGMENT_SIZE = 5;
// :240
export function buildExitRoadCostMatrix(room:Room, cheapTiles:number[] = [])
// :273
export function addCheapExitRoadTiles(matrix:CostMatrix, terrain:RoomTerrain, tiles:number[])
// :322
export function planExitRoads(room:Room, spawn:StructureSpawn, earlyPlan?:EarlyRoadPlanMemory):ExitRoadPlanMemory
// :365-367
export function ensureExitRoadPlan(room:Room, spawn:StructureSpawn, earlyPlan?:EarlyRoadPlanMemory){
  return room.memory.exitRoads || (room.memory.exitRoads = planExitRoads(room, spawn, earlyPlan));
}
// :378 / :392 - the promotion seam a pod planner should copy for staged building
export function findExitRoadSegmentsNear(plan:ExitRoadPlanMemory, x:number, y:number, range:number)
export function promoteExitRoadSegment(plan:ExitRoadPlanMemory, segmentId:string):number[]
// :410
export function drawExitRoadPlan(room:Room)
```

### `src/utils/spawnPlacement.ts`

```ts
// :65
export function tileIndex(x: number, y: number): number { return y * ROOM_SIZE + x; }   // NB: not packRoadPos
// :73
export function chebyshevDistance(ax: number, ay: number, bx: number, by: number): number
// :154
export function findSwampTilesNear(...)
// :328  - Dijkstra flood-fill, injected getTerrain, no game globals => unit-testable
export function computeWalkCostMap(
  origin: TilePos,
  getTerrain: (x: number, y: number) => number,
  isWalkBlocked?: (x: number, y: number) => boolean,
  plainCost = PLAIN_WALK_COST,
  swampCost = SWAMP_WALK_COST
): number[]
```

### Memory + flag plumbing

```ts
// src/global.d.ts:157-170
interface RoomMemory{
  hostile: boolean;
  center: { x:number, y:number };
  sources: Id<Source>[];
  mineral: Id<Mineral>|null;
  spawnBootstrap?: import('utils/spawnPlacement').SpawnBootstrapMemory;
  earlyRoads?: import('utils/earlyEconomy').EarlyRoadPlanMemory;
  exitRoads?: import('utils/earlyEconomy').ExitRoadPlanMemory;
}

// src/managers/flags.ts:55-58   - `${type}:${suffix}`, split on ':' limit 2
export const initFlagManager = (flagName:Flag['name'])=>{
  const [flagType, options] = flagName.split(':', 2) as [FlagType, string];
  return flagType in FlagManagers ? new FlagManagers[flagType](flagName, flagType, options) : undefined;
};

// src/utils/constants.ts:20-29  - FlagType.Build = 'build', FlagType.Audit = 'audit'
```

### Dead code to reclaim — `src/flags/AuditFlag.ts:16-35`

The commented-out block already does half the visualiser: `findDiamondPlacement` → circles over `diamondCoordinates(dx,dy,1)` and blue circles over `diamondRingCoordinates(dx,dy,2)`. That's the natural skeleton for `drawExtensionPodPlan`, iterated over `plan.pods` instead of a single placement.

---

**Headline answers:** tessellation offset is ±(2,2), confirmed and provably unique (§1.4) — it gives a gapless tiling at 5/8 extensions and 3/8 roads, cuts road cost 2.7× vs. isolated pods, keeps the road network connected with no detour penalty between junctions, and reduces the entire room search to **8 lattice phases**. The 12-pod cap lands exactly on the 12 `STRUCTURE_EXTENSION` pushes already in `buildQueue`. My recommendation is to ship the plan-only PR now (§5.2), and to fix the `buildQueue.shift()` bug at `HomeFlag.ts:439` regardless — it silently costs the room 5 extensions whenever placement fails.
