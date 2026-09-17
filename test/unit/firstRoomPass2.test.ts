import { assert } from "chai";
import {
  PASS2_SWAMP_COST,
  SCORE_EPSILON,
  compareFirstRoomPass2Scores,
  countHarvestSeats,
  energyPerTick,
  rankFirstRoomsPass2,
  scoreFirstRoom,
  scoreFirstRoomPass2
} from "../../src/utils/firstRoomScore";
import { PLAIN_WALK_COST, ROOM_SIZE, findOptimalSpawnTile, tileIndex } from "../../src/utils/spawnPlacement";

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

describe("firstRoomScore pass-2", () => {
  const compactSources = [
    { x: 20, y: 20 },
    { x: 28, y: 20 }
  ];
  const compactController = { x: 24, y: 28 };

  it("counts harvest seats on open, walled, swamp, and corner tiles", () => {
    const open = makeTerrain(PLAIN);
    assert.equal(countHarvestSeats({ x: 25, y: 25 }, getter(open)), 8);

    const walled = makeTerrain(PLAIN);
    setTile(walled, 24, 24, WALL);
    setTile(walled, 25, 24, WALL);
    setTile(walled, 26, 24, WALL);
    assert.equal(countHarvestSeats({ x: 25, y: 25 }, getter(walled)), 5);

    const swampy = makeTerrain(PLAIN);
    setTile(swampy, 24, 25, SWAMP);
    setTile(swampy, 26, 25, SWAMP);
    assert.equal(countHarvestSeats({ x: 25, y: 25 }, getter(swampy)), 8);

    assert.equal(countHarvestSeats({ x: 0, y: 0 }, getter(open)), 3);
  });

  it("uses E2 = H * 10 and score2 = E2 / (D2 + epsilon)", () => {
    const scored = scoreFirstRoomPass2({
      getTerrain: getter(makeTerrain()),
      sources: compactSources,
      controller: compactController
    });

    assert.isTrue(scored.eligible);
    assert.equal(scored.H, 16);
    assert.equal(scored.E2, energyPerTick(16));
    assert.equal(scored.E2, 160);
    assert.equal(scored.score2, scored.E2 / (scored.D2 + SCORE_EPSILON));
    assert.equal(PASS2_SWAMP_COST, PLAIN_WALK_COST);
    assert.lengthOf(scored.harvestSeats, 2);
    assert.equal(
      scored.harvestSeats.reduce((sum, entry) => sum + entry.seats, 0),
      scored.H
    );
  });

  it("picks the precise spawn tile rather than the pass-1 midpoint", () => {
    const getTerrain = getter(makeTerrain());
    const sources = [
      { x: 10, y: 10 },
      { x: 12, y: 10 }
    ];
    const controller = { x: 40, y: 40 };
    const pass1 = scoreFirstRoom({ getTerrain, sources, controller });
    const pass2 = scoreFirstRoomPass2({ getTerrain, sources, controller });
    const spawn = findOptimalSpawnTile({
      getTerrain,
      goals: sources.concat([controller]),
      isSpawnBlocked: (x, y) =>
        sources.concat([controller]).some(goal => goal.x === x && goal.y === y),
      isWalkBlocked: (x, y) =>
        sources.concat([controller]).some(goal => goal.x === x && goal.y === y),
      swampCost: PASS2_SWAMP_COST
    });

    assert.isDefined(pass2.spawnPos);
    assert.deepEqual(pass2.spawnPos, { x: spawn!.x, y: spawn!.y });
    assert.isDefined(pass1.midpoint);
    assert.isFalse(pass2.spawnPos.x === pass1.midpoint.x && pass2.spawnPos.y === pass1.midpoint.y);
  });

  it("does not raise D2 for swamp when swamp is treated as plain", () => {
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

    const pass1Plain = scoreFirstRoom({ getTerrain: getter(plains), sources, controller });
    const pass1Swamp = scoreFirstRoom({ getTerrain: getter(swampy), sources, controller });
    assert.isBelow(pass1Plain.walkCost, pass1Swamp.walkCost);

    const pass2Plain = scoreFirstRoomPass2({ getTerrain: getter(plains), sources, controller });
    const pass2Swamp = scoreFirstRoomPass2({ getTerrain: getter(swampy), sources, controller });
    assert.equal(pass2Swamp.D2, pass2Plain.D2);
    assert.equal(pass2Swamp.score2, pass2Plain.score2);

    const penalized = scoreFirstRoomPass2({
      getTerrain: getter(swampy),
      sources,
      controller,
      swampCost: 5
    });
    assert.isAbove(penalized.D2, pass2Swamp.D2);
  });

  it("raises score2 when harvest seats increase and walk distances stay equal", () => {
    const open = makeTerrain(PLAIN);
    const cramped = makeTerrain(PLAIN);
    // Wall the north/west seats of the west source; southeast approach stays open
    // so spawn-to-source D2 matches the fully open room.
    for (const [x, y] of [
      [19, 19],
      [20, 19],
      [21, 19],
      [19, 20],
      [19, 21]
    ]) {
      setTile(cramped, x, y, WALL);
    }

    const openScore = scoreFirstRoomPass2({
      getTerrain: getter(open),
      sources: compactSources,
      controller: compactController
    });
    const crampedScore = scoreFirstRoomPass2({
      getTerrain: getter(cramped),
      sources: compactSources,
      controller: compactController
    });

    assert.equal(openScore.H, 16);
    assert.equal(crampedScore.H, 11);
    assert.equal(openScore.D2, crampedScore.D2);
    assert.equal(openScore.spawnPos!.x, crampedScore.spawnPos!.x);
    assert.equal(openScore.spawnPos!.y, crampedScore.spawnPos!.y);
    assert.isAbove(openScore.E2, crampedScore.E2);
    assert.isAbove(openScore.score2, crampedScore.score2);
    assert.isBelow(compareFirstRoomPass2Scores(openScore, crampedScore), 0);
  });

  it("includes the controller in D2 by default", () => {
    const getTerrain = getter(makeTerrain());
    const withController = scoreFirstRoomPass2({
      getTerrain,
      sources: compactSources,
      controller: compactController
    });
    const sourcesOnly = scoreFirstRoomPass2({
      getTerrain,
      sources: compactSources,
      controller: compactController,
      includeController: false
    });

    assert.isAbove(withController.D2, sourcesOnly.D2);
  });

  it("ranks the higher-seat room first when distances are equal", () => {
    const open = makeTerrain(PLAIN);
    const cramped = makeTerrain(PLAIN);
    for (const [x, y] of [
      [19, 19],
      [20, 19],
      [21, 19],
      [19, 20],
      [19, 21]
    ]) {
      setTile(cramped, x, y, WALL);
    }

    const ranked = rankFirstRoomsPass2([
      {
        roomName: "W1N1",
        getTerrain: getter(cramped),
        sources: compactSources,
        controller: compactController
      },
      {
        roomName: "W2N1",
        getTerrain: getter(open),
        sources: compactSources,
        controller: compactController
      }
    ]);

    assert.equal(ranked[0].roomName, "W2N1");
    assert.equal(ranked[1].roomName, "W1N1");
    assert.isAbove(ranked[0].H, ranked[1].H);
    assert.equal(ranked[0].D2, ranked[1].D2);
  });
});
