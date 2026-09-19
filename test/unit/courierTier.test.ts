import { assert } from "chai";
import {
  COURIER_TIER_UPGRADE_HEADROOM,
  countBodiesAtCost,
  getBodyCostFromCounts,
  getMaxAffordableTierCost,
  isBalancedHaulBody,
  needsCourierTierUpgrade
} from "../../src/utils/earlyEconomy";

//The Courier tiers as CourierCreep declares them: one MOVE per CARRY, every tier a round hundred.
const courierTier = (parts: number) => ({
  body: { cost: parts * 100, counts: { [CARRY]: parts, [MOVE]: parts } }
}) as any as CreepTier;
const COURIER_TIERS = [3, 4, 5, 6, 12].map(courierTier);

const courierMemory = (parts: number) => ({ counts: { [CARRY]: parts, [MOVE]: parts } });
//A 5 WORK static miner - the body the room wants to build next once the extensions are up.
const MINER_5W = { [WORK]: 5 };

describe("courier body sizing", () => {
  it("rebuilds a body cost from the part counts stored on creep memory", () => {
    assert.equal(getBodyCostFromCounts(courierMemory(3).counts), 300);
    assert.equal(getBodyCostFromCounts(MINER_5W), 500);
  });

  it("takes the most expensive balanced tier the capacity buys", () => {
    assert.equal(getMaxAffordableTierCost(COURIER_TIERS, 300, isBalancedHaulBody), 300);
    //4 extensions: 500 capacity buys the 5 CARRY / 5 MOVE courier.
    assert.equal(getMaxAffordableTierCost(COURIER_TIERS, 500, isBalancedHaulBody), 500);
    assert.equal(getMaxAffordableTierCost(COURIER_TIERS, 550, isBalancedHaulBody), 500);
    assert.equal(getMaxAffordableTierCost(COURIER_TIERS, 250, isBalancedHaulBody), 0);
  });

  it("rejects haul bodies whose CARRY outruns their MOVE", () => {
    assert.isTrue(isBalancedHaulBody({ counts: { [CARRY]: 5, [MOVE]: 5 } } as any));
    assert.isFalse(isBalancedHaulBody({ counts: { [CARRY]: 6, [MOVE]: 5 } } as any));
    assert.isFalse(isBalancedHaulBody({ counts: { [CARRY]: 0, [MOVE]: 5 } } as any));
  });
});

describe("courier tier upgrade gate", () => {
  const required = 2; //couriersRequiredForNextStaticMiner once the first miner is up.

  it("asks for a replacement while the fleet is stuck on the old tier", () => {
    //W1N4: two 300-energy couriers, 500 capacity, and specialists queued up behind them.
    const fleet = [courierMemory(3), courierMemory(3)];
    assert.equal(countBodiesAtCost(fleet, 500), 0);
    assert.isTrue(needsCourierTierUpgrade(fleet, 500, required));
  });

  it("stops once enough couriers are at the affordable tier", () => {
    const fleet = [courierMemory(3), courierMemory(5), courierMemory(5)];
    assert.equal(countBodiesAtCost(fleet, 500), 2);
    assert.isFalse(needsCourierTierUpgrade(fleet, 500, required));
  });

  it("keeps only one replacement in flight so the room isn't spawning a second fleet", () => {
    const fleet = [courierMemory(3), courierMemory(3), courierMemory(5)];
    assert.equal(fleet.length, required + COURIER_TIER_UPGRADE_HEADROOM);
    assert.isFalse(needsCourierTierUpgrade(fleet, 500, required));
    //An undersized body retiring makes room for the next replacement.
    assert.isTrue(needsCourierTierUpgrade(fleet.slice(1), 500, required));
  });

  it("leaves the very first couriers to the bootstrap count gates", () => {
    assert.isFalse(needsCourierTierUpgrade([], 500, required));
    assert.isFalse(needsCourierTierUpgrade([courierMemory(3)], 0, required));
  });

  it("holds the miner/upgrader upgrade only while a bigger courier is actually affordable", () => {
    const fleet = [courierMemory(3), courierMemory(3)];
    //300 capacity: the 300 courier already is the top tier, so the specialists aren't blocked.
    assert.isFalse(needsCourierTierUpgrade(fleet, getMaxAffordableTierCost(COURIER_TIERS, 300, isBalancedHaulBody), required));
    //500 capacity buys both a 5 CARRY courier and a 5 WORK miner - the courier goes first.
    assert.equal(getBodyCostFromCounts(MINER_5W), 500);
    assert.isTrue(needsCourierTierUpgrade(fleet, getMaxAffordableTierCost(COURIER_TIERS, 500, isBalancedHaulBody), required));
  });
});
