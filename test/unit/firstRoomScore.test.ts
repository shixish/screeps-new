import { assert } from "chai";
import {
  CHEBYSHEV_PENALTY,
  MIN_SOURCES,
  SOURCE_PAIR_WEIGHT,
  compareFirstRoomScores,
  rankFirstRooms,
  scoreFirstRoom
} from "../../src/utils/firstRoomScore";
import {
  ROOM_SIZE,
  computeWalkCostMap,
  tileIndex
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
    assert.equal(none.sourceCount, 0);
    assert.equal(one.rankCost, Number.POSITIVE_INFINITY);
    assert.match(one.reason || "", /sources/);
    assert.equal(MIN_SOURCES, 2);
  });

  it("rejects rooms without a controller", () => {
    const scored = scoreFirstRoom({
      getTerrain: getter(makeTerrain()),
      sources: [
        { x: 10, y: 10 },
        { x: 12, y: 10 }
      ]
    });
    assert.isFalse(scored.eligible);
    assert.match(scored.reason || "", /controller/);
  });

  it("prefers a closer source pair over a closer controller", () => {
    const getTerrain = getter(makeTerrain());
    const closePair = scoreFirstRoom({
      getTerrain,
      sources: [
        { x: 20, y: 20 },
        { x: 24, y: 20 }
      ],
      controller: { x: 45, y: 45 }
    });
    const farPair = scoreFirstRoom({
      getTerrain,
      sources: [
        { x: 5, y: 5 },
        { x: 45, y: 45 }
      ],
      controller: { x: 25, y: 25 }
    });

    assert.isTrue(closePair.eligible);
    assert.isTrue(farPair.eligible);
    assert.isBelow(closePair.sourcePairCost, farPair.sourcePairCost);
    assert.isBelow(closePair.rankCost, farPair.rankCost);
    assert.equal(closePair.rankCost, closePair.sourcePairCost * SOURCE_PAIR_WEIGHT + closePair.controllerCost);
  });

  it("uses controller walk from the source-pair rendezvous as the tie-breaker", () => {
    const getTerrain = getter(makeTerrain());
    const sources = [
      { x: 10, y: 25 },
      { x: 20, y: 25 }
    ];
    const near = scoreFirstRoom({
      getTerrain,
      sources,
      controller: { x: 15, y: 28 }
    });
    const far = scoreFirstRoom({
      getTerrain,
      sources,
      controller: { x: 15, y: 45 }
    });

    assert.equal(near.sourcePairCost, far.sourcePairCost);
    assert.isBelow(near.controllerCost, far.controllerCost);
    assert.isBelow(near.rankCost, far.rankCost);
    assert.isDefined(near.rendezvous);
  });

  it("measures source proximity by walk cost around walls, not chebyshev", () => {
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
    const controller = { x: 25, y: 40 };
    const openScore = scoreFirstRoom({ getTerrain: getter(open), sources, controller });
    const wallScore = scoreFirstRoom({ getTerrain: getter(walled), sources, controller });

    assert.isTrue(openScore.eligible);
    assert.isTrue(wallScore.eligible);
    assert.isFalse(openScore.usedChebyshev);
    assert.isAbove(wallScore.sourcePairCost, openScore.sourcePairCost);

    const map = computeWalkCostMap(sources[0], getter(walled));
    assert.equal(wallScore.sourcePairCost, map[tileIndex(sources[1].x, sources[1].y)]);
  });

  it("charges swamp tiles between sources more than plains", () => {
    const plains = makeTerrain(PLAIN);
    const swampy = makeTerrain(PLAIN);
    for (let x = 15; x <= 35; x++) {
      for (let y = 20; y <= 30; y++) {
        setTile(swampy, x, y, SWAMP);
      }
    }
    const sources = [
      { x: 10, y: 25 },
      { x: 40, y: 25 }
    ];
    const controller = { x: 25, y: 5 };
    const plainScore = scoreFirstRoom({ getTerrain: getter(plains), sources, controller });
    const swampScore = scoreFirstRoom({ getTerrain: getter(swampy), sources, controller });

    assert.isBelow(plainScore.sourcePairCost, swampScore.sourcePairCost);
    assert.isFalse(plainScore.usedChebyshev);
    assert.isFalse(swampScore.usedChebyshev);
  });

  it("uses the closest of three sources as the pair", () => {
    const scored = scoreFirstRoom({
      getTerrain: getter(makeTerrain()),
      sources: [
        { x: 10, y: 10 },
        { x: 12, y: 10 },
        { x: 40, y: 40 }
      ],
      controller: { x: 25, y: 25 }
    });
    assert.isTrue(scored.eligible);
    assert.equal(scored.sourceCount, 3);
    assert.deepEqual(scored.pair, [
      { x: 10, y: 10 },
      { x: 12, y: 10 }
    ]);
    assert.isBelow(scored.sourcePairCost, 10);
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
    assert.isAbove(disconnected.sourcePairCost, CHEBYSHEV_PENALTY);
    assert.isBelow(open.rankCost, disconnected.rankCost);
  });

  it("ranks eligible rooms ahead of rejected rooms", () => {
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
          { x: 30, y: 10 }
        ],
        controller: { x: 20, y: 20 }
      },
      {
        roomName: "W3N1",
        getTerrain,
        sources: [
          { x: 10, y: 10 },
          { x: 12, y: 10 }
        ],
        controller: { x: 11, y: 12 }
      }
    ]);

    assert.equal(ranked[0].roomName, "W3N1");
    assert.equal(ranked[1].roomName, "W2N1");
    assert.equal(ranked[2].roomName, "W1N1");
    assert.isTrue(ranked[0].eligible);
    assert.isTrue(ranked[1].eligible);
    assert.isFalse(ranked[2].eligible);
    assert.isBelow(compareFirstRoomScores(ranked[0], ranked[1]), 0);
  });
});
