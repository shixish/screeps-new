import { assert } from "chai";
import { packRoadPos } from "../../src/utils/earlyEconomy";
import {
  SPAWN_CIRCULATION_EXTENSIONS,
  spawnCirculationDiagonals,
  spawnCirculationEdgeCentres,
  spawnCirculationOuterRing,
  spawnCirculationPocketArms,
  spawnCirculationPockets,
  spawnCirculationRing,
  spawnCirculationExtensionSlots
} from "../../src/utils/spawnCirculation";

const pack = (coords: [number, number][]) => coords.map(([x, y]) => packRoadPos(x, y)).sort((a, b) => a - b);

describe("spawn circulation geometry", () => {
  it("phase 1 is the X, never the orthogonal cross", () => {
    const diagonals = spawnCirculationDiagonals(25, 25);
    assert.deepEqual(pack(diagonals), pack([[24, 24], [24, 26], [26, 24], [26, 26]]));
    //The orthogonal neighbours are extension arm slots and must stay clear.
    [[24, 25], [26, 25], [25, 24], [25, 26]].forEach(([x, y]) => {
      assert.notInclude(pack(diagonals), packRoadPos(x, y));
    });
  });

  it("a pod road ring is the 8 tiles at Manhattan distance 2", () => {
    const ring = spawnCirculationRing(25, 25);
    assert.lengthOf(ring, 8);
    ring.forEach(([x, y]) => assert.equal(Math.abs(x - 25) + Math.abs(y - 25), 2));
    //No duplicates, even though the underlying generator mirrors the axis tiles.
    assert.lengthOf(new Set(pack(ring)), 8);
  });

  it("edge neighbour centres sit on the ±(2,2) lattice", () => {
    assert.deepEqual(pack(spawnCirculationEdgeCentres(25, 25)),
      pack([[27, 27], [27, 23], [23, 27], [23, 23]]));
  });

  it("phase 2 is the union of the spawn ring and the four neighbour rings, minus the X", () => {
    const phase2 = spawnCirculationOuterRing(25, 25);
    const packed = pack(phase2);
    assert.lengthOf(packed, 24);
    assert.lengthOf(new Set(packed), 24);

    //Completes the spawn's own ring: the four axis tiles the X doesn't cover.
    [[23, 25], [27, 25], [25, 23], [25, 27]].forEach(([x, y]) => {
      assert.include(packed, packRoadPos(x, y));
    });
    //The X diagonals belong to phase 1 and are not repeated here.
    spawnCirculationDiagonals(25, 25).forEach(([x, y]) => {
      assert.notInclude(packed, packRoadPos(x, y));
    });
    //Never the spawn tile itself.
    assert.notInclude(packed, packRoadPos(25, 25));
    //One tessellation step out: the far corners of the neighbour rings.
    [[29, 27], [27, 29], [21, 23], [28, 28]].forEach(([x, y]) => {
      assert.include(packed, packRoadPos(x, y));
    });
    //Every tile really is on one of the five rings.
    const centres: [number, number][] = [[25, 25], ...spawnCirculationEdgeCentres(25, 25)];
    phase2.forEach(([x, y]) => {
      assert.isTrue(centres.some(([cx, cy]) => Math.abs(x - cx) + Math.abs(y - cy) === 2));
    });
  });

  it("phase 1 and phase 2 never share a tile", () => {
    const phase1 = pack(spawnCirculationDiagonals(10, 40));
    pack(spawnCirculationOuterRing(10, 40)).forEach(packed => assert.notInclude(phase1, packed));
  });

  it("the four pockets are the neighbour centres and stay off the road rings", () => {
    const pockets = spawnCirculationPockets(25, 25);
    assert.lengthOf(pockets, SPAWN_CIRCULATION_EXTENSIONS);
    assert.deepEqual(pack(pockets), pack(spawnCirculationEdgeCentres(25, 25)));
    const roads = pack(spawnCirculationDiagonals(25, 25)).concat(pack(spawnCirculationOuterRing(25, 25)));
    pack(pockets).forEach(packed => assert.notInclude(roads, packed));
  });

  it("pocket fallbacks are that pod's arms, which are also off the road rings", () => {
    const arms = spawnCirculationPocketArms(27, 27);
    assert.deepEqual(pack(arms), pack([[26, 27], [28, 27], [27, 26], [27, 28]]));
    const roads = pack(spawnCirculationDiagonals(25, 25)).concat(pack(spawnCirculationOuterRing(25, 25)));
    pack(arms).forEach(packed => assert.notInclude(roads, packed));
  });

  it("extension slots try every pocket before any fallback arm", () => {
    const slots = spawnCirculationExtensionSlots(25, 25);
    assert.deepEqual(pack(slots.slice(0, 4)), pack(spawnCirculationPockets(25, 25)));
    assert.lengthOf(new Set(pack(slots)), slots.length);
  });
});
