import { assert } from "chai";
import {
  chebyshevDistance,
  computeWalkCostMap,
  findOptimalSpawnTile,
  isEdgeTile,
  isValidSpawnTile,
  ROOM_SIZE,
  spawnMarkerName,
  spawnStructureName,
  tileIndex,
  UNREACHABLE_COST
} from "../../src/utils/spawnPlacement";

const PLAIN = 0;
const WALL = 1;
const SWAMP = 2;

function makeTerrain(fill = PLAIN): number[] {
  return new Array<number>(ROOM_SIZE * ROOM_SIZE).fill(fill);
}

function setTile(grid: number[], x: number, y: number, value: number): void {
  grid[tileIndex(x, y)] = value;
}

function getter(grid: number[]) {
  return (x: number, y: number) => grid[tileIndex(x, y)];
}

describe("spawnPlacement", () => {
  it("names the marker and spawn uniquely per room", () => {
    assert.equal(spawnMarkerName("sim"), "place-spawn:sim");
    assert.equal(spawnStructureName("sim"), "Spawn_sim");
    assert.equal(spawnMarkerName("W1N1"), "place-spawn:W1N1");
  });

  it("rejects edges, walls, and tiles with no walkable neighbor", () => {
    const terrain = makeTerrain(PLAIN);
    setTile(terrain, 10, 10, WALL);
    const getTerrain = getter(terrain);

    assert.isTrue(isEdgeTile(0, 25));
    assert.isTrue(isEdgeTile(49, 25));
    assert.isFalse(isValidSpawnTile(0, 25, getTerrain));
    assert.isFalse(isValidSpawnTile(10, 10, getTerrain));
    assert.isTrue(isValidSpawnTile(12, 12, getTerrain));

    const island = makeTerrain(WALL);
    setTile(island, 20, 20, PLAIN);
    assert.isFalse(isValidSpawnTile(20, 20, getter(island)));
  });

  it("computes walk costs around walls rather than chebyshev shortcuts", () => {
    const terrain = makeTerrain(PLAIN);
    for (let x = 0; x < 45; x++) {
      setTile(terrain, x, 25, WALL);
    }
    const getTerrain = getter(terrain);
    const origin = { x: 10, y: 10 };
    const map = computeWalkCostMap(origin, getTerrain);

    const northOfWall = map[tileIndex(10, 24)];
    const southOfWall = map[tileIndex(10, 26)];
    assert.notEqual(northOfWall, UNREACHABLE_COST);
    assert.notEqual(southOfWall, UNREACHABLE_COST);
    assert.isAbove(southOfWall, northOfWall + 20);
    assert.isAbove(southOfWall, chebyshevDistance(10, 10, 10, 26));
  });

  it("picks a spawn tile that minimizes total walk cost to all sources and the controller", () => {
    const terrain = makeTerrain(PLAIN);
    const getTerrain = getter(terrain);
    const goals = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 25, y: 40 }
    ];

    const result = findOptimalSpawnTile({ getTerrain, goals });
    assert.isNotNull(result);
    assert.isFalse(result!.usedChebyshev);

    const sample = [
      { x: 5, y: 5 },
      { x: 44, y: 44 },
      { x: 25, y: 5 },
      { x: 2, y: 25 }
    ];
    for (const tile of sample) {
      const maps = goals.map(goal => computeWalkCostMap(goal, getTerrain));
      const sampleCost = maps.reduce((sum, map) => sum + map[tileIndex(tile.x, tile.y)], 0);
      assert.isAtMost(result!.cost, sampleCost);
    }

    assert.isAtLeast(result!.x, 1);
    assert.isAtMost(result!.x, 48);
    assert.isAtLeast(result!.y, 1);
    assert.isAtMost(result!.y, 48);
    // Geometric median of the three goals sits in the upper-middle of the room.
    assert.isAbove(result!.x, 15);
    assert.isBelow(result!.x, 35);
    assert.isAbove(result!.y, 12);
    assert.isBelow(result!.y, 30);
  });

  it("routes around a wall gap instead of sitting on the chebyshev midpoint", () => {
    // Only a corridor is walkable: across y=10 then down x=40. The unique walk
    // median of the three corridor ends is the junction, not a chebyshev center.
    const terrain = makeTerrain(WALL);
    for (let x = 10; x <= 40; x++) {
      setTile(terrain, x, 10, PLAIN);
    }
    for (let y = 10; y <= 40; y++) {
      setTile(terrain, 40, y, PLAIN);
    }
    const getTerrain = getter(terrain);
    const junction = { x: 40, y: 10 };
    const goals = [{ x: 10, y: 10 }, junction, { x: 40, y: 40 }];

    const result = findOptimalSpawnTile({
      getTerrain,
      goals,
      isSpawnBlocked: (x, y) => goals.some(goal => goal.x === x && goal.y === y)
    });
    assert.isNotNull(result);
    assert.isFalse(result!.usedChebyshev);
    assert.isBelow(chebyshevDistance(result!.x, result!.y, junction.x, junction.y), 3);
    assert.isTrue(isValidSpawnTile(result!.x, result!.y, getTerrain));
  });

  it("skips spawn-blocked tiles and falls back to chebyshev when walks are impossible", () => {
    const terrain = makeTerrain(PLAIN);
    const blocked = new Set([tileIndex(25, 20)]);
    const goals = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 25, y: 40 }
    ];
    const result = findOptimalSpawnTile({
      getTerrain: getter(terrain),
      goals,
      isSpawnBlocked: (x, y) => blocked.has(tileIndex(x, y))
    });
    assert.isNotNull(result);
    assert.isFalse(blocked.has(tileIndex(result!.x, result!.y)));

    const isolated = makeTerrain(WALL);
    setTile(isolated, 20, 20, PLAIN);
    setTile(isolated, 21, 20, PLAIN);
    setTile(isolated, 20, 21, PLAIN);
    setTile(isolated, 21, 21, PLAIN);
    const boxed = findOptimalSpawnTile({
      getTerrain: getter(isolated),
      goals: [
        { x: 2, y: 2 },
        { x: 47, y: 47 }
      ]
    });
    assert.isNotNull(boxed);
    assert.isTrue(boxed!.usedChebyshev);
  });

  it("charges swamp tiles more than plains, matching PathFinder swampCost", () => {
    const terrain = makeTerrain(PLAIN);
    for (let x = 15; x <= 40; x++) {
      for (let y = 8; y <= 42; y++) {
        setTile(terrain, x, y, SWAMP);
      }
    }
    const getTerrain = getter(terrain);
    const map = computeWalkCostMap({ x: 10, y: 25 }, getTerrain);
    const acrossSwamp = map[tileIndex(45, 25)];
    const aroundNorth = map[tileIndex(45, 2)];
    assert.notEqual(acrossSwamp, UNREACHABLE_COST);
    assert.notEqual(aroundNorth, UNREACHABLE_COST);
    assert.isAbove(acrossSwamp, aroundNorth);
  });
});
