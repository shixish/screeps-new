import { assert } from "chai";
import {
  FIRST_SPAWN_ENERGY_PER_SEAT,
  PASS2_SWAMP_COST,
  SCORE_EPSILON,
  averageMidpoint,
  compareFirstRoomPass2Scores,
  countHarvestSeats,
  energyPerTick,
  rankFirstRoomsPass2,
  scoreFirstRoom,
  scoreFirstRoomPass2
} from "../../src/utils/firstRoomScore";
import {
  PLAIN_WALK_COST,
  ROOM_SIZE,
  isValidSpawnTile,
  spiralToPlaceableSpawn,
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

  it("uses E2 = 10 * H and score2 = E2 / (D2 + epsilon) for the first spawn", () => {
    const scored = scoreFirstRoomPass2({
      getTerrain: getter(makeTerrain()),
      sources: compactSources,
      controller: compactController
    });

    assert.isTrue(scored.eligible);
    assert.equal(scored.H, 16);
    assert.equal(FIRST_SPAWN_ENERGY_PER_SEAT, 10);
    assert.equal(scored.E2, energyPerTick(16));
    assert.equal(scored.E2, 10 * scored.H);
    assert.equal(scored.score2, scored.E2 / (scored.D2 + SCORE_EPSILON));
    assert.equal(PASS2_SWAMP_COST, PLAIN_WALK_COST);
    assert.lengthOf(scored.harvestSeats, 2);
    assert.equal(
      scored.harvestSeats.reduce((sum, entry) => sum + entry.seats, 0),
      scored.H
    );
    assert.isAtLeast((scored.legs ?? []).length, 3);
  });

  it("requires a placeable spawn and rejects an invalid geometric midpoint", () => {
    const terrain = makeTerrain(PLAIN);
    const sources = [
      { x: 10, y: 10 },
      { x: 30, y: 10 }
    ];
    const controller = { x: 20, y: 40 };
    const midpoint = averageMidpoint(sources.concat([controller]));
    assert.deepEqual(midpoint, { x: 20, y: 20 });
    setTile(terrain, midpoint.x, midpoint.y, WALL);

    const getTerrain = getter(terrain);
    const pass1 = scoreFirstRoom({ getTerrain, sources, controller });
    const pass2 = scoreFirstRoomPass2({ getTerrain, sources, controller });

    assert.isTrue(pass2.eligible);
    assert.isDefined(pass2.spawnPos);
    assert.isFalse(pass2.spawnPos!.x === midpoint.x && pass2.spawnPos!.y === midpoint.y);
    assert.isTrue(isValidSpawnTile(pass2.spawnPos!.x, pass2.spawnPos!.y, getTerrain));
    assert.equal(getTerrain(midpoint.x, midpoint.y), WALL);
    assert.isDefined(pass1.midpoint);
  });

  it("does not place the spawn on a source, mineral, or controller", () => {
    const getTerrain = getter(makeTerrain());
    const sources = [
      { x: 10, y: 25 },
      { x: 40, y: 25 }
    ];
    const controller = { x: 25, y: 25 };
    const mineral = { x: 25, y: 10 };
    const pass2 = scoreFirstRoomPass2({
      getTerrain,
      sources,
      controller,
      blockedTiles: [mineral]
    });

    assert.isTrue(pass2.eligible);
    const spawn = pass2.spawnPos!;
    assert.isFalse(sources.some(source => source.x === spawn.x && source.y === spawn.y));
    assert.isFalse(spawn.x === controller.x && spawn.y === controller.y);
    assert.isFalse(spawn.x === mineral.x && spawn.y === mineral.y);
    assert.isTrue(isValidSpawnTile(spawn.x, spawn.y, getTerrain));
  });

  it("marks a room ineligible when no STRUCTURE_SPAWN tile exists", () => {
    const terrain = makeTerrain(WALL);
    for (let y = 0; y < ROOM_SIZE; y++) {
      setTile(terrain, 0, y, PLAIN);
    }
    const scored = scoreFirstRoomPass2({
      getTerrain: getter(terrain),
      sources: [
        { x: 0, y: 10 },
        { x: 0, y: 40 }
      ],
      controller: { x: 0, y: 25 }
    });

    assert.isFalse(scored.eligible);
    assert.match(scored.reason || "", /placeable spawn/);
    assert.isUndefined(scored.spawnPos);
    assert.equal(scored.score2, 0);
  });

  it("skips owned and reserved rooms", () => {
    const getTerrain = getter(makeTerrain());
    const owned = scoreFirstRoomPass2({
      getTerrain,
      sources: compactSources,
      controller: compactController,
      owner: "Invader",
      my: false
    });
    const reserved = scoreFirstRoomPass2({
      getTerrain,
      sources: compactSources,
      controller: compactController,
      reserved: true
    });

    assert.isFalse(owned.eligible);
    assert.match(owned.reason || "", /owned/);
    assert.isFalse(reserved.eligible);
    assert.match(reserved.reason || "", /reserved/);
  });

  it("hill-climbs from the first spiral placeable instead of scanning the room", () => {
    const getTerrain = getter(makeTerrain());
    const sources = [
      { x: 40, y: 25 },
      { x: 42, y: 25 }
    ];
    const controller = { x: 8, y: 25 };
    const pass1 = scoreFirstRoom({ getTerrain, sources, controller });
    const pass2 = scoreFirstRoomPass2({ getTerrain, sources, controller });
    const midpoint = averageMidpoint(sources.concat([controller]));
    const spiralStart = spiralToPlaceableSpawn(midpoint, getTerrain, (x, y) =>
      [...sources, controller].some(goal => goal.x === x && goal.y === y)
    );

    assert.deepEqual(midpoint, { x: 30, y: 25 });
    assert.isDefined(pass2.spawnPos);
    assert.isTrue(isValidSpawnTile(pass2.spawnPos!.x, pass2.spawnPos!.y, getTerrain));
    assert.isDefined(pass1.midpoint);
    // 1D median of (8, 40, 42) is 40; climb should move east from the midpoint.
    assert.isAbove(pass2.spawnPos!.x, midpoint.x);
    assert.equal(pass2.spawnPos!.y, 25);
    assert.isDefined(spiralStart);
    assert.isFalse(pass2.spawnPos!.x === spiralStart!.x && pass2.spawnPos!.y === spiralStart!.y);
  });

  it("ignores swamp in D2 (swamp treated as plain)", () => {
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
