import { assert } from "chai";
import { CreepRoleName } from "../../src/utils/constants";
import {
  TUG_PROGRESS_TIMEOUT,
  claimTugTarget,
  clearTugClaim,
  compareTugCandidates,
  getActiveTugClaims,
  getTugRolePriority,
  isTugClaimStale,
  markTugProgress,
  pickTugTarget,
  recordTugProgress,
  shouldYieldTugClaim
} from "../../src/utils/seatTug";

const range = (a: { x: number, y: number }, b: { x: number, y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

//Minimal creep stand-in: seat tug only ever asks a position for its range/adjacency.
const creep = (name: string, role: CreepRoleName, x: number, y: number, memory: any = {}) => ({
  name,
  memory: { role, counts: {}, ...memory },
  pos: {
    x,
    y,
    getRangeTo: (other: any) => range({ x, y }, other.pos),
    isNearTo: (other: any) => range({ x, y }, other.pos) <= 1
  }
}) as any;

describe("seat tug target selection", () => {
  it("ranks unseated miners ahead of unseated upgraders", () => {
    assert.isBelow(getTugRolePriority(CreepRoleName.Harvester), getTugRolePriority(CreepRoleName.Upgrader));
    //Even a miner on the far side of the room outranks an upgrader we're standing next to.
    assert.isBelow(compareTugCandidates(
      { role: CreepRoleName.Harvester, range: 20 },
      { role: CreepRoleName.Upgrader, range: 1 }
    ), 0);
  });

  it("breaks ties between same-role candidates by range", () => {
    assert.isBelow(compareTugCandidates(
      { role: CreepRoleName.Harvester, range: 3 },
      { role: CreepRoleName.Harvester, range: 8 }
    ), 0);
    assert.equal(compareTugCandidates(
      { role: CreepRoleName.Upgrader, range: 4 },
      { role: CreepRoleName.Upgrader, range: 4 }
    ), 0);
  });

  it("picks the miner over a nearer upgrader, then the nearest miner", () => {
    const courier = creep("courier1", CreepRoleName.Courier, 25, 6);
    const upgrader = creep("upgrader1", CreepRoleName.Upgrader, 25, 7);
    const farMiner = creep("miner-far", CreepRoleName.Harvester, 28, 9);
    const nearMiner = creep("miner-near", CreepRoleName.Harvester, 26, 8);
    assert.equal(pickTugTarget(courier, [upgrader, farMiner])!.name, "miner-far");
    assert.equal(pickTugTarget(courier, [upgrader, farMiner, nearMiner])!.name, "miner-near");
    assert.isNull(pickTugTarget(courier, []));
  });
});

describe("seat tug claim staleness", () => {
  it("keeps a claim while the courier is still closing in", () => {
    const memory: any = { role: CreepRoleName.Courier, counts: {} };
    claimTugTarget(memory, "miner1", 6, 100);
    assert.isFalse(isTugClaimStale(memory, 100 + TUG_PROGRESS_TIMEOUT));
    //Getting closer refreshes the claim, standing still does not.
    assert.isTrue(recordTugProgress(memory, 5, 105));
    assert.isFalse(recordTugProgress(memory, 5, 106));
    assert.isFalse(isTugClaimStale(memory, 105 + TUG_PROGRESS_TIMEOUT));
    assert.isTrue(isTugClaimStale(memory, 106 + TUG_PROGRESS_TIMEOUT));
  });

  it("treats the pull itself as progress even though the range never changes", () => {
    const memory: any = { role: CreepRoleName.Courier, counts: {} };
    claimTugTarget(memory, "miner1", 1, 100);
    markTugProgress(memory, 1, 100 + TUG_PROGRESS_TIMEOUT);
    assert.isFalse(isTugClaimStale(memory, 100 + TUG_PROGRESS_TIMEOUT));
  });

  it("counts a claim from before progress tracking as stale, and a cleared one as no claim", () => {
    assert.isTrue(isTugClaimStale({ tugTarget: "miner1" } as any, 100));
    const memory: any = { role: CreepRoleName.Courier, counts: {} };
    claimTugTarget(memory, "miner1", 4, 100);
    clearTugClaim(memory);
    assert.deepEqual(memory, { role: CreepRoleName.Courier, counts: {} });
    assert.isFalse(isTugClaimStale(memory, 999));
  });

  it("only blocks a target while somebody is making progress on it", () => {
    const working = creep("courier1", CreepRoleName.Courier, 25, 6, { tugTarget: "miner1", tugRange: 3, tugProgressTick: 100 });
    const stalled = creep("courier2", CreepRoleName.Courier, 25, 6, { tugTarget: "miner2", tugRange: 4, tugProgressTick: 10 });
    global.Game = { time: 100 } as any;
    const claimed = getActiveTugClaims([working, stalled]);
    assert.isTrue(claimed.has("miner1"));
    assert.isFalse(claimed.has("miner2"));
  });
});

describe("seat tug claim handover", () => {
  const target = creep("miner1", CreepRoleName.Harvester, 29, 12);

  beforeEach(() => {
    global.Game = { time: 100 } as any;
  });

  it("yields to a free courier that's already adjacent to the static", () => {
    const courier = creep("courier1", CreepRoleName.Courier, 25, 6, { tugTarget: "miner1" });
    const adjacent = creep("courier2", CreepRoleName.Courier, 29, 11);
    assert.isTrue(shouldYieldTugClaim(courier, target, [adjacent]));
  });

  it("never yields a claim we're adjacent to ourselves", () => {
    const courier = creep("courier1", CreepRoleName.Courier, 29, 11, { tugTarget: "miner1" });
    const adjacent = creep("courier2", CreepRoleName.Courier, 29, 13);
    assert.isFalse(shouldYieldTugClaim(courier, target, [adjacent]));
  });

  it("doesn't yield to a courier that is busy with a live claim of its own", () => {
    const courier = creep("courier1", CreepRoleName.Courier, 25, 6, { tugTarget: "miner1" });
    const busy = creep("courier2", CreepRoleName.Courier, 29, 11, { tugTarget: "upgrader1", tugRange: 2, tugProgressTick: 100 });
    assert.isFalse(shouldYieldTugClaim(courier, target, [busy]));
    //...unless that claim has gone stale, in which case it has nothing better to do.
    busy.memory.tugProgressTick = 10;
    assert.isTrue(shouldYieldTugClaim(courier, target, [busy]));
  });

  it("doesn't yield to a courier that is nowhere near the static", () => {
    const courier = creep("courier1", CreepRoleName.Courier, 25, 6, { tugTarget: "miner1" });
    const far = creep("courier2", CreepRoleName.Courier, 10, 40);
    assert.isFalse(shouldYieldTugClaim(courier, target, [far]));
  });
});
