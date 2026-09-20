import { assert } from "chai";
import {
  ROAD_SITE_CLEANUP_INTERVAL,
  RoadTileState,
  cleanupRedundantRoadSites,
  drawExitRoadPlan,
  getRoadTileState,
  hasBuiltRoad,
  packRoadPos,
  placeEarlyRoadSites
} from "../../src/utils/earlyEconomy";
import { ExtensionPodPlanMemory, drawExtensionPodPlan, getPodRoadTiles } from "../../src/utils/extensionPods";

const globals = global as any;

interface Placed{ x:number; y:number; structureType:string }
interface Circle{ x:number; y:number; radius:number; opacity:number }

/*
  A room with the surface the road placers, the site sweep and the plan drawers touch: terrain, the two
  look calls, find for the site sweep, createConstructionSite, and a RoomVisual that records instead of
  drawing. Same shape as the extension pod / near-spawn storage fakes.
*/
function fakeRoom() {
  const structures: Placed[] = [];
  const sites: (Placed & { removed?: boolean })[] = [];
  const walls: number[] = [];
  const circles: Circle[] = [];
  const memory: any = {};

  const room = {
    name: "W1N4",
    memory,
    getTerrain: () => ({ get: (x: number, y: number) => (walls.includes(packRoadPos(x, y)) ? globals.TERRAIN_MASK_WALL : 0) }),
    lookForAt: (what: string, x: number, y: number) =>
      (what === globals.LOOK_STRUCTURES ? structures : sites.filter(site => !site.removed))
        .filter(item => item.x === x && item.y === y),
    find: (what: number) => (what === globals.FIND_MY_CONSTRUCTION_SITES
      ? sites.filter(site => !site.removed).map(site => ({
          structureType: site.structureType,
          pos: { x: site.x, y: site.y },
          remove: () => { site.removed = true; return globals.OK; }
        }))
      : []),
    createConstructionSite: (x: number, y: number, structureType: string) => {
      sites.push({ x, y, structureType });
      return globals.OK;
    },
    visual: {
      circle: (x: number, y: number, style: { radius: number; opacity: number }) =>
        circles.push({ x, y, radius: style.radius, opacity: style.opacity }),
      poly: () => undefined,
      rect: () => undefined,
      text: () => undefined
    }
  };
  return { room, structures, sites, walls, circles, memory };
}

const roadSites = (sites: Placed[]) => sites.filter(site => site.structureType === "road").map(site => packRoadPos(site.x, site.y));
const circleAt = (circles: Circle[], x: number, y: number) => circles.find(circle => circle.x === x && circle.y === y);

describe("road tile state", () => {
  beforeEach(() => {
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.FIND_MY_CONSTRUCTION_SITES = 4;
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.STRUCTURE_EXTENSION = "extension";
    globals.OK = 0;
    globals.Game = { time: 0 };
  });

  it("reports a built road as satisfied and a road site as pending", () => {
    const { room, structures, sites } = fakeRoom();
    structures.push({ x: 10, y: 10, structureType: "road" });
    sites.push({ x: 11, y: 10, structureType: "road" });
    assert.equal(getRoadTileState(room as any, packRoadPos(10, 10)), RoadTileState.Satisfied);
    assert.equal(getRoadTileState(room as any, packRoadPos(11, 10)), RoadTileState.Pending);
    assert.equal(getRoadTileState(room as any, packRoadPos(12, 10)), RoadTileState.Missing);
  });

  it("only calls a tile paved when a road structure stands on it", () => {
    const { room, structures, sites } = fakeRoom();
    structures.push({ x: 10, y: 10, structureType: "road" }, { x: 12, y: 10, structureType: "extension" });
    sites.push({ x: 11, y: 10, structureType: "road" });
    assert.isTrue(hasBuiltRoad(room as any, 10, 10));
    //A queued road is not a road yet, and neither is somebody else's structure.
    assert.isFalse(hasBuiltRoad(room as any, 11, 10));
    assert.isFalse(hasBuiltRoad(room as any, 12, 10));
  });
});

describe("early road site placement", () => {
  beforeEach(() => {
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.FIND_MY_CONSTRUCTION_SITES = 4;
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.OK = 0;
    globals.Game = { time: 0 };
  });

  it("never places a road site on a tile that already has a built road", () => {
    const { room, structures, sites } = fakeRoom();
    const tiles = [packRoadPos(10, 10), packRoadPos(11, 10), packRoadPos(12, 10)];
    structures.push({ x: 10, y: 10, structureType: "road" }, { x: 12, y: 10, structureType: "road" });
    assert.equal(placeEarlyRoadSites(room as any, tiles), 0);
    assert.deepEqual(roadSites(sites), [packRoadPos(11, 10)]);
  });

  it("never doubles up on a tile that already has a road construction site", () => {
    const { room, sites } = fakeRoom();
    sites.push({ x: 10, y: 10, structureType: "road" });
    assert.equal(placeEarlyRoadSites(room as any, [packRoadPos(10, 10)]), 0);
    assert.lengthOf(roadSites(sites), 1);
  });

  it("counts a paved tile as done rather than as outstanding work, even at a zero limit", () => {
    const { room, structures } = fakeRoom();
    structures.push({ x: 10, y: 10, structureType: "road" });
    //Limit 0 places nothing and just counts: the paved tile is not work, the empty one is.
    assert.equal(placeEarlyRoadSites(room as any, [packRoadPos(10, 10)], 0), 0);
    assert.equal(placeEarlyRoadSites(room as any, [packRoadPos(10, 10), packRoadPos(11, 10)], 0), 1);
  });
});

describe("redundant road site cleanup", () => {
  beforeEach(() => {
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.FIND_MY_CONSTRUCTION_SITES = 4;
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.STRUCTURE_EXTENSION = "extension";
    globals.OK = 0;
    globals.Game = { time: 0 };
  });

  it("removes road sites standing on a built road and leaves the rest alone", () => {
    const { room, structures, sites } = fakeRoom();
    structures.push({ x: 10, y: 10, structureType: "road" }, { x: 13, y: 10, structureType: "road" });
    sites.push(
      { x: 10, y: 10, structureType: "road" }, //Redundant: the road is already standing.
      { x: 11, y: 10, structureType: "road" }, //Real road work.
      { x: 13, y: 10, structureType: "extension" } //Not a road site, never our business.
    );
    assert.equal(cleanupRedundantRoadSites(room as any, true), 1);
    assert.deepEqual(sites.filter(site => !site.removed).map(site => [site.x, site.structureType]),
      [[11, "road"], [13, "extension"]]);
    //Nothing left to sweep on the next pass.
    assert.equal(cleanupRedundantRoadSites(room as any, true), 0);
  });

  it("is throttled so the sweep costs nothing on most ticks", () => {
    const { room, structures, sites } = fakeRoom();
    structures.push({ x: 10, y: 10, structureType: "road" });
    sites.push({ x: 10, y: 10, structureType: "road" });
    globals.Game.time = ROAD_SITE_CLEANUP_INTERVAL + 1;
    assert.equal(cleanupRedundantRoadSites(room as any), 0);
    assert.isEmpty(sites.filter(site => site.removed));
    globals.Game.time = ROAD_SITE_CLEANUP_INTERVAL * 3;
    assert.equal(cleanupRedundantRoadSites(room as any), 1);
  });
});

describe("road plan visuals", () => {
  beforeEach(() => {
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.FIND_MY_CONSTRUCTION_SITES = 4;
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.STRUCTURE_EXTENSION = "extension";
    globals.OK = 0;
    globals.Game = { time: 0 };
  });

  it("draws an exit road tile that's already paved as completed, not as planned", () => {
    const { room, structures, circles, memory } = fakeRoom();
    structures.push({ x: 10, y: 10, structureType: "road" });
    memory.exitRoads = {
      routes: [{ exit: 1, order: 0, cost: 10, path: [packRoadPos(10, 10), packRoadPos(11, 10)], segments: [] }],
      plannedTiles: [packRoadPos(10, 10), packRoadPos(11, 10)],
      planned: 0
    };
    drawExitRoadPlan(room as any);
    const built = circleAt(circles, 10, 10), planned = circleAt(circles, 11, 10);
    assert.isDefined(built);
    assert.isDefined(planned);
    //Same marker the circulation drawer uses for a finished lane: smaller and much fainter.
    assert.isBelow(built!.radius, planned!.radius);
    assert.isBelow(built!.opacity, planned!.opacity);
  });

  it("fades the pod ring dots on tiles that are already paved", () => {
    const { room, structures, circles, memory } = fakeRoom();
    const [first, second] = getPodRoadTiles(25, 25);
    structures.push({ x: Math.floor(first / 50), y: first % 50, structureType: "road" });
    const podPlan: ExtensionPodPlanMemory = {
      anchorX: 0, anchorY: 0, phase: 0, roadTiles: [], planned: 1,
      pods: [{ id: "pod-0", order: 0, x: 25, y: 25, score: 0 }]
    };
    memory.extensionPods = podPlan;
    drawExtensionPodPlan(room as any);
    const built = circleAt(circles, Math.floor(first / 50), first % 50);
    const planned = circleAt(circles, Math.floor(second / 50), second % 50);
    assert.isDefined(built);
    assert.isDefined(planned);
    assert.isBelow(built!.radius, planned!.radius);
    assert.isBelow(built!.opacity, planned!.opacity);
  });
});
