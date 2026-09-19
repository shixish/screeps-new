import { assert } from "chai";
import { packRoadPos } from "../../src/utils/earlyEconomy";
import {
  NEAR_SPAWN_STORAGE_RADIUS,
  NEAR_SPAWN_STORAGE_ROAD_SITES,
  findNearSpawnStorageTile,
  getCirculationExtensionSlots,
  getSpawnCirculationTiles,
  isLowPriorityBuild,
  nearSpawnStorageSlots,
  placeNearSpawnStorage,
  placeStorageRoadAccess
} from "../../src/utils/nearSpawnStorage";
import { spawnCirculationDiagonals, spawnCirculationOuterRing, spawnCirculationPockets } from "../../src/utils/spawnCirculation";

const globals = global as any;

const pack = (coords: number[][]) => coords.map(([x, y]) => packRoadPos(x, y)).sort((a, b) => a - b);
const distance = (sx: number, sy: number, [x, y]: [number, number]) => Math.abs(x - sx) + Math.abs(y - sy);

describe("near spawn storage geometry", () => {
  it("prefers the spawn's own arm tiles - adjacent to the spawn and off the lanes", () => {
    const slots = nearSpawnStorageSlots(25, 25);
    assert.deepEqual(pack(slots.slice(0, 4)), pack([[24, 25], [26, 25], [25, 24], [25, 26]]));
    //Every one of them touches three circulation road tiles, so no new road is ever needed there.
    const roads = getSpawnCirculationTiles(25, 25);
    slots.slice(0, 4).forEach(([x, y]) => {
      const access = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([dx, dy]) => roads.includes(packRoadPos(x + dx, y + dy))).length;
      assert.equal(access, 3);
    });
  });

  it("never offers a circulation lane tile, the spawn tile, or anything past the radius", () => {
    const slots = nearSpawnStorageSlots(25, 25);
    const packed = pack(slots);
    assert.lengthOf(new Set(packed), slots.length);
    assert.notInclude(packed, packRoadPos(25, 25));
    //Storage and road are mutually exclusive structures: taking a lane tile cuts the lane for good.
    spawnCirculationDiagonals(25, 25).forEach(([x, y]) => assert.notInclude(packed, packRoadPos(x, y)));
    spawnCirculationOuterRing(25, 25).forEach(([x, y]) => assert.notInclude(packed, packRoadPos(x, y)));
    slots.forEach(slot => {
      assert.isAbove(distance(25, 25, slot), 0);
      assert.isAtMost(distance(25, 25, slot), NEAR_SPAWN_STORAGE_RADIUS);
    });
  });

  it("orders by distance to the spawn, nearest first", () => {
    const distances = nearSpawnStorageSlots(25, 25).map(slot => distance(25, 25, slot));
    distances.forEach((value, index) => index && assert.isAtLeast(value, distances[index - 1]));
  });

  it("leaves the circulation extension slots for last within their distance band", () => {
    const slots = nearSpawnStorageSlots(25, 25);
    const reserved = getCirculationExtensionSlots(25, 25);
    //The four +-(2,2) pockets sit at Manhattan 4; their arms at 3. Both must come after ordinary tiles.
    [3, 4].forEach(band => {
      const inBand = slots.filter(slot => distance(25, 25, slot) === band);
      const firstReserved = inBand.findIndex(([x, y]) => reserved.includes(packRoadPos(x, y)));
      const lastOrdinary = inBand.map(([x, y]) => reserved.includes(packRoadPos(x, y))).lastIndexOf(false);
      assert.isAbove(firstReserved, lastOrdinary);
    });
    //Every pocket centre is still a candidate - a boxed-in core must not end up with no storage at all.
    spawnCirculationPockets(25, 25).forEach(([x, y]) => assert.include(pack(slots), packRoadPos(x, y)));
  });

  it("stays inside the buildable box for a spawn against the rim", () => {
    nearSpawnStorageSlots(2, 47).forEach(([x, y]) => {
      assert.isAtLeast(x, 1);
      assert.isAtLeast(y, 1);
      assert.isAtMost(x, 48);
      assert.isAtMost(y, 48);
    });
  });

  it("marks storage, and only storage, as low priority to build", () => {
    globals.STRUCTURE_STORAGE = "storage";
    assert.isTrue(isLowPriorityBuild("storage" as StructureConstant));
    ["extension", "road", "container", "tower", "spawn", "rampart"].forEach(structureType => {
      assert.isFalse(isLowPriorityBuild(structureType as StructureConstant));
    });
  });
});

/*
  Minimal room for the placement pass: terrain, the two look calls, find for the blocking anchors and
  the storage check, and createConstructionSite. Same shape as the extension pod construction fake.
*/
function fakeRoom() {
  const structures: { x: number; y: number; structureType: string }[] = [];
  const sites: { x: number; y: number; structureType: string }[] = [];
  const walls: number[] = [];
  const sources: { pos: { x: number; y: number } }[] = [];
  const minerals: { pos: { x: number; y: number } }[] = [];
  const memory: any = {};

  const withPos = (item: { x: number; y: number; structureType: string }) => ({
    structureType: item.structureType,
    pos: { x: item.x, y: item.y }
  });

  const room = {
    name: "W1N4",
    memory,
    controller: undefined as undefined | { pos: { x: number; y: number } },
    getTerrain: () => ({ get: (x: number, y: number) => (walls.includes(packRoadPos(x, y)) ? globals.TERRAIN_MASK_WALL : 0) }),
    lookForAt: (what: string, x: number, y: number) =>
      (what === globals.LOOK_STRUCTURES ? structures : sites).filter(item => item.x === x && item.y === y),
    find: (what: number, opts?: { filter: (item: any) => boolean }) => {
      const all =
        what === globals.FIND_SOURCES ? sources :
        what === globals.FIND_MINERALS ? minerals :
        what === globals.FIND_MY_STRUCTURES ? structures.map(withPos) :
        what === globals.FIND_MY_CONSTRUCTION_SITES ? sites.map(withPos) :
        [];
      return opts?.filter ? (all as any[]).filter(opts.filter) : all;
    },
    createConstructionSite: (x: number, y: number, structureType: string) => {
      sites.push({ x, y, structureType });
      return globals.OK;
    }
  };
  return { room, structures, sites, walls, sources, minerals, memory };
}

const spawnAt = (x: number, y: number) => ({ pos: { x, y } }) as any;

const storageSites = (sites: { x: number; y: number; structureType: string }[]) =>
  sites.filter(site => site.structureType === "storage");

describe("near spawn storage placement", () => {
  beforeEach(() => {
    globals.LOOK_STRUCTURES = "structure";
    globals.LOOK_CONSTRUCTION_SITES = "constructionSite";
    globals.TERRAIN_MASK_WALL = 1;
    globals.STRUCTURE_STORAGE = "storage";
    globals.STRUCTURE_ROAD = "road";
    globals.STRUCTURE_RAMPART = "rampart";
    globals.FIND_SOURCES = 1;
    globals.FIND_MINERALS = 2;
    globals.FIND_MY_STRUCTURES = 3;
    globals.FIND_MY_CONSTRUCTION_SITES = 4;
    globals.OK = 0;
  });

  it("puts the storage next to the spawn and needs no road of its own", () => {
    const { room, sites } = fakeRoom();
    assert.isTrue(placeNearSpawnStorage(room as any, spawnAt(25, 25)));
    assert.deepEqual(storageSites(sites), [{ x: 24, y: 25, structureType: "storage" }]);
    //The X and the ring already surround an arm tile, so nothing gets paved for it.
    assert.isEmpty(sites.filter(site => site.structureType === "road"));
  });

  it("steps out to the next ring when the arm tiles are taken", () => {
    const { room, structures, sites, walls } = fakeRoom();
    structures.push({ x: 24, y: 25, structureType: "extension" }, { x: 26, y: 25, structureType: "extension" });
    sites.push({ x: 25, y: 24, structureType: "extension" });
    walls.push(packRoadPos(25, 26));
    assert.isTrue(placeNearSpawnStorage(room as any, spawnAt(25, 25)));
    const [storage] = storageSites(sites);
    //Manhattan 2 is all lanes (the X and the ring), so the next free band out is 3.
    assert.equal(distance(25, 25, [storage.x, storage.y]), 3);
    assert.notInclude(getSpawnCirculationTiles(25, 25), packRoadPos(storage.x, storage.y));
  });

  it("keeps off the harvest seats around a nearby source", () => {
    const { room, structures, sites, sources } = fakeRoom();
    //(25,26) is the only arm tile left, and it's within the blocked radius of this source.
    structures.push(
      { x: 24, y: 25, structureType: "extension" },
      { x: 26, y: 25, structureType: "extension" },
      { x: 25, y: 24, structureType: "extension" }
    );
    sources.push({ pos: { x: 25, y: 28 } });
    assert.isTrue(placeNearSpawnStorage(room as any, spawnAt(25, 25)));
    const [storage] = storageSites(sites);
    assert.isAbove(distance(25, 28, [storage.x, storage.y]), 2);
  });

  it("keeps off the controller container and off a planned road route", () => {
    const { room, sites, memory } = fakeRoom();
    room.controller = { pos: { x: 22, y: 25 } }; //Blocks (24,25) - the container next to it lives in there.
    memory.earlyRoads = { source: [packRoadPos(25, 24)], controller: [], swamp: [] };
    assert.isTrue(placeNearSpawnStorage(room as any, spawnAt(25, 25)));
    assert.deepEqual(storageSites(sites), [{ x: 25, y: 26, structureType: "storage" }]);
  });

  it("does nothing when the room already has a storage, built or queued", () => {
    const built = fakeRoom();
    built.structures.push({ x: 30, y: 30, structureType: "storage" });
    assert.isTrue(placeNearSpawnStorage(built.room as any, spawnAt(25, 25)));
    assert.isEmpty(built.sites);

    const queued = fakeRoom();
    queued.sites.push({ x: 30, y: 30, structureType: "storage" });
    assert.isTrue(placeNearSpawnStorage(queued.room as any, spawnAt(25, 25)));
    assert.lengthOf(storageSites(queued.sites), 1);
  });

  it("reports failure when the whole core is blocked, so the caller can fall back", () => {
    const { room, walls, sites } = fakeRoom();
    const spawn = spawnAt(25, 25);
    for (let dx = -NEAR_SPAWN_STORAGE_RADIUS; dx <= NEAR_SPAWN_STORAGE_RADIUS; dx++){
      for (let dy = -NEAR_SPAWN_STORAGE_RADIUS; dy <= NEAR_SPAWN_STORAGE_RADIUS; dy++){
        walls.push(packRoadPos(25 + dx, 25 + dy));
      }
    }
    assert.isFalse(placeNearSpawnStorage(room as any, spawn));
    assert.isEmpty(sites);
    assert.isUndefined(findNearSpawnStorageTile(room as any, spawn));
  });

  it("paves an approach only for a tile no lane reaches, and never onto a reserved tile", () => {
    const { room, sites, sources } = fakeRoom();
    //Far from the spawn: nothing planned or built touches this tile.
    sources.push({ pos: { x: 34, y: 33 } }); //Its blocked radius covers two of the four neighbours.
    assert.equal(placeStorageRoadAccess(room as any, spawnAt(25, 25), 35, 35), NEAR_SPAWN_STORAGE_ROAD_SITES);
    const roads = sites.filter(site => site.structureType === "road").map(site => packRoadPos(site.x, site.y));
    assert.deepEqual(roads.sort((a, b) => a - b), pack([[36, 35], [35, 36]]));
    //(34,35) and (35,34) are harvest seats of that source, so they never get paved.
    assert.notInclude(roads, packRoadPos(34, 35));
    assert.notInclude(roads, packRoadPos(35, 34));
  });

  it("leaves an approach alone when a planned lane already touches the tile", () => {
    const { room, sites } = fakeRoom();
    assert.equal(placeStorageRoadAccess(room as any, spawnAt(25, 25), 24, 25), 0);
    assert.isEmpty(sites);
  });
});
