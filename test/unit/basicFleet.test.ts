import { assert } from "chai";
import { CreepRoleName } from "../../src/utils/constants";
import {
  BasicFleetRequest,
  CONSTRUCTION_SURGE_BASICS,
  countBodiesAtCost,
  getBasicFleetRequest,
  getIdleBasicFleetSize,
  getMaxAffordableTierCost,
  getRoleTierFloor,
  idleFillerRank,
  IDLE_BASIC_FLEET_SIZE,
  isDroneHarvestPhase,
  pickAffordableTier,
  surgeBuilderRank
} from "../../src/utils/earlyEconomy";

//The Basic tiers as BasicCreep declares them: (cost, WORK, CARRY, MOVE).
const basicTier = (cost: number, work: number, carry: number, move: number) => ({
  body: { cost, counts: { [WORK]: work, [CARRY]: carry, [MOVE]: move } }
}) as any as CreepTier;
const BASIC_TIERS = [
  basicTier(300, 1, 2, 2),
  basicTier(400, 2, 2, 2),
  basicTier(500, 3, 2, 2),
  basicTier(550, 3, 2, 3),
  basicTier(1200, 6, 6, 6)
];
const T1_BASIC = BASIC_TIERS[0], MAX_BASIC = BASIC_TIERS[4];

//The Courier tiers, only so the floor can be shown to be untouched by any of this.
const courierTier = (parts: number) => ({
  body: { cost: parts * 100, counts: { [CARRY]: parts, [MOVE]: parts } }
}) as any as CreepTier;
const COURIER_TIERS = [3, 4, 5, 6, 12].map(courierTier);

const basicMemory = (cost: number) => {
  const tier = BASIC_TIERS.find(candidate => candidate.body.cost === cost)!;
  return { counts: tier.body.counts };
};

//What HomeFlag hands getBasicFleetRequest: the two states plus the counts they're decided on.
const fleet = (sites: number, basics: number[], capacity: number, droneHarvestPhase = false) => ({
  droneHarvestPhase,
  constructionSites: sites,
  basics: basics.length,
  maxTierBasics: countBodiesAtCost(basics.map(basicMemory), getMaxAffordableTierCost(BASIC_TIERS, capacity)),
  idleFleetSize: getIdleBasicFleetSize(2) //Two sources, the usual owned room.
});

describe("basic fleet sizing - idle steady state", () => {
  it("keeps IDLE_BASIC_FLEET_SIZE cheap fillers in circulation with nothing to build", () => {
    //A finished room at 1200 capacity: no sites, so it tops up to 2 and stops.
    assert.equal(getBasicFleetRequest(fleet(0, [], 1200)), BasicFleetRequest.IdleFiller);
    assert.equal(getBasicFleetRequest(fleet(0, [300], 1200)), BasicFleetRequest.IdleFiller);
    assert.equal(getIdleBasicFleetSize(2), IDLE_BASIC_FLEET_SIZE);
    assert.equal(getBasicFleetRequest(fleet(0, [300, 300], 1200)), BasicFleetRequest.None);
  });

  it("stops replacing the surge bodies the moment the sites clear", () => {
    //Four Basics, two of them 1200 surge bodies. Nothing is suicided; we simply stop asking, and as the
    //big ones TTL out the room drains back to the two fillers.
    assert.equal(getBasicFleetRequest(fleet(0, [300, 300, 1200, 1200], 1200)), BasicFleetRequest.None);
    //The last surge body dies with only one filler left: that gets replaced, at the cheap tier.
    assert.equal(getBasicFleetRequest(fleet(0, [300], 1200)), BasicFleetRequest.IdleFiller);
  });

  it("never idles below one Basic per source, so canBootstrapCourier can still pass", () => {
    //canBootstrapCourier wants a Basic per source before any static miner plan starts, so a 3 source
    //room floors at 3 rather than at the flat 2.
    assert.equal(getIdleBasicFleetSize(3), 3);
    assert.equal(getIdleBasicFleetSize(1), IDLE_BASIC_FLEET_SIZE);
    assert.equal(getBasicFleetRequest({ ...fleet(0, [300, 300], 1200), idleFleetSize: getIdleBasicFleetSize(3) }), BasicFleetRequest.IdleFiller);
  });

  it("spawns the cheapest body that can work and carry, floor lifted", () => {
    //The idle path is the one place a Basic is deliberately bought below the tier floor.
    assert.equal(pickAffordableTier(BASIC_TIERS, 1200, idleFillerRank, 0), T1_BASIC);
    //With the floor still standing (every other Basic path) that same ranking buys the top tier instead,
    //which is exactly why the idle path has to opt out of it.
    const floor = getRoleTierFloor(CreepRoleName.Basic, BASIC_TIERS, 1200);
    assert.equal(pickAffordableTier(BASIC_TIERS, 1200, idleFillerRank, floor), MAX_BASIC);
    //A filler still has to be able to fetch its own energy and use it.
    assert.isFalse(idleFillerRank({ counts: { [WORK]: 0, [CARRY]: 4 } } as any));
    assert.isFalse(idleFillerRank({ counts: { [WORK]: 2, [CARRY]: 0 } } as any));
  });
});

describe("basic fleet sizing - construction surge", () => {
  it("asks for CONSTRUCTION_SURGE_BASICS max-tier builders while sites are outstanding", () => {
    assert.equal(CONSTRUCTION_SURGE_BASICS, 2);
    //1200 capacity with nothing but bootstrap T1s: neither counts as a surge body.
    assert.equal(getBasicFleetRequest(fleet(1, [300, 300], 1200)), BasicFleetRequest.ConstructionSurge);
    assert.equal(getBasicFleetRequest(fleet(1, [300, 300, 1200], 1200)), BasicFleetRequest.ConstructionSurge);
    //+2 max-tier bodies in flight: that's the surge, stop asking even with sites left.
    assert.equal(getBasicFleetRequest(fleet(12, [300, 300, 1200, 1200], 1200)), BasicFleetRequest.None);
  });

  it("counts surge bodies against the capacity, not against a fixed cost", () => {
    //Same fleet, a 500 capacity room: the 500 bodies *are* its max tier, so the surge is covered.
    assert.equal(getBasicFleetRequest(fleet(1, [500, 500], 500)), BasicFleetRequest.None);
    //Extensions go up, capacity reaches 1200, and those same bodies stop counting - surge again.
    assert.equal(getBasicFleetRequest(fleet(1, [500, 500], 1200)), BasicFleetRequest.ConstructionSurge);
  });

  it("tops the idle floor up with a surge body rather than a filler while there is work", () => {
    //3 sources (floor of 3) with 2 surge bodies flying: the third Basic is still worth a big body.
    const state = { ...fleet(1, [1200, 1200], 1200), idleFleetSize: getIdleBasicFleetSize(3) };
    assert.equal(getBasicFleetRequest(state), BasicFleetRequest.ConstructionSurge);
  });

  it("takes the biggest affordable body with the floor intact", () => {
    const floor = getRoleTierFloor(CreepRoleName.Basic, BASIC_TIERS, 1200);
    assert.equal(pickAffordableTier(BASIC_TIERS, 1200, surgeBuilderRank, floor), MAX_BASIC);
    //A room that has outgrown nothing yet still buys what it can afford.
    assert.equal(pickAffordableTier(BASIC_TIERS, 300, surgeBuilderRank, getRoleTierFloor(CreepRoleName.Basic, BASIC_TIERS, 300)), T1_BASIC);
    assert.isFalse(surgeBuilderRank({ counts: { [WORK]: 0, [CARRY]: 4 } } as any));
  });
});

describe("basic fleet sizing - early bootstrap is untouched", () => {
  it("leaves the request to the drone saturation gate while Basics are the harvest plan", () => {
    //Unsaturated sources and no static miners: HomeFlag stage 1 owns the request, so this policy says
    //nothing - a two-Basic idle cap here would stop the drone pool from ever reaching saturation.
    assert.isTrue(isDroneHarvestPhase(false, false));
    assert.equal(getBasicFleetRequest(fleet(0, [], 300, true)), BasicFleetRequest.None);
    assert.equal(getBasicFleetRequest(fleet(0, [300, 300, 300], 550, true)), BasicFleetRequest.None);
    //Sites outstanding doesn't change that: drones first, construction once the sources are covered.
    assert.equal(getBasicFleetRequest(fleet(8, [300, 300, 300], 550, true)), BasicFleetRequest.None);
  });

  it("hands over once the seats/WORK are saturated or the miners have taken over", () => {
    assert.isFalse(isDroneHarvestPhase(true, false)); //Drones filled the seats.
    assert.isFalse(isDroneHarvestPhase(false, true)); //Static miners own every source.
    assert.equal(getBasicFleetRequest(fleet(0, [300, 300, 300], 550)), BasicFleetRequest.None);
  });
});

describe("the Courier tier floor is unaffected", () => {
  it("still bans the bodies a room has outgrown", () => {
    //Nothing in the Basic fleet policy touches Couriers: their floor is still the max affordable tier,
    //and there is no idle path that lifts it (only isTierFloorEmergency does).
    assert.equal(getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 500), 500);
    assert.equal(pickAffordableTier(COURIER_TIERS, 500, undefined, getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 500))!.body.cost, 500);
    assert.isNull(pickAffordableTier(COURIER_TIERS, 300, undefined, 500));
  });
});
