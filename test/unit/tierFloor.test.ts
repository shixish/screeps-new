import { assert } from "chai";
import { CreepRoleName } from "../../src/utils/constants";
import {
  canRefillSpawn,
  getRoleTierFloor,
  isBalancedHaulBody,
  isTierFloorEmergency,
  pickAffordableTier,
  roleHasTierFloor
} from "../../src/utils/earlyEconomy";

//The Courier tiers as CourierCreep declares them: one MOVE per CARRY, every tier a round hundred.
const courierTier = (parts: number) => ({
  body: { cost: parts * 100, counts: { [CARRY]: parts, [MOVE]: parts } }
}) as any as CreepTier;
const COURIER_TIERS = [3, 4, 5, 6, 12].map(courierTier);

//The Basic tiers as BasicCreep declares them, as (cost, WORK) pairs - only WORK and CARRY are ranked on.
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

const T1_COURIER = COURIER_TIERS[0], T1_BASIC = BASIC_TIERS[0];

//The rankings the flags actually hand to findSpawnableCreep, so the tests pin the real spawn decisions.
const bootstrapCourierRank = (body: any) => isBalancedHaulBody(body) && -body.counts[CARRY]; //HarvestFlag.getBootstrapCourier
const haulShortfallRank = (needed: number) => (body: any) => isBalancedHaulBody(body) && Math.abs(needed - body.counts[CARRY]); //getRequestedCourier
const droneRank = (needed: number) => (body: any) => body.counts[WORK] > 0 && body.counts[CARRY] > 0 && Math.abs(needed - body.counts[WORK]); //HomeFlag drones
const builderRank = (needed: number) => (body: any) => body.counts[WORK] > 0 && needed % body.counts[WORK]; //HomeFlag builders

//A room audit stand-in: the tier floor only ever asks it for role counts and what the live creeps carry.
const audit = (countsByRole: Partial<Record<CreepRoleName, number>>, creeps: Partial<CreepPartsCounts>[]) => ({
  creepCountsByRole: countsByRole,
  creeps: creeps.map(counts => ({ memory: { counts } }))
}) as any as RoomAudit;

const HAULER = { [CARRY]: 2, [MOVE]: 2 }; //Anything that can walk energy into an extension.
const SEATED_MINER = { [WORK]: 5 }; //0 MOVE: tugged onto its container, never refills anything.

describe("tier floor - which roles are sized by capacity", () => {
  it("floors the generic economy bodies and nothing else", () => {
    assert.isTrue(roleHasTierFloor(CreepRoleName.Basic));
    assert.isTrue(roleHasTierFloor(CreepRoleName.Courier));
    assert.isTrue(roleHasTierFloor(CreepRoleName.RemoteCourier));
    //A static miner or a seated upgrader really is sized to its job, so those stay unfloored.
    assert.isFalse(roleHasTierFloor(CreepRoleName.Harvester));
    assert.isFalse(roleHasTierFloor(CreepRoleName.Upgrader));
    assert.equal(getRoleTierFloor(CreepRoleName.Harvester, COURIER_TIERS, 500), 0);
  });

  it("floors at the most expensive tier the capacity buys", () => {
    assert.equal(getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 300), 300);
    assert.equal(getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 500), 500);
    assert.equal(getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 550), 500);
    assert.equal(getRoleTierFloor(CreepRoleName.Basic, BASIC_TIERS, 550), 550);
    //Nothing affordable means no floor - the affordability check does the rejecting instead.
    assert.equal(getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 250), 0);
  });
});

describe("T1 bodies are banned once a higher tier is affordable", () => {
  it("bootstraps a courier at the best tier the room can buy, not the cheapest", () => {
    //The bug: the old `smallest CARRY wins` ranking picked T1 forever. It still ranks small first...
    assert.equal(pickAffordableTier(COURIER_TIERS, 500, (body: any) => body.counts[CARRY])!.body.cost, 300);
    //...but the floor takes those tiers off the table, and the ranking now prefers the big body anyway.
    const floor = getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 500);
    assert.equal(pickAffordableTier(COURIER_TIERS, 500, bootstrapCourierRank, floor)!.body.cost, 500);
    assert.equal(pickAffordableTier(COURIER_TIERS, 1200, bootstrapCourierRank, getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 1200))!.body.cost, 1200);
  });

  it("answers a small haul shortfall with one properly sized courier", () => {
    //3 CARRY short at 500 capacity: the old filter rejected everything bigger and left only the T1.
    const floor = getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 500);
    const tier = pickAffordableTier(COURIER_TIERS, 500, haulShortfallRank(3), floor);
    assert.equal(tier!.body.cost, 500);
    assert.notEqual(tier, T1_COURIER);
    //A bigger shortfall than anything affordable still picks the biggest tier the capacity buys.
    assert.equal(pickAffordableTier(COURIER_TIERS, 600, haulShortfallRank(20), getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 600))!.body.cost, 600);
  });

  it("keeps the drone/builder WORK rankings off the 1 WORK Basic", () => {
    //1 WORK missing is an exact match for the T1 body under both rankings.
    assert.equal(pickAffordableTier(BASIC_TIERS, 500, droneRank(1))!.body.cost, 300);
    assert.equal(pickAffordableTier(BASIC_TIERS, 500, builderRank(1))!.body.cost, 300);
    const floor = getRoleTierFloor(CreepRoleName.Basic, BASIC_TIERS, 500);
    assert.equal(pickAffordableTier(BASIC_TIERS, 500, droneRank(1), floor)!.body.cost, 500);
    assert.equal(pickAffordableTier(BASIC_TIERS, 500, builderRank(1), floor)!.body.cost, 500);
  });

  it("still takes the tier the room can actually pay for", () => {
    //A 300 capacity room has not outgrown anything: T1 is the top tier and stays legal.
    assert.equal(pickAffordableTier(COURIER_TIERS, 300, bootstrapCourierRank, getRoleTierFloor(CreepRoleName.Courier, COURIER_TIERS, 300)), T1_COURIER);
    assert.equal(pickAffordableTier(BASIC_TIERS, 300, droneRank(1), getRoleTierFloor(CreepRoleName.Basic, BASIC_TIERS, 300)), T1_BASIC);
  });
});

describe("emergency bootstrap lifts the floor", () => {
  it("only fires when the role is gone AND nothing can refill the extensions", () => {
    assert.isTrue(canRefillSpawn(audit({}, [HAULER, SEATED_MINER])));
    assert.isFalse(canRefillSpawn(audit({}, [SEATED_MINER])));
    assert.isFalse(canRefillSpawn(audit({}, []))); //The empty room - HomeFlag asks for this budget itself.

    //Zero couriers, but a Basic is still walking energy into the extensions: capacity is reachable, so
    //the room waits for the proper body instead of dropping to a T1.
    assert.isFalse(isTierFloorEmergency(audit({ [CreepRoleName.Courier]: 0 }, [HAULER]), CreepRoleName.Courier));
    //Zero couriers and nothing but a seated miner left: capacity is a number this room can never reach.
    assert.isTrue(isTierFloorEmergency(audit({ [CreepRoleName.Courier]: 0 }, [SEATED_MINER]), CreepRoleName.Courier));
    //Zero Basics with the drones as the harvest plan - same recovery path.
    assert.isTrue(isTierFloorEmergency(audit({ [CreepRoleName.Basic]: 0 }, []), CreepRoleName.Basic));
    //A courier already in flight (creepCountsByRole counts the one in the spawn) is not an emergency.
    assert.isFalse(isTierFloorEmergency(audit({ [CreepRoleName.Courier]: 1 }, [SEATED_MINER]), CreepRoleName.Courier));
    //Unfloored roles never take this path: a missing miner is a gate, not a bootstrap.
    assert.isFalse(isTierFloorEmergency(audit({ [CreepRoleName.Harvester]: 0 }, []), CreepRoleName.Harvester));
  });

  it("spawns whatever the energy in the room buys when the floor is lifted", () => {
    //500 capacity, 300 in the spawn, nothing alive to fill the extensions: T1 now beats nothing ever.
    assert.equal(pickAffordableTier(COURIER_TIERS, 300, bootstrapCourierRank, 0), T1_COURIER);
    assert.equal(pickAffordableTier(BASIC_TIERS, 300, undefined, 0), T1_BASIC);
    //With the floor still standing that same request buys nothing, which is why it has to be lifted.
    assert.isNull(pickAffordableTier(COURIER_TIERS, 300, bootstrapCourierRank, 500));
  });
});
