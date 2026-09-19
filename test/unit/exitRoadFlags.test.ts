import { assert } from "chai";
import { ExitRoadRouteMemory, packRoadPos } from "../../src/utils/earlyEconomy";
import {
  EXIT_FLAG_MAX_WAYPOINTS,
  EXIT_FLAG_PREFIX,
  EXIT_FLAG_SPACING,
  exitFlagName,
  findOrphanExitFlags,
  getDesiredExitFlags,
  getExitFlagColor,
  getExitFlagDirectionLabel,
  getExitFlagSecondaryColor,
  getExitFlagWaypoints,
  isExitFlagName,
  syncExitRoadFlags
} from "../../src/utils/exitRoadFlags";

//The COLOR_*/FIND_EXIT_* globals only exist in the game runtime; the colour helpers read them lazily.
const globals = global as any;
globals.FIND_EXIT_TOP = 1;
globals.FIND_EXIT_RIGHT = 3;
globals.FIND_EXIT_BOTTOM = 5;
globals.FIND_EXIT_LEFT = 7;
globals.COLOR_PURPLE = 2;
globals.COLOR_GREEN = 4;
globals.COLOR_YELLOW = 6;
globals.COLOR_CYAN = 8;
globals.COLOR_WHITE = 10;

//A straight route down column 25, starting `from` and running `length` tiles.
function route(exit: number, length: number, from = 10): ExitRoadRouteMemory {
  const path: number[] = [];
  for (let i = 0; i < length; i++) path.push(packRoadPos(25, from + i));
  return { exit: exit as ExitConstant, order: 0, cost: 10, path, segments: [] };
}

describe("exit road flags", () => {
  it("names flags room-first so they stay unique across the world", () => {
    assert.equal(exitFlagName("W1N4", 1 as ExitConstant, 0), "exit:W1N4:N:0");
    assert.equal(exitFlagName("W1N4", 3 as ExitConstant, 2), "exit:W1N4:E:2");
    assert.equal(exitFlagName("W2N4", 5 as ExitConstant, 1), "exit:W2N4:S:1");
    assert.equal(exitFlagName("W1N4", 7 as ExitConstant, 3), "exit:W1N4:W:3");
    assert.equal(getExitFlagDirectionLabel(1 as ExitConstant), "N");
  });

  it("only claims this room's exit flags", () => {
    assert.isTrue(isExitFlagName("W1N4", "exit:W1N4:N:0"));
    //Another room's exit trail, and every other flag type, are somebody else's problem.
    assert.isFalse(isExitFlagName("W1N4", "exit:W2N4:N:0"));
    ["home:W1N4", "harvest:W1N4:0", "upgrade:W1N4", "exit"].forEach(name => {
      assert.isFalse(isExitFlagName("W1N4", name), name);
    });
    assert.equal(EXIT_FLAG_PREFIX, "exit:");
  });

  it("picks a sparse trail that always includes the first and last tile", () => {
    const waypoints = getExitFlagWaypoints(route(1, 23));
    //23 tiles at spacing 5 -> tiles 0, 5, 10, 15, 20 and the final tile 22.
    assert.deepEqual(waypoints.map(w => w.y), [10, 15, 20, 25, 30, 32]);
    assert.deepEqual(waypoints.map(w => w.index), [0, 1, 2, 3, 4, 5]);
    assert.isTrue(waypoints.every(w => w.x === 25));
    //Sparse: far fewer flags than tiles, and only the terminus is marked last.
    assert.isBelow(waypoints.length, 23 / 2);
    assert.deepEqual(waypoints.filter(w => w.last).map(w => w.index), [5]);
  });

  it("never drops more than the cap on one route, however long it is", () => {
    const waypoints = getExitFlagWaypoints(route(1, 48, 1));
    assert.isAtMost(waypoints.length, EXIT_FLAG_MAX_WAYPOINTS);
    //Widened spacing, not extra flags.
    assert.isAtLeast(waypoints[1].y - waypoints[0].y, EXIT_FLAG_SPACING);
    assert.equal(waypoints[0].y, 1);
    assert.equal(waypoints[waypoints.length - 1].y, 48);
  });

  it("marks a one tile route with a single terminus flag, and an empty route with nothing", () => {
    const single = getExitFlagWaypoints(route(1, 1));
    assert.lengthOf(single, 1);
    assert.isTrue(single[0].last);
    assert.isEmpty(getExitFlagWaypoints({ ...route(1, 0), path: [] }));
  });

  it("colours a trail by its exit direction, solid at the terminus", () => {
    assert.equal(getExitFlagColor(1 as ExitConstant), globals.COLOR_CYAN);
    assert.equal(getExitFlagColor(3 as ExitConstant), globals.COLOR_GREEN);
    assert.equal(getExitFlagColor(5 as ExitConstant), globals.COLOR_YELLOW);
    assert.equal(getExitFlagColor(7 as ExitConstant), globals.COLOR_PURPLE);
    assert.equal(getExitFlagSecondaryColor(1 as ExitConstant, false), globals.COLOR_WHITE);
    assert.equal(getExitFlagSecondaryColor(1 as ExitConstant, true), globals.COLOR_CYAN);
  });

  it("builds the desired set across every planned route", () => {
    const desired = getDesiredExitFlags("W1N4", [route(1, 6), route(3, 6)]);
    assert.deepEqual(desired.map(f => f.name),
      ["exit:W1N4:N:0", "exit:W1N4:N:1", "exit:W1N4:E:0", "exit:W1N4:E:1"]);
    assert.deepEqual(desired.map(f => f.color),
      [globals.COLOR_CYAN, globals.COLOR_CYAN, globals.COLOR_GREEN, globals.COLOR_GREEN]);
    assert.deepEqual(desired.map(f => f.secondaryColor),
      [globals.COLOR_WHITE, globals.COLOR_CYAN, globals.COLOR_WHITE, globals.COLOR_GREEN]);
    //~4-12 flags per route, not dozens.
    assert.isAtMost(desired.length, 2 * EXIT_FLAG_MAX_WAYPOINTS);
  });

  it("orphans only this room's exit flags that the plan no longer wants", () => {
    const desired = ["exit:W1N4:N:0", "exit:W1N4:N:1"];
    const existing = [
      "exit:W1N4:N:0", //Still wanted.
      "exit:W1N4:N:4", //Route shortened under a replan.
      "exit:W1N4:S:0", //Direction dropped out of the plan.
      "exit:W2N4:N:9", //Another room's trail.
      "home:W1N4", "harvest:W1N4:0", "upgrade:W1N4"
    ];
    assert.deepEqual(findOrphanExitFlags("W1N4", desired, existing), ["exit:W1N4:N:4", "exit:W1N4:S:0"]);
    //A flag the plan wants but that isn't standing yet is a create, never an orphan.
    assert.notInclude(findOrphanExitFlags("W1N4", desired, existing), "exit:W1N4:N:1");
  });
});

//A fake room with just enough surface for syncExitRoadFlags: a plan in memory, its flags, createFlag.
function fakeRoom(name: string, routes: ExitRoadRouteMemory[], flags: { name: string; x: number; y: number }[]) {
  const created: { name: string; x: number; y: number; color: number; secondaryColor: number }[] = [];
  const removed: string[] = [];
  const moved: { name: string; x: number; y: number }[] = [];
  globals.Game.flags = {};
  const standing = flags.map(flag => {
    const stub = {
      name: flag.name,
      pos: { x: flag.x, y: flag.y, roomName: name },
      remove: () => { removed.push(flag.name); },
      setPosition: (x: number, y: number) => { moved.push({ name: flag.name, x, y }); }
    };
    globals.Game.flags[flag.name] = stub;
    return stub;
  });
  const room = {
    name,
    memory: { exitRoads: { routes, plannedTiles: [], planned: 1 } },
    find: () => standing,
    createFlag: (x: number, y: number, flagName: string, color: number, secondaryColor: number) => {
      created.push({ name: flagName, x, y, color, secondaryColor });
      return flagName;
    }
  };
  return { room, created, removed, moved };
}

describe("exit road flag sync", () => {
  beforeEach(() => {
    globals.FIND_FLAGS = 10;
    globals.Game = { time: 0, flags: {} };
  });

  it("creates the missing flags and leaves the standing ones alone", () => {
    const { room, created, removed, moved } = fakeRoom("W1N4", [route(1, 6)],
      [{ name: "exit:W1N4:N:0", x: 25, y: 10 }]);
    syncExitRoadFlags(room as any);
    assert.deepEqual(created.map(f => f.name), ["exit:W1N4:N:1"]);
    assert.deepEqual(created[0], { name: "exit:W1N4:N:1", x: 25, y: 15, color: globals.COLOR_CYAN, secondaryColor: globals.COLOR_CYAN });
    assert.isEmpty(removed);
    assert.isEmpty(moved);
  });

  it("removes exit flags the plan dropped, and never touches other flag types", () => {
    const { room, created, removed } = fakeRoom("W1N4", [route(1, 6)], [
      { name: "exit:W1N4:N:0", x: 25, y: 10 },
      { name: "exit:W1N4:N:1", x: 25, y: 15 },
      { name: "exit:W1N4:S:0", x: 25, y: 40 },
      { name: "home:W1N4", x: 20, y: 20 }
    ]);
    syncExitRoadFlags(room as any);
    assert.isEmpty(created);
    assert.deepEqual(removed, ["exit:W1N4:S:0"]);
  });

  it("drags a standing flag to its new waypoint instead of recreating it", () => {
    const { room, created, removed, moved } = fakeRoom("W1N4", [route(1, 6)], [
      { name: "exit:W1N4:N:0", x: 25, y: 10 },
      { name: "exit:W1N4:N:1", x: 30, y: 30 } //Route was replanned under it.
    ]);
    syncExitRoadFlags(room as any);
    assert.deepEqual(moved, [{ name: "exit:W1N4:N:1", x: 25, y: 15 }]);
    assert.isEmpty(created);
    assert.isEmpty(removed);
  });

  it("only syncs on the throttle tick unless forced, and does nothing without a plan", () => {
    globals.Game.time = 3;
    const { room, created } = fakeRoom("W1N4", [route(1, 6)], []);
    syncExitRoadFlags(room as any);
    assert.isEmpty(created);
    syncExitRoadFlags(room as any, true);
    assert.lengthOf(created, 2);

    const unplanned = fakeRoom("W1N4", [], []);
    (unplanned.room.memory as any).exitRoads = undefined;
    syncExitRoadFlags(unplanned.room as any, true);
    assert.isEmpty(unplanned.created);
  });
});
