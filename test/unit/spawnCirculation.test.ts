import { assert } from "chai";
import { packRoadPos } from "../../src/utils/earlyEconomy";
import {
  SPAWN_CIRCULATION_EXTENSIONS,
  SPAWN_CIRCULATION_FALLBACK_RANGE,
  spawnCirculationDiagonals,
  spawnCirculationEdgeCentres,
  spawnCirculationNearbySlots,
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

  it("nearby fallback slots stay off the circulation roads and come nearest first", () => {
    const slots = spawnCirculationNearbySlots(25, 25);
    const roads = pack(spawnCirculationDiagonals(25, 25)).concat(pack(spawnCirculationOuterRing(25, 25)));
    assert.isNotEmpty(slots);
    assert.lengthOf(new Set(pack(slots)), slots.length);
    slots.forEach(([x, y]) => {
      const distance = Math.abs(x - 25) + Math.abs(y - 25);
      assert.isAbove(distance, 0);
      assert.isAtMost(distance, SPAWN_CIRCULATION_FALLBACK_RANGE);
      assert.notInclude(roads, packRoadPos(x, y));
    });
    const distances = slots.map(([x, y]) => Math.abs(x - 25) + Math.abs(y - 25));
    distances.forEach((distance, index) => index && assert.isAtLeast(distance, distances[index - 1]));
    //The spawn pod's own arms are the closest thing to the spawn that isn't a road.
    assert.deepEqual(pack(slots.slice(0, 4)), pack(spawnCirculationPocketArms(25, 25)));
  });

  it("nearby fallback slots prefer lattice tiles at the same distance", () => {
    const slots = spawnCirculationNearbySlots(25, 25);
    //Manhattan 3 is all arm parity, so the neighbouring pods' arms are in there.
    const distance3 = slots.filter(([x, y]) => Math.abs(x - 25) + Math.abs(y - 25) === 3);
    assert.includeDeepMembers(distance3, [[26, 27], [24, 23]]);
    //0 = pod centre, 1 = pod arm, 2 = off the lattice. Rank never drops inside a distance band.
    const rank = ([x, y]: [number, number]) => {
      const dx = x - 25, dy = y - 25;
      if (dx % 2 === 0 && dy % 2 === 0) return 0;
      return (dx + dy) % 2 !== 0 ? 1 : 2;
    };
    for (let distance = 1; distance <= SPAWN_CIRCULATION_FALLBACK_RANGE; distance++) {
      const band = slots.filter(([x, y]) => Math.abs(x - 25) + Math.abs(y - 25) === distance).map(rank);
      band.forEach((value, index) => index && assert.isAtLeast(value, band[index - 1]));
    }
    //The pod centres one step past the pockets beat the off-lattice tiles the same distance out.
    const distance6 = slots.filter(([x, y]) => Math.abs(x - 25) + Math.abs(y - 25) === 6);
    assert.equal(rank(distance6[0]), 0);
    assert.isTrue(distance6.some(coord => rank(coord) === 2));
  });

  it("the fallback keeps enough free tiles to finish the extensions off-lattice", () => {
    //W1N4: every pocket and nearly every arm is blocked, so the sweep has to supply the slots.
    const slots = spawnCirculationExtensionSlots(27, 10);
    const beyondLattice = slots.filter(([x, y]) => (
      !spawnCirculationPockets(27, 10).some(([px, py]) => px === x && py === y) &&
      !spawnCirculationEdgeCentres(27, 10).some(([cx, cy]) => (
        spawnCirculationPocketArms(cx, cy).some(([ax, ay]) => ax === x && ay === y)
      ))
    ));
    assert.isAtLeast(beyondLattice.length, SPAWN_CIRCULATION_EXTENSIONS);
    //Free plain tiles the live room actually had, which the old pocket-only list never reached.
    [[30, 10], [24, 10], [27, 7]].forEach(([x, y]) => {
      assert.include(pack(slots), packRoadPos(x, y));
    });
  });

  it("slots near the room edge stay inside the buildable area", () => {
    spawnCirculationNearbySlots(3, 46).forEach(([x, y]) => {
      assert.isAtLeast(x, 1);
      assert.isAtLeast(y, 1);
      assert.isAtMost(x, 48);
      assert.isAtMost(y, 48);
    });
  });
});
