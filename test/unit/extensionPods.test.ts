import { assert } from "chai";
import { packRoadPos, unpackRoadPosX, unpackRoadPosY } from "../../src/utils/earlyEconomy";
import {
  EXTENSION_POD_LATTICE,
  EXTENSION_POD_MAX,
  EXTENSION_POD_PHASES,
  EXTENSION_POD_PLAN_VERSION,
  EXTENSION_POD_RING_MIN,
  EXTENSION_POD_SCORE_WEIGHTS,
  ExtensionPodPlanMemory,
  PodTileRole,
  classifyPodTile,
  cleanupStaleExtensionPodRoadSites,
  countPodParallelRoads,
  getPodNetworkRingTiles,
  getPodParallelRingTiles,
  getPodCentresForPhase,
  getPodCornerNeighbours,
  getPodEdgeNeighbours,
  getPodExtensionTiles,
  getPodRoadTiles,
  getNextExtensionPod,
  getPodExtensionState,
  isExtensionPodBuilt,
  isPodCentre,
  placeExtensionPodSites,
  planExtensionPods,
  PodExtensionState,
  refreshExtensionPodPlan,
  scoreExtensionPod
} from "../../src/utils/extensionPods";
import {
  EXTENSION_POD_FLAG_PREFIX,
  EXTENSION_POD_FLAG_SYNC_INTERVAL,
  ExtensionPodFlagState,
  extensionPodFlagName,
  findOrphanExtensionPodFlags,
  getDesiredExtensionPodFlags,
  getExtensionPodFlagColor,
  getExtensionPodFlagState,
  isExtensionPodFlagName,
  syncExtensionPodFlags
} from "../../src/utils/extensionPodFlags";
import { diamondCoordinates, diamondRingCoordinates } from "../../src/utils/map";

//The COLOR_* globals only exist in the game runtime; the colour helpers read them lazily.
const globals = global as any;
globals.COLOR_BLUE = 1;
globals.COLOR_GREEN = 4;
globals.COLOR_ORANGE = 7;
globals.COLOR_WHITE = 10;

const sortPacked = (packed: number[]) => packed.slice().sort((a, b) => a - b);
const pack = (coords: number[][]) => sortPacked(coords.map(([x, y]) => packRoadPos(x, y)));

//A pod centre is in the lattice L = Z*(2,2) + Z*(2,-2) iff both offsets are even and their sum is 0 mod 4.
const inLattice = (dx: number, dy: number) =>
  Math.abs(dx % 2) === 0 && Math.abs(dy % 2) === 0 && (((dx + dy) % 4) + 4) % 4 === 0;

describe("extension pod lattice", () => {
  it("keeps the two generators honest: 5 extension tiles, 8 unique ring tiles from 12 yields", () => {
    assert.lengthOf([...diamondCoordinates(25, 25, 1)], 5);
    //The ring generator mirrors its axis tiles, so 12 yields collapse to 8 tiles.
    assert.lengthOf([...diamondRingCoordinates(25, 25, 2)], 12);
    const ring = getPodRoadTiles(25, 25);
    assert.lengthOf(ring, 8);
    assert.lengthOf(new Set(ring), 8);
    ring.forEach(packed => {
      assert.equal(Math.abs(unpackRoadPosX(packed) - 25) + Math.abs(unpackRoadPosY(packed) - 25), 2);
    });
    //The duplicated yields are exactly the four axis tiles.
    assert.includeMembers(ring, pack([[27, 25], [23, 25], [25, 27], [25, 23]]));
  });

  it("puts the centre first and the four arms around it", () => {
    const tiles = getPodExtensionTiles(25, 25);
    assert.lengthOf(tiles, 5);
    assert.equal(tiles[0], packRoadPos(25, 25));
    assert.deepEqual(sortPacked(tiles.slice(1)), pack([[26, 25], [24, 25], [25, 26], [25, 24]]));
  });

  it("edge neighbours sit on the lattice basis and share a whole diamond edge", () => {
    const neighbours = getPodEdgeNeighbours(25, 25);
    assert.deepEqual(pack(neighbours), pack([[27, 27], [27, 23], [23, 27], [23, 23]]));
    //The basis vectors are what generate them.
    EXTENSION_POD_LATTICE.forEach(([dx, dy]) => {
      assert.include(pack(neighbours), packRoadPos(25 + dx, 25 + dy));
      assert.isTrue(inLattice(dx, dy));
    });
    const ring = getPodRoadTiles(25, 25);
    neighbours.forEach(([nx, ny]) => {
      const shared = getPodRoadTiles(nx, ny).filter(packed => ring.includes(packed));
      assert.lengthOf(shared, 3, `edge neighbour ${nx},${ny}`);
      //An edge neighbour's extensions never touch this pod's ring - that's the +-(2,2) collision bound.
      assert.isEmpty(getPodExtensionTiles(nx, ny).filter(packed => ring.includes(packed)));
    });
  });

  it("corner neighbours share exactly the one axis road between them", () => {
    const neighbours = getPodCornerNeighbours(25, 25);
    assert.deepEqual(pack(neighbours), pack([[29, 25], [21, 25], [25, 29], [25, 21]]));
    const ring = getPodRoadTiles(25, 25);
    neighbours.forEach(([nx, ny]) => {
      assert.lengthOf(getPodRoadTiles(nx, ny).filter(packed => ring.includes(packed)), 1, `corner ${nx},${ny}`);
      assert.isEmpty(getPodExtensionTiles(nx, ny).filter(packed => ring.includes(packed)));
    });
  });

  it("tiles a patch with no gaps, no collisions, and the 5/8 - 3/8 densities", () => {
    const [anchorX, anchorY] = [25, 25];
    const extensions = new Set<number>();
    const roads = new Set<number>();
    //Every lattice centre whose whole pod lands inside the patch.
    for (let y = 10; y <= 40; y++) {
      for (let x = 10; x <= 40; x++) {
        if (!isPodCentre(x, y, anchorX, anchorY)) continue;
        getPodExtensionTiles(x, y).forEach(packed => extensions.add(packed));
        getPodRoadTiles(x, y).forEach(packed => roads.add(packed));
      }
    }
    let extensionTiles = 0, roadTiles = 0;
    //Score the interior only, so pods just outside the scanned band can't leave false holes.
    for (let y = 16; y <= 34; y++) {
      for (let x = 16; x <= 34; x++) {
        const packed = packRoadPos(x, y);
        const isExtension = extensions.has(packed), isRoad = roads.has(packed);
        assert.isTrue(isExtension || isRoad, `gap at ${x},${y}`);
        assert.isFalse(isExtension && isRoad, `collision at ${x},${y}`);
        if (isExtension) extensionTiles++;
        if (isRoad) roadTiles++;
      }
    }
    const total = extensionTiles + roadTiles;
    assert.closeTo(extensionTiles / total, 5 / 8, 0.02);
    assert.closeTo(roadTiles / total, 3 / 8, 0.02);
  });

  it("classifies every tile the way a nearest-centre sweep would", () => {
    const [anchorX, anchorY] = [3, 1];
    const counts = { [PodTileRole.Centre]: 0, [PodTileRole.Arm]: 0, [PodTileRole.DiagonalRoad]: 0, [PodTileRole.AxisRoad]: 0 };
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const role = classifyPodTile(x, y, anchorX, anchorY);
        counts[role]++;
        if (role === PodTileRole.Centre) {
          assert.isTrue(inLattice(x - anchorX, y - anchorY), `${x},${y} should be a lattice point`);
          continue;
        }
        //Brute force: find the nearest lattice centre and ask which of its tiles this is.
        let nearest: [number, number] | null = null, nearestDistance = Infinity;
        for (let cy = -8; cy < 28; cy++) {
          for (let cx = -8; cx < 28; cx++) {
            if (!isPodCentre(cx, cy, anchorX, anchorY)) continue;
            const distance = Math.abs(cx - x) + Math.abs(cy - y);
            if (distance < nearestDistance) { nearest = [cx, cy]; nearestDistance = distance; }
          }
        }
        const [cx, cy] = nearest!;
        const packed = packRoadPos(x, y);
        if (role === PodTileRole.Arm) {
          assert.equal(nearestDistance, 1);
          assert.include(getPodExtensionTiles(cx, cy), packed);
        } else {
          assert.equal(nearestDistance, 2);
          assert.include(getPodRoadTiles(cx, cy), packed);
        }
      }
    }
    //1/8 centres, 1/2 arms, 1/4 diagonal roads, 1/8 axis roads over a 400 tile patch.
    assert.equal(counts[PodTileRole.Centre], 50);
    assert.equal(counts[PodTileRole.AxisRoad], 50);
    assert.equal(counts[PodTileRole.Arm], 200);
    assert.equal(counts[PodTileRole.DiagonalRoad], 100);
  });

  it("has exactly 8 phases, and (0,2) is the (2,0) phase rather than a ninth", () => {
    assert.lengthOf(EXTENSION_POD_PHASES, 8);
    //Distinct: no two anchors differ by a lattice vector.
    EXTENSION_POD_PHASES.forEach(([ax, ay], i) => {
      EXTENSION_POD_PHASES.forEach(([bx, by], j) => {
        if (i >= j) return;
        assert.isFalse(inLattice(ax - bx, ay - by), `phase ${i} and ${j} are the same coset`);
      });
    });
    //Every tile in the room belongs to exactly one phase's centre set.
    for (let y = 20; y < 24; y++) {
      for (let x = 20; x < 24; x++) {
        const matching = EXTENSION_POD_PHASES.filter(([ax, ay]) => isPodCentre(x, y, ax, ay));
        assert.lengthOf(matching, 1, `${x},${y}`);
      }
    }
    //The naive "mod 4 / mod 2" guess would call (0,2) a ninth phase. It isn't: (0,2) - (2,0) is in L.
    assert.isTrue(inLattice(0 - 2, 2 - 0));
    for (let y = 20; y < 24; y++) {
      for (let x = 20; x < 24; x++) {
        assert.equal(isPodCentre(x, y, 0, 2), isPodCentre(x, y, 2, 0), `${x},${y}`);
      }
    }
  });

  it("keeps a phase's road graph connected under 8-directional movement", () => {
    const roads = new Set<number>();
    for (let y = 12; y <= 38; y++) {
      for (let x = 12; x <= 38; x++) {
        if (isPodCentre(x, y, 25, 25)) getPodRoadTiles(x, y).forEach(packed => roads.add(packed));
      }
    }
    const start = Math.min(...roads);
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length) {
      const packed = queue.shift()!;
      const x = unpackRoadPosX(packed), y = unpackRoadPosY(packed);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const next = packRoadPos(x + dx, y + dy);
          if (!roads.has(next) || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    assert.equal(seen.size, roads.size);
  });

  it("enumerates ~1/8 of the buildable box as centres for one phase", () => {
    const centres = getPodCentresForPhase(0, 0);
    assert.isAtLeast(centres.length, 250);
    assert.isAtMost(centres.length, 300);
    centres.forEach(([x, y]) => {
      assert.isTrue(x >= 2 && y >= 2 && x <= 47 && y <= 47);
      assert.isTrue(isPodCentre(x, y, 0, 0));
    });
    //A full room holds far more lattice slots than the RCL8 cap of 12 pods.
    assert.isAbove(centres.length, EXTENSION_POD_MAX);
    assert.equal(EXTENSION_POD_MAX * 5, 60); //RCL8 extension cap.
    assert.equal(EXTENSION_POD_RING_MIN, 8);
  });
});

describe("extension pod scoring", () => {
  const base = { ringRoadTiles: 0, ringPlannedTiles: 0, ringParallelRoads: 0, ringSwampTiles: 0, spawnDistance: 10, sourceDistance: 20 };

  it("prefers the edge-adjacent pod over an isolated one at the same distance", () => {
    const isolated = scoreExtensionPod({ ...base, edgeNeighbours: 0 });
    const adjacent = scoreExtensionPod({ ...base, edgeNeighbours: 4 });
    assert.isAbove(adjacent, isolated);
    assert.equal(adjacent - isolated, 4 * EXTENSION_POD_SCORE_WEIGHTS.adjacent);
    //Adjacency has to outweigh road reuse, or the planner scatters pods along cheap road instead of tessellating.
    assert.isAbove(EXTENSION_POD_SCORE_WEIGHTS.adjacent, EXTENSION_POD_SCORE_WEIGHTS.roadReuse);
    assert.isAbove(EXTENSION_POD_SCORE_WEIGHTS.roadReuse, EXTENSION_POD_SCORE_WEIGHTS.plannedRoad);
  });

  it("rewards reused and planned road, penalises swamp ring and distance", () => {
    assert.isAbove(scoreExtensionPod({ ...base, edgeNeighbours: 1, ringRoadTiles: 3 }), scoreExtensionPod({ ...base, edgeNeighbours: 1 }));
    assert.isAbove(scoreExtensionPod({ ...base, edgeNeighbours: 1, ringPlannedTiles: 3 }), scoreExtensionPod({ ...base, edgeNeighbours: 1 }));
    assert.isBelow(scoreExtensionPod({ ...base, edgeNeighbours: 1, ringSwampTiles: 3 }), scoreExtensionPod({ ...base, edgeNeighbours: 1 }));
    assert.isBelow(scoreExtensionPod({ ...base, edgeNeighbours: 1, spawnDistance: 30 }), scoreExtensionPod({ ...base, edgeNeighbours: 1 }));
    assert.isBelow(scoreExtensionPod({ ...base, edgeNeighbours: 1, sourceDistance: 40 }), scoreExtensionPod({ ...base, edgeNeighbours: 1 }));
    //Reused road beats planned road: one is already paid for, the other is only promised.
    assert.isAbove(
      scoreExtensionPod({ ...base, edgeNeighbours: 0, ringRoadTiles: 2 }),
      scoreExtensionPod({ ...base, edgeNeighbours: 0, ringPlannedTiles: 2 })
    );
  });

  it("prices a ring tile beside a road above a ring tile on one, per contact", () => {
    assert.isBelow(
      scoreExtensionPod({ ...base, edgeNeighbours: 1, ringParallelRoads: 4 }),
      scoreExtensionPod({ ...base, edgeNeighbours: 1 })
    );
    //A rung costs more than reusing a tile earns, or an overlapping phase could be outbid by a laddering
    //one that happens to touch the road in a couple of places.
    assert.isAtLeast(EXTENSION_POD_SCORE_WEIGHTS.parallelRoad, EXTENSION_POD_SCORE_WEIGHTS.roadReuse);
    assert.isAbove(EXTENSION_POD_SCORE_WEIGHTS.parallelRoad, EXTENSION_POD_SCORE_WEIGHTS.plannedRoad);
    //...but tessellation still outranks it per unit, so the cluster never breaks up to dodge a rung.
    assert.isAbove(EXTENSION_POD_SCORE_WEIGHTS.adjacent, EXTENSION_POD_SCORE_WEIGHTS.parallelRoad);
  });

  it("stamps the plan version the parallel-road scoring needs", () => {
    //Bumped to 3 with the parallel penalty: every v2 plan was chosen blind to it, so it must replan.
    assert.equal(EXTENSION_POD_PLAN_VERSION, 3);
  });
});

/*
  The geometry the screenshot was full of: an exit road running down a diagonal, and a lattice phase that
  either lands its pod rings on it or one tile beside it. x+y === 52 is a road line of the phase whose
  centres include (25,25) - the pod's whole north-east ring edge sits on it - and is off-lattice for the
  phase one step over, whose centre (26,25) puts five ring tiles alongside it instead.
*/
const DIAGONAL_ROAD = new Set(
  Array.from({ length: 13 }, (_, i) => packRoadPos(20 + i, 32 - i))
);

describe("extension pod lattice phase snapping", () => {
  it("counts no parallel contact for the pod whose ring edge is the road", () => {
    assert.deepEqual(
      sortPacked(getPodNetworkRingTiles(25, 25, DIAGONAL_ROAD)),
      pack([[27, 25], [26, 26], [25, 27]])
    );
    //Zero, and that is the point of using orthogonal contacts: the road keeps going diagonally past
    //(27,25) and (25,27), which Chebyshev adjacency would have scored as a duplicate road.
    assert.equal(countPodParallelRoads(25, 25, DIAGONAL_ROAD), 0);
    assert.isEmpty(getPodParallelRingTiles(25, 25, DIAGONAL_ROAD));
  });

  it("counts the off-by-one pod's whole ladder", () => {
    assert.isEmpty(getPodNetworkRingTiles(26, 25, DIAGONAL_ROAD));
    //Five ring tiles run alongside the road without ever reaching it, each of them wedged between two
    //of its tiles at once - ten rungs for zero reuse. That is the ladder from the screenshot.
    assert.deepEqual(
      sortPacked(getPodParallelRingTiles(26, 25, DIAGONAL_ROAD)),
      pack([[28, 25], [27, 26], [27, 24], [25, 26], [26, 27]])
    );
    assert.equal(countPodParallelRoads(26, 25, DIAGONAL_ROAD), 10);
  });

  it("scores the overlapping pod above the parallel one, even when the parallel one is closer", () => {
    const flat = { ringRoadTiles: 0, ringPlannedTiles: 0, ringParallelRoads: 0, ringSwampTiles: 0, spawnDistance: 10, sourceDistance: 20 };
    const podInput = (x: number, y: number, extra: Partial<typeof flat> = {}) => ({
      ...flat,
      edgeNeighbours: 1,
      ringPlannedTiles: getPodNetworkRingTiles(x, y, DIAGONAL_ROAD).length,
      ringParallelRoads: countPodParallelRoads(x, y, DIAGONAL_ROAD),
      ...extra
    });

    const overlapping = scoreExtensionPod(podInput(25, 25));
    assert.isAbove(overlapping, scoreExtensionPod(podInput(26, 25)));
    //And it still wins when the ladder is handed a real distance advantage - five tiles of plain closer
    //to both the spawn and the sources. Distance used to be exactly what let the wrong phase through.
    assert.isAbove(overlapping, scoreExtensionPod(podInput(26, 25, { spawnDistance: 0, sourceDistance: 10 })));
  });
});

const plan = (pods: { order: number; x: number; y: number; built?: boolean }[]): ExtensionPodPlanMemory => ({
  anchorX: 0,
  anchorY: 0,
  phase: 0,
  pods: pods.map(pod => ({ id: `pod-${pod.order}`, score: 0, ...pod })),
  roadTiles: [],
  planned: 1
});

describe("extension pod flags", () => {
  it("names flags room-first so they stay unique across the world", () => {
    assert.equal(extensionPodFlagName("W1N4", 0), "build:extension:W1N4-pod0");
    assert.equal(extensionPodFlagName("W1N4", 11), "build:extension:W1N4-pod11");
    assert.equal(extensionPodFlagName("W2N4", 3), "build:extension:W2N4-pod3");
    assert.equal(EXTENSION_POD_FLAG_PREFIX, "build:extension:");
  });

  it("only claims this room's pod flags, never a hand placed build flag", () => {
    assert.isTrue(isExtensionPodFlagName("W1N4", "build:extension:W1N4-pod0"));
    [
      "build:extension:W2N4-pod0", //Another room's plan.
      "build:extension:7f3a", //A manual build flag, the shape BuildFlag documents.
      "build:tower:W1N4-pod0", //Manual, different structure.
      "build:extension:", "home:W1N4", "exit:W1N4:N:0", "harvest:W1N4:0"
    ].forEach(name => assert.isFalse(isExtensionPodFlagName("W1N4", name), name));
  });

  it("colours planned white/blue, the next pod orange, a finished pod green", () => {
    assert.equal(getExtensionPodFlagColor(ExtensionPodFlagState.Planned), globals.COLOR_WHITE);
    assert.equal(getExtensionPodFlagColor(ExtensionPodFlagState.Next), globals.COLOR_ORANGE);
    assert.equal(getExtensionPodFlagColor(ExtensionPodFlagState.Built), globals.COLOR_GREEN);

    const built = { id: "pod-0", x: 10, y: 10, order: 0, score: 0, built: true };
    assert.equal(getExtensionPodFlagState(built, 1), ExtensionPodFlagState.Built);
    const next = { id: "pod-1", x: 12, y: 12, order: 1, score: 0 };
    assert.equal(getExtensionPodFlagState(next, 1), ExtensionPodFlagState.Next);
    assert.equal(getExtensionPodFlagState(next, 0), ExtensionPodFlagState.Planned);
  });

  it("wants one flag per pod, on the centre, coloured by build state", () => {
    const podPlan = plan([
      { order: 0, x: 10, y: 10, built: true },
      { order: 1, x: 12, y: 12 },
      { order: 2, x: 14, y: 14 }
    ]);
    assert.equal(getNextExtensionPod(podPlan)?.order, 1);
    const desired = getDesiredExtensionPodFlags("W1N4", podPlan);
    assert.deepEqual(desired.map(f => f.name),
      ["build:extension:W1N4-pod0", "build:extension:W1N4-pod1", "build:extension:W1N4-pod2"]);
    assert.deepEqual(desired.map(f => [f.x, f.y]), [[10, 10], [12, 12], [14, 14]]);
    assert.deepEqual(desired.map(f => f.color), [globals.COLOR_GREEN, globals.COLOR_ORANGE, globals.COLOR_WHITE]);
    //One flag family on the map: the secondary never changes, only the primary carries state.
    assert.deepEqual(desired.map(f => f.secondaryColor), [globals.COLOR_BLUE, globals.COLOR_BLUE, globals.COLOR_BLUE]);
    //Never more flags than pods, and never more pods than the RCL8 cap allows.
    assert.isAtMost(desired.length, EXTENSION_POD_MAX);
  });

  it("marks the whole plan built once the last pod goes up", () => {
    const podPlan = plan([{ order: 0, x: 10, y: 10, built: true }, { order: 1, x: 12, y: 12, built: true }]);
    assert.isUndefined(getNextExtensionPod(podPlan));
    assert.deepEqual(getDesiredExtensionPodFlags("W1N4", podPlan).map(f => f.color),
      [globals.COLOR_GREEN, globals.COLOR_GREEN]);
  });

  it("orphans only this room's pod flags that the plan no longer wants", () => {
    const desired = ["build:extension:W1N4-pod0", "build:extension:W1N4-pod1"];
    const existing = [
      "build:extension:W1N4-pod0", //Still wanted.
      "build:extension:W1N4-pod7", //Plan shrank under a replan.
      "build:extension:W2N4-pod0", //Another room's plan.
      "build:extension:7f3a", //Hand placed, must survive.
      "build:tower:abcd", "home:W1N4", "exit:W1N4:N:0"
    ];
    assert.deepEqual(findOrphanExtensionPodFlags("W1N4", desired, existing), ["build:extension:W1N4-pod7"]);
    //A flag the plan wants but that isn't standing yet is a create, never an orphan.
    assert.notInclude(findOrphanExtensionPodFlags("W1N4", desired, existing), "build:extension:W1N4-pod1");
  });
});

/*
  A fake room with just enough surface for the two world-facing helpers: flags plus createFlag for the
  sync, and lookForAt/createConstructionSite/getTerrain for the site placement.
*/
function fakeRoom(name: string, podPlan: ExtensionPodPlanMemory, flags: { name: string; x: number; y: number; color?: number; secondaryColor?: number }[] = []) {
  const created: { name: string; x: number; y: number; color: number; secondaryColor: number }[] = [];
  const removed: string[] = [];
  const moved: { name: string; x: number; y: number }[] = [];
  const recoloured: { name: string; color: number; secondaryColor: number }[] = [];
  const sites: { x: number; y: number; structureType: string }[] = [];
  const structures: { x: number; y: number; structureType: string }[] = [];
  const walls: number[] = [];

  const standing = flags.map(flag => ({
    name: flag.name,
    pos: { x: flag.x, y: flag.y, roomName: name },
    color: flag.color ?? globals.COLOR_WHITE,
    secondaryColor: flag.secondaryColor ?? globals.COLOR_BLUE,
    remove: () => { removed.push(flag.name); },
    setPosition: (x: number, y: number) => { moved.push({ name: flag.name, x, y }); },
    setColor: (color: number, secondaryColor: number) => { recoloured.push({ name: flag.name, color, secondaryColor }); }
  }));

  const room = {
    name,
    memory: { extensionPods: podPlan },
    find: () => standing,
    getTerrain: () => ({ get: (x: number, y: number) => (walls.includes(packRoadPos(x, y)) ? globals.TERRAIN_MASK_WALL : 0) }),
    lookForAt: (what: string, x: number, y: number) =>
      (what === globals.LOOK_STRUCTURES ? structures : sites).filter(item => item.x === x && item.y === y),
    createFlag: (x: number, y: number, flagName: string, color: number, secondaryColor: number) => {
      created.push({ name: flagName, x, y, color, secondaryColor });
      return flagName;
    },
    createConstructionSite: (x: number, y: number, structureType: string) => {
      sites.push({ x, y, structureType });
      return globals.OK;
    }
  };
  return { room, created, removed, moved, recoloured, sites, structures, walls };
}

describe("extension pod flag sync", () => {
  beforeEach(() => {
    globals.FIND_FLAGS = 10;
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_EXTENSION = "extension";
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.OK = 0;
    globals.Game = { time: 0, flags: {} };
  });

  it("creates the missing flags and leaves the standing ones alone", () => {
    const { room, created, removed, moved } = fakeRoom("W1N4", plan([{ order: 0, x: 10, y: 10 }, { order: 1, x: 12, y: 12 }]),
      [{ name: "build:extension:W1N4-pod0", x: 10, y: 10, color: globals.COLOR_ORANGE }]);
    syncExtensionPodFlags(room as any);
    assert.deepEqual(created.map(f => f.name), ["build:extension:W1N4-pod1"]);
    assert.deepEqual(created[0], { name: "build:extension:W1N4-pod1", x: 12, y: 12, color: globals.COLOR_WHITE, secondaryColor: globals.COLOR_BLUE });
    assert.isEmpty(removed);
    assert.isEmpty(moved);
  });

  it("recolours a flag whose pod changed state instead of churning it", () => {
    const { room, created, recoloured } = fakeRoom("W1N4", plan([{ order: 0, x: 10, y: 10, built: true }]),
      [{ name: "build:extension:W1N4-pod0", x: 10, y: 10, color: globals.COLOR_ORANGE }]);
    syncExtensionPodFlags(room as any);
    assert.deepEqual(recoloured, [{ name: "build:extension:W1N4-pod0", color: globals.COLOR_GREEN, secondaryColor: globals.COLOR_BLUE }]);
    assert.isEmpty(created);
  });

  it("drags a standing flag to its new centre", () => {
    const { room, moved, created } = fakeRoom("W1N4", plan([{ order: 0, x: 10, y: 10 }]),
      [{ name: "build:extension:W1N4-pod0", x: 30, y: 30, color: globals.COLOR_ORANGE }]);
    syncExtensionPodFlags(room as any);
    assert.deepEqual(moved, [{ name: "build:extension:W1N4-pod0", x: 10, y: 10 }]);
    assert.isEmpty(created);
  });

  it("removes pod flags the plan dropped and never touches a manual build flag", () => {
    const { room, removed } = fakeRoom("W1N4", plan([{ order: 0, x: 10, y: 10 }]), [
      { name: "build:extension:W1N4-pod0", x: 10, y: 10 },
      { name: "build:extension:W1N4-pod4", x: 20, y: 20 },
      { name: "build:extension:7f3a", x: 22, y: 22 },
      { name: "build:extension:W2N4-pod0", x: 24, y: 24 },
      { name: "home:W1N4", x: 25, y: 25 }
    ]);
    syncExtensionPodFlags(room as any);
    assert.deepEqual(removed, ["build:extension:W1N4-pod4"]);
  });

  it("only syncs on the throttle tick unless forced, and does nothing without a plan", () => {
    globals.Game.time = 3;
    const { room, created } = fakeRoom("W1N4", plan([{ order: 0, x: 10, y: 10 }]));
    syncExtensionPodFlags(room as any);
    assert.isEmpty(created);
    syncExtensionPodFlags(room as any, true);
    assert.lengthOf(created, 1);
    assert.equal(EXTENSION_POD_FLAG_SYNC_INTERVAL, 25);

    const unplanned = fakeRoom("W1N4", plan([]));
    (unplanned.room.memory as any).extensionPods = undefined;
    syncExtensionPodFlags(unplanned.room as any, true);
    assert.isEmpty(unplanned.created);
  });
});

describe("extension pod construction", () => {
  beforeEach(() => {
    globals.FIND_FLAGS = 10;
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_EXTENSION = "extension";
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.OK = 0;
    globals.Game = { time: 0, flags: {} };
  });

  it("places 5 extension sites and 8 road sites, then reports the pod complete", () => {
    const { room, sites } = fakeRoom("W1N4", plan([{ order: 0, x: 25, y: 25 }]));
    assert.equal(placeExtensionPodSites(room as any, { x: 25, y: 25 }), 0);
    const extensions = sites.filter(site => site.structureType === "extension").map(site => packRoadPos(site.x, site.y));
    const roads = sites.filter(site => site.structureType === "road").map(site => packRoadPos(site.x, site.y));
    assert.deepEqual(sortPacked(extensions), sortPacked(getPodExtensionTiles(25, 25)));
    //8 unique ring tiles, not the 12 the ring generator yields.
    assert.lengthOf(roads, 8);
    assert.deepEqual(sortPacked(roads), sortPacked(getPodRoadTiles(25, 25)));
    assert.isTrue(isExtensionPodBuilt(room as any, { x: 25, y: 25 }));
  });

  it("creates ring road sites before extension sites so builders see roads first", () => {
    const { room, sites } = fakeRoom("W1N4", plan([{ order: 0, x: 25, y: 25 }]));
    placeExtensionPodSites(room as any, { x: 25, y: 25 });
    const firstExtension = sites.findIndex(site => site.structureType === "extension");
    const lastRoad = sites.map(site => site.structureType).lastIndexOf("road");
    assert.isAbove(firstExtension, -1);
    assert.isAbove(lastRoad, -1);
    //Every road site must be pushed before any extension site.
    assert.isBelow(lastRoad, firstExtension);
  });

  it("skips tiles that already carry the right structure or site", () => {
    const { room, sites, structures } = fakeRoom("W1N4", plan([{ order: 0, x: 25, y: 25 }]));
    structures.push({ x: 25, y: 25, structureType: "extension" }, { x: 27, y: 25, structureType: "road" });
    placeExtensionPodSites(room as any, { x: 25, y: 25 });
    assert.lengthOf(sites.filter(site => site.structureType === "extension"), 4); //Centre already stands.
    assert.lengthOf(sites.filter(site => site.structureType === "road"), 7); //One ring tile already paved.
  });

  it("treats a tile nothing can ever be built on as satisfied rather than outstanding work", () => {
    const { room, walls } = fakeRoom("W1N4", plan([{ order: 0, x: 25, y: 25 }]));
    walls.push(packRoadPos(26, 25));
    assert.equal(getPodExtensionState(room as any, packRoadPos(26, 25)), PodExtensionState.Satisfied);
    //A blocked tile must not pin the pod as unbuilt, or the build queue would retry it forever.
    assert.equal(placeExtensionPodSites(room as any, { x: 25, y: 25 }), 0);
    assert.isTrue(isExtensionPodBuilt(room as any, { x: 25, y: 25 }));
  });

  it("advances to the next unbuilt pod and refreshes stale built flags from the world", () => {
    const podPlan = plan([{ order: 0, x: 25, y: 25 }, { order: 1, x: 27, y: 27 }]);
    const { room, structures } = fakeRoom("W1N4", podPlan);
    assert.equal(getNextExtensionPod(podPlan)?.order, 0);
    getPodExtensionTiles(25, 25).forEach(packed =>
      structures.push({ x: unpackRoadPosX(packed), y: unpackRoadPosY(packed), structureType: "extension" }));
    refreshExtensionPodPlan(room as any, podPlan);
    assert.isTrue(podPlan.pods[0].built);
    assert.equal(getNextExtensionPod(podPlan)?.order, 1);
  });
});

/*
  A room with a built diagonal road, a pod plan that reuses it, and a pile of road construction sites -
  the state a version bump lands in. Only construction sites carry a remove(), so the test can't even
  express demolishing a structure.
*/
function cleanupFakeRoom(plannedTiles: number[], builtRoads: number[], siteTiles: { packed: number; structureType?: string }[]) {
  const removed: number[] = [];
  const structures = builtRoads.map(packed => ({
    structureType: "road",
    pos: { x: unpackRoadPosX(packed), y: unpackRoadPosY(packed) }
  }));
  const sites = siteTiles.map(({ packed, structureType }) => ({
    structureType: structureType ?? "road",
    pos: { x: unpackRoadPosX(packed), y: unpackRoadPosY(packed) },
    remove: () => { removed.push(packed); return globals.OK; }
  }));
  const room = {
    name: "W1N4",
    memory: { exitRoads: { plannedTiles } },
    find: (type: number) => (type === globals.FIND_STRUCTURES ? structures : type === globals.FIND_CONSTRUCTION_SITES ? sites : [])
  };
  return { room, removed };
}

describe("extension pod replan cleanup", () => {
  beforeEach(() => {
    globals.FIND_STRUCTURES = 107;
    globals.FIND_CONSTRUCTION_SITES = 111;
    globals.STRUCTURE_ROAD = "road";
    globals.OK = 0;
  });

  it("cancels the road sites laddering the network and nothing else", () => {
    const road = [...DIAGONAL_ROAD];
    const podPlan = plan([{ order: 0, x: 25, y: 25 }]);
    podPlan.roadTiles = getPodRoadTiles(25, 25);
    const rung = packRoadPos(27, 26); //Off the new lattice, wedged between two road tiles: the zig-zag.
    const onPlan = packRoadPos(26, 24); //A ring tile of the new plan - this one is the work we want done.
    const loner = packRoadPos(10, 10); //Unclaimed but touching nothing: somebody's shortcut, left alone.
    const extension = packRoadPos(26, 27); //A second rung by geometry, but not a road: never a candidate.
    const { room, removed } = cleanupFakeRoom([], road, [
      { packed: rung }, { packed: onPlan }, { packed: loner }, { packed: extension, structureType: "extension" }
    ]);

    assert.equal(cleanupStaleExtensionPodRoadSites(room as any, podPlan), 1);
    assert.deepEqual(removed, [rung]);
  });

  it("keeps a site another layer planned, even when it runs beside a road", () => {
    const rung = packRoadPos(27, 26);
    const podPlan = plan([{ order: 0, x: 25, y: 25 }]);
    podPlan.roadTiles = getPodRoadTiles(25, 25);
    //The exit/early/circulation layers own their routes: the pod planner adapts to them, never the reverse.
    const { room, removed } = cleanupFakeRoom([rung], [...DIAGONAL_ROAD], [{ packed: rung }]);
    assert.equal(cleanupStaleExtensionPodRoadSites(room as any, podPlan), 0);
    assert.isEmpty(removed);
  });

  it("does not let two rungs of the same ladder justify each other", () => {
    //Neither site is on a built or planned road, so with no third road nearby there is nothing to be
    //parallel *to* - sites are deliberately excluded from the reference set.
    const podPlan = plan([]);
    const { room, removed } = cleanupFakeRoom([], [], [{ packed: packRoadPos(10, 10) }, { packed: packRoadPos(10, 11) }]);
    assert.equal(cleanupStaleExtensionPodRoadSites(room as any, podPlan), 0);
    assert.isEmpty(removed);
  });
});

/*
  A whole-planner room: 50x50 of plain, a spawn, one source, a controller, and one planned exit road
  running down a diagonal. Enough surface for planExtensionPods, which is the only place the 8 phases are
  actually compared against each other.
*/
function plannerRoom(plannedTiles: number[], spawn: [number, number], source: [number, number], controller: [number, number]) {
  const at = ([x, y]: [number, number]) => ({ pos: { x, y, roomName: "W1N4" } });
  const room = {
    name: "W1N4",
    memory: { exitRoads: { plannedTiles, routes: [], planned: 1 } } as any,
    controller: at(controller),
    getTerrain: () => ({ get: () => 0 }),
    find: (type: number) => (type === globals.FIND_SOURCES ? [at(source)] : []),
    lookForAt: () => []
  };
  return { room, spawn: at(spawn) };
}

describe("extension pod phase selection", () => {
  beforeEach(() => {
    globals.FIND_SOURCES = 105;
    globals.FIND_MINERALS = 116;
    globals.FIND_STRUCTURES = 107;
    globals.FIND_CONSTRUCTION_SITES = 111;
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.TERRAIN_MASK_WALL = 1;
    globals.TERRAIN_MASK_SWAMP = 2;
    globals.OK = 0;
    globals.Game = { time: 1000, flags: {} };
    globals.PathFinder = {
      CostMatrix: class {
        data = new Uint8Array(2500);
        get(x: number, y: number) { return this.data[y * 50 + x]; }
        set(x: number, y: number, value: number) { this.data[y * 50 + x] = value; }
      }
    };
  });

  it("anchors the lattice on the exit road instead of one tile beside it", () => {
    //The road an exit route would leave behind: a clean diagonal across the room, x+y === 52.
    const exitRoad = Array.from({ length: 25 }, (_, i) => packRoadPos(14 + i, 38 - i));
    const { room, spawn } = plannerRoom(exitRoad, [25, 25], [40, 12], [10, 40]);

    const podPlan = planExtensionPods(room as any, spawn as any);
    assert.isNotEmpty(podPlan.pods);

    const network = new Set(exitRoad);
    const ring = new Set(podPlan.roadTiles);
    const overlap = [...ring].filter(packed => network.has(packed));
    const parallel = podPlan.pods.reduce(
      (out, pod) => out.concat(getPodParallelRingTiles(pod.x, pod.y, network)), [] as number[]);

    //Snapped: pod rings run *on* the exit road, and not one ring tile is laid alongside it.
    assert.isAbove(overlap.length, 2, "the plan should reuse at least a whole diamond edge of the exit road");
    assert.isEmpty(parallel, "no pod ring may run parallel to the exit road");
    //A road line of the chosen lattice is (x-ax)+(y-ay) === 2 (mod 4), so this is the same claim as a
    //phase id: the anchor has to be one the road diagonal belongs to.
    assert.equal(((52 - podPlan.anchorX - podPlan.anchorY) % 4 + 4) % 4, 2);
    assert.equal(podPlan.version, EXTENSION_POD_PLAN_VERSION);
  });

  it("snaps to a staircase route too, where the pre-v3 weights laddered", () => {
    /*
      Real exit routes are rarely a clean diagonal. PathFinder returns a staircase - a sideways step
      every other tile - and a staircase belongs to two lattice diagonals at once, which is exactly the
      ambiguity the old weights lost: they took the phase that read 7 reused tiles and one ring tile laid
      alongside the route. The overlap term settles it at 10 reused and no ladder.
    */
    const staircase: number[] = [];
    for (let step = 0; step < 10; step++){
      staircase.push(packRoadPos(27 + step, 27 + step), packRoadPos(28 + step, 27 + step));
    }
    const { room, spawn } = plannerRoom(staircase, [25, 25], [45, 45], [10, 10]);
    const podPlan = planExtensionPods(room as any, spawn as any);

    const network = new Set(staircase);
    const overlap = podPlan.roadTiles.filter(packed => network.has(packed));
    const parallel = podPlan.pods.reduce(
      (out, pod) => out.concat(getPodParallelRingTiles(pod.x, pod.y, network)), [] as number[]);
    assert.isEmpty(parallel);
    assert.isAtLeast(overlap.length, 8);
  });

  it("puts extensions near the source without buying that with a parallel ring", () => {
    const exitRoad = Array.from({ length: 25 }, (_, i) => packRoadPos(14 + i, 38 - i));
    const { room, spawn } = plannerRoom(exitRoad, [25, 25], [40, 12], [10, 40]);
    const podPlan = planExtensionPods(room as any, spawn as any);

    //The source pull is still on - the cluster leans towards it rather than sprawling the other way.
    const meanX = podPlan.pods.reduce((sum, pod) => sum + pod.x, 0) / podPlan.pods.length;
    const meanY = podPlan.pods.reduce((sum, pod) => sum + pod.y, 0) / podPlan.pods.length;
    assert.isAbove(meanX, 25);
    assert.isBelow(meanY, 25);
  });
});
