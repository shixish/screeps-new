import { assert } from "chai";
import { RankedFirstRoom } from "../../src/utils/firstRoomScore";
import {
  FIRST_ROOM_FLAG,
  formatFirstRoomLog,
  toRankEntry,
  worldKeyForSelection
} from "../../src/utils/firstRoomSelection";

function ranked(partial: Partial<RankedFirstRoom> & Pick<RankedFirstRoom, "roomName">): RankedFirstRoom {
  return {
    eligible: true,
    score: 0.5,
    energyPerTick: 20,
    walkCost: 40,
    sourceCount: 2,
    usedChebyshev: false,
    ...partial
  };
}

describe("firstRoomSelection", () => {
  it("names the recommendation flag without a FlagType prefix", () => {
    assert.equal(FIRST_ROOM_FLAG, "first-room");
    assert.notInclude(FIRST_ROOM_FLAG, "home:");
  });

  it("copies E, D, midpoint, and score into Memory entries", () => {
    const entry = toRankEntry(
      ranked({
        roomName: "W2N3",
        score: 20 / 41,
        energyPerTick: 20,
        walkCost: 40,
        sourceCount: 2,
        midpoint: { x: 12, y: 13 },
        reason: undefined
      })
    );
    assert.equal(entry.roomName, "W2N3");
    assert.equal(entry.energyPerTick, 20);
    assert.equal(entry.walkCost, 40);
    assert.equal(entry.sourceCount, 2);
    assert.deepEqual(entry.midpoint, { x: 12, y: 13 });
    assert.closeTo(entry.score, 20 / 41, 1e-9);
    assert.isUndefined(entry.reason);
  });

  it("formats a one-shot log with the E/D formula and top rooms", () => {
    const message = formatFirstRoomLog({
      bestRoom: "W1N1",
      ranked: [
        {
          roomName: "W1N1",
          eligible: true,
          score: 0.5,
          energyPerTick: 20,
          walkCost: 39,
          sourceCount: 2,
          midpoint: { x: 22, y: 21 },
          usedChebyshev: false
        },
        {
          roomName: "W2N1",
          eligible: false,
          score: 0,
          energyPerTick: 10,
          walkCost: Number.POSITIVE_INFINITY,
          sourceCount: 1,
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
    assert.include(message, "E / (D + 1)");
    assert.include(message, "Memory.firstRoom");
    assert.include(message, "W1N1 score=");
    assert.include(message, "E=20 D=39");
    assert.notInclude(message, "W2N1");
  });

  it("changes worldKey when the visible room set changes", () => {
    const region = { type: "visible" as const };
    const a = worldKeyForSelection(region, ["W1N1"], []);
    const b = worldKeyForSelection(region, ["W1N1", "W2N1"], []);
    assert.notEqual(a, b);
  });
});
