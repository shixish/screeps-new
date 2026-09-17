import { assert } from "chai";
import { RankedFirstRoom, SOURCE_PAIR_WEIGHT } from "../../src/utils/firstRoomScore";
import {
  FIRST_ROOM_FLAG,
  formatFirstRoomLog,
  toRankEntry,
  worldKeyForSelection
} from "../../src/utils/firstRoomSelection";

function ranked(partial: Partial<RankedFirstRoom> & Pick<RankedFirstRoom, "roomName">): RankedFirstRoom {
  return {
    eligible: true,
    rankCost: 10001,
    sourceCount: 2,
    sourcePairCost: 1,
    controllerCost: 1,
    usedChebyshev: false,
    ...partial
  };
}

describe("firstRoomSelection", () => {
  it("names the recommendation flag without a FlagType prefix", () => {
    assert.equal(FIRST_ROOM_FLAG, "first-room");
    assert.notInclude(FIRST_ROOM_FLAG, "home:");
  });

  it("copies score breakdown into Memory entries", () => {
    const entry = toRankEntry(
      ranked({
        roomName: "W2N3",
        rankCost: 20040,
        sourcePairCost: 2,
        controllerCost: 40,
        rendezvous: { x: 12, y: 13 },
        reason: undefined
      })
    );
    assert.equal(entry.roomName, "W2N3");
    assert.equal(entry.rankCost, 20040);
    assert.deepEqual(entry.rendezvous, { x: 12, y: 13 });
    assert.isUndefined(entry.reason);
  });

  it("formats a one-shot log with the formula and top rooms", () => {
    const message = formatFirstRoomLog({
      bestRoom: "W1N1",
      ranked: [
        {
          roomName: "W1N1",
          eligible: true,
          rankCost: 30025,
          sourceCount: 2,
          sourcePairCost: 3,
          controllerCost: 25,
          usedChebyshev: false
        },
        {
          roomName: "W2N1",
          eligible: false,
          rankCost: Number.POSITIVE_INFINITY,
          sourceCount: 1,
          sourcePairCost: Number.POSITIVE_INFINITY,
          controllerCost: Number.POSITIVE_INFINITY,
          usedChebyshev: false,
          reason: "fewer than 2 sources"
        }
      ],
      candidates: ["W1N1", "W2N1"],
      pending: [],
      intel: {},
      region: { type: "allOpen" },
      worldKey: "test",
      computedAt: 1,
      complete: true
    });

    assert.include(message, "Best room W1N1");
    assert.include(message, `* ${SOURCE_PAIR_WEIGHT}`);
    assert.include(message, "Memory.firstRoom");
    assert.include(message, "W1N1 rankCost=30025");
    assert.notInclude(message, "W2N1");
  });

  it("changes worldKey when the visible room set changes", () => {
    const region = { type: "visible" as const };
    const a = worldKeyForSelection(region, ["W1N1"], []);
    const b = worldKeyForSelection(region, ["W1N1", "W2N1"], []);
    assert.notEqual(a, b);
  });
});
