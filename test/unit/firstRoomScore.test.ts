import { assert } from "chai";
import {
  CHEBYSHEV_PENALTY,
  MIN_SOURCES,
  SCORE_EPSILON,
  averageMidpoint,
  compareFirstRoomScores,
  energyPerTick,
  rankFirstRooms,
  scoreFirstRoom
} from "../../src/utils/firstRoomScore";
import { ROOM_SIZE, tileIndex } from "../../src/utils/spawnPlacement";

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

describe("firstRoomScore", () => {
  it("rejects rooms with fewer than 2 sources", () => {
    const getTerrain = getter(makeTerrain());
    const one = scoreFirstRoom({
      getTerrain,
      sources: [{ x: 10, y: 10 }],
      controller: { x: 40, y: 40 }
    });
    const none = scoreFirstRoom({
      getTerrain,
      sources: [],
      controller: { x: 40, y: 40 }
    });

    assert.isFalse(one.eligible);
    assert.isFalse(none.eligible);
    assert.equal(one.sourceCount, 1);
    assert.equal(none.score, 0);
    assert.match(one.reason || "", /sources/);
    assert.equal(MIN_SOURCES, 2);
  });

  it("rejects rooms without a controller or owned by another user/NPC", () => {
    const getTerrain = getter(makeTerrain());
    const sources = [
      { x: 10, y: 10 },
      { x: 12, y: 10 }
    ];
    const noController = scoreFirstRoom({ getTerrain, sources });
    const npc = scoreFirstRoom({
      getTerrain,
      sources,
      controller: { x: 20, y: 20 },
      owner: "Invader",
      my: false
    });
    const mine = scoreFirstRoom({
      getTerrain,
      sources,
      controller: { x: 20, y: 20 },
      owner: "me",
      my: true
    });

    assert.isFalse(noController.eligible);
    assert.match(noController.reason || "", /controller/);
    assert.isFalse(npc.eligible);
    assert.match(npc.reason || "", /owned/);
    assert.isTrue(mine.eligible);
  });

  it("uses E = sources * 10 and score = E / (D + epsilon)", () => {
    const scored = scoreFirstRoom({
      getTerrain: getter(makeTerrain()),
      sources: [
        { x: 20, y: 20 },
        { x: 24, y: 20 }
      ],
      controller: { x: 22, y: 24 }
    });
    assert.isTrue(scored.eligible);
    assert.equal(scored.energyPerTick, energyPerTick(2));
    assert.equal(scored.energyPerTick, 20);
    assert.equal(scored.score, scored.energyPerTick / (scored.walkCost + SCORE_EPSILON));
    assert.isDefined(scored.midpoint);
  });

  it("averages sources and the controller for the midpoint, ignoring extra mineral points", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 20, y: 40 }
    ];
    assert.deepEqual(averageMidpoint(points), { x: 20, y: 20 });

    const scored = scoreFirstRoom({
      getTerrain: getter(makeTerrain()),
      sources: [
        { x: 10, y: 10 },
        { x: 30, y: 10 }
      ],
      controller: { x: 20, y: 40 }
    });
    assert.deepEqual(scored.midpoint, { x: 20, y: 20 });
  });

  it("prefers a compact layout (lower D) when source count is equal", () => {
    const getTerrain = getter(makeTerrain());
    const compact = scoreFirstRoom({
      getTerrain,
      sources: [
        { x: 22, y: 22 },
        { x: 24, y: 22 }
      ],
      controller: { x: 23, y: 24 }
    });
    const sprawled = scoreFirstRoom({
      getTerrain,
      sources: [
        { x: 5, y: 5 },
        { x: 45, y: 5 }
      ],
      controller: { x: 25, y: 45 }
    });

    assert.equal(compact.energyPerTick, sprawled.energyPerTick);
    assert.isBelow(compact.walkCost, sprawled.walkCost);
    assert.isAbove(compact.score, sprawled.score);
  });

  it("generally ranks 3-source rooms above 2-source rooms with similar sprawl", () => {
    const getTerrain = getter(makeTerrain());
    const two = scoreFirstRoom({
      getTerrain,
      sources: [
        { x: 20, y: 20 },
        { x: 28, y: 20 }
      ],
      controller: { x: 24, y: 28 }
    });
    const three = scoreFirstRoom({
      getTerrain,
      sources: [
        { x: 20, y: 20 },
        { x: 28, y: 20 },
        { x: 24, y: 23 }
      ],
      controller: { x: 24, y: 28 }
    });

    assert.equal(two.energyPerTick, 20);
    assert.equal(three.energyPerTick, 30);
    assert.isAbove(three.score, two.score);
  });

  it("increases D when walls force a longer walk from the midpoint", () => {
    const open = makeTerrain();
    const walled = makeTerrain();
    for (let y = 0; y < ROOM_SIZE; y++) {
      if (y === 49) continue;
      setTile(walled, 25, y, WALL);
    }
    const sources = [
      { x: 10, y: 10 },
      { x: 40, y: 10 }
    ];
    const controller = { x: 10, y: 40 };
    const openScore = scoreFirstRoom({ getTerrain: getter(open), sources, controller });
    const wallScore = scoreFirstRoom({ getTerrain: getter(walled), sources, controller });

    assert.isTrue(openScore.eligible);
    assert.isTrue(wallScore.eligible);
    assert.isFalse(openScore.usedChebyshev);
    assert.isAbove(wallScore.walkCost, openScore.walkCost);
    assert.isBelow(wallScore.score, openScore.score);
  });

  it("charges swamp tiles more than plains in D", () => {
    const plains = makeTerrain(PLAIN);
    const swampy = makeTerrain(PLAIN);
    for (let x = 15; x <= 35; x++) {
      for (let y = 15; y <= 35; y++) {
        setTile(swampy, x, y, SWAMP);
      }
    }
    const sources = [
      { x: 10, y: 25 },
      { x: 40, y: 25 }
    ];
    const controller = { x: 25, y: 10 };
    const plainScore = scoreFirstRoom({ getTerrain: getter(plains), sources, controller });
    const swampScore = scoreFirstRoom({ getTerrain: getter(swampy), sources, controller });

    assert.isBelow(plainScore.walkCost, swampScore.walkCost);
    assert.isAbove(plainScore.score, swampScore.score);
  });

  it("penalizes chebyshev fallback so disconnected rooms lose to walkable ones", () => {
    const boxed = makeTerrain(WALL);
    for (let x = 2; x <= 6; x++) {
      for (let y = 2; y <= 6; y++) {
        setTile(boxed, x, y, PLAIN);
      }
    }
    for (let x = 40; x <= 45; x++) {
      for (let y = 40; y <= 45; y++) {
        setTile(boxed, x, y, PLAIN);
      }
    }
    setTile(boxed, 25, 25, PLAIN);

    const disconnected = scoreFirstRoom({
      getTerrain: getter(boxed),
      sources: [
        { x: 4, y: 4 },
        { x: 42, y: 42 }
      ],
      controller: { x: 25, y: 25 }
    });
    const open = scoreFirstRoom({
      getTerrain: getter(makeTerrain()),
      sources: [
        { x: 4, y: 4 },
        { x: 42, y: 42 }
      ],
      controller: { x: 25, y: 25 }
    });

    assert.isTrue(disconnected.usedChebyshev);
    assert.isAbove(disconnected.walkCost, CHEBYSHEV_PENALTY);
    assert.isAbove(open.score, disconnected.score);
  });

  it("ranks eligible compact rooms first and owned/1-source rooms last", () => {
    const getTerrain = getter(makeTerrain());
    const ranked = rankFirstRooms([
      {
        roomName: "W1N1",
        getTerrain,
        sources: [{ x: 10, y: 10 }],
        controller: { x: 20, y: 20 }
      },
      {
        roomName: "W2N1",
        getTerrain,
        sources: [
          { x: 10, y: 10 },
          { x: 40, y: 10 }
        ],
        controller: { x: 25, y: 40 }
      },
      {
        roomName: "W3N1",
        getTerrain,
        sources: [
          { x: 20, y: 20 },
          { x: 24, y: 20 },
          { x: 22, y: 18 }
        ],
        controller: { x: 22, y: 24 }
      },
      {
        roomName: "W4N1",
        getTerrain,
        sources: [
          { x: 20, y: 20 },
          { x: 24, y: 20 }
        ],
        controller: { x: 22, y: 24 },
        owner: "Invader"
      }
    ]);

    assert.equal(ranked[0].roomName, "W3N1");
    assert.equal(ranked[1].roomName, "W2N1");
    assert.isTrue(ranked[0].eligible);
    assert.isTrue(ranked[1].eligible);
    assert.isFalse(ranked[2].eligible);
    assert.isFalse(ranked[3].eligible);
    assert.isBelow(compareFirstRoomScores(ranked[0], ranked[1]), 0);
  });
});
