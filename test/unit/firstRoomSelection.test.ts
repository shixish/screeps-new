import { assert } from "chai";
import { RankedFirstRoom } from "../../src/utils/firstRoomScore";
import {
  FIRST_ROOM_FLAG,
  FIRST_ROOM_MAP_TOP_N,
  FIRST_ROOM_PASS2_TOP_N,
  FirstRoomMemory,
  FirstRoomRankEntry,
  bootstrapFirstRoomSelection,
  configuredPass2TopN,
  formatFirstRoomLog,
  paintFirstRoomRecommendation,
  pass2ShortlistRooms,
  publishedFirstRoomRanks,
  toPass2Entry,
  toRankEntry,
  worldKeyForSelection
} from "../../src/utils/firstRoomSelection";

function memoryRank(
  partial: Partial<FirstRoomRankEntry> & Pick<FirstRoomRankEntry, "roomName">
): FirstRoomRankEntry {
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

function emptySelection(rankedRooms: FirstRoomRankEntry[]): FirstRoomMemory {
  return {
    ranked: rankedRooms,
    candidates: rankedRooms.map(entry => entry.roomName),
    pending: [],
    intel: {},
    region: { type: "allOpen" },
    worldKey: "test",
    computedAt: 1,
    complete: true
  };
}

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
    assert.include(message, "Game.map.visual");
    assert.include(message, "room picker");
    assert.include(message, "stop once a spawn exists");
    assert.notInclude(message, "W2N1");
  });

  it("copies spawn, H, E2, D2, seats, and optional legs into pass-2 Memory entries", () => {
    const entry = toPass2Entry({
      roomName: "W2N3",
      eligible: true,
      spawnPos: { x: 18, y: 22 },
      H: 11,
      E2: 110,
      D2: 40,
      score2: 110 / 41,
      harvestSeats: [
        { x: 10, y: 10, seats: 8 },
        { x: 12, y: 10, seats: 3 }
      ],
      legs: [
        { to: "source", x: 10, y: 10, cost: 12, seat: { x: 11, y: 10 } },
        { to: "controller", x: 20, y: 20, cost: 16, seat: { x: 20, y: 21 } }
      ],
      usedChebyshev: false
    });
    assert.equal(entry.roomName, "W2N3");
    assert.deepEqual(entry.spawnPos, { x: 18, y: 22 });
    assert.equal(entry.H, 11);
    assert.equal(entry.E2, 110);
    assert.equal(entry.D2, 40);
    assert.deepEqual(entry.harvestSeats.map(seat => seat.seats), [8, 3]);
    assert.closeTo(entry.score2, 110 / 41, 1e-9);
    assert.equal(entry.legs?.[0].to, "source");
  });

  it("publishes the top 5 from pass-2 score2, not pass-1 midpoint order", () => {
    const memory: FirstRoomMemory = {
      bestRoom: "W2N1",
      ranked: [
        {
          roomName: "W1N1",
          eligible: true,
          score: 0.9,
          score2: 0.2,
          energyPerTick: 20,
          walkCost: 20,
          sourceCount: 2,
          H: 8,
          E2: 80,
          D2: 40,
          spawnPos: { x: 10, y: 10 },
          usedChebyshev: false
        },
        {
          roomName: "W2N1",
          eligible: true,
          score: 0.8,
          score2: 1.5,
          energyPerTick: 20,
          walkCost: 25,
          sourceCount: 2,
          H: 16,
          E2: 160,
          D2: 20,
          spawnPos: { x: 18, y: 22 },
          usedChebyshev: false
        },
        {
          roomName: "W3N1",
          eligible: true,
          score: 0.7,
          score2: 0.9,
          energyPerTick: 20,
          walkCost: 30,
          sourceCount: 2,
          H: 12,
          E2: 120,
          D2: 30,
          spawnPos: { x: 12, y: 12 },
          usedChebyshev: false
        }
      ],
      candidates: ["W1N1", "W2N1", "W3N1"],
      pending: [],
      intel: {},
      region: { type: "allOpen" },
      worldKey: "test",
      computedAt: 1,
      complete: true,
      pass2: {
        ranked: [
          {
            roomName: "W2N1",
            eligible: true,
            spawnPos: { x: 18, y: 22 },
            H: 16,
            E2: 160,
            D2: 20,
            score2: 1.5,
            harvestSeats: [],
            usedChebyshev: false
          },
          {
            roomName: "W3N1",
            eligible: true,
            spawnPos: { x: 12, y: 12 },
            H: 12,
            E2: 120,
            D2: 30,
            score2: 0.9,
            harvestSeats: [],
            usedChebyshev: false
          },
          {
            roomName: "W1N1",
            eligible: true,
            spawnPos: { x: 10, y: 10 },
            H: 8,
            E2: 80,
            D2: 40,
            score2: 0.2,
            harvestSeats: [],
            usedChebyshev: false
          }
        ],
        pending: [],
        complete: true,
        topN: FIRST_ROOM_PASS2_TOP_N,
        shortlistKey: "W1N1,W2N1,W3N1",
        bestRoom: "W2N1"
      }
    };

    const top = publishedFirstRoomRanks(memory, 5);
    assert.deepEqual(
      top.map(entry => entry.roomName),
      ["W2N1", "W3N1", "W1N1"]
    );

    const message = formatFirstRoomLog(memory);
    assert.include(message, "Best room W2N1");
    assert.include(message, "pass-2");
    assert.include(message, "E2 = 10 * H");
    assert.include(message, "first spawn only");
    assert.include(message, "swamp=plain");
    assert.include(message, "placeable spawn");
    assert.include(message, "W2N1 score2=");
    assert.include(message, "Game.map.visual");
    assert.notInclude(message, "W1N1 score=");
  });

  it("runs expensive pass-2 only on the top 10 pass-1 rooms, including allOpen", () => {
    assert.equal(FIRST_ROOM_PASS2_TOP_N, 10);
    assert.equal(configuredPass2TopN(), 10);

    const rankedRooms = Array.from({ length: 15 }, (_, index) =>
      memoryRank({
        roomName: `W${index}N1`,
        score: 1 - index * 0.01
      })
    );
    const memory = emptySelection(rankedRooms);
    const shortlist = pass2ShortlistRooms(memory);

    assert.equal(shortlist.length, 10);
    assert.deepEqual(
      shortlist,
      rankedRooms.slice(0, 10).map(entry => entry.roomName)
    );
    assert.notInclude(shortlist, "W10N1");
    assert.notInclude(shortlist, "W14N1");
  });

  it("honors Memory.firstRoomPass2TopN and does not treat 0 as all rooms", () => {
    const previous = (global as { Memory?: { firstRoomPass2TopN?: number } }).Memory;
    try {
      (global as { Memory: { firstRoomPass2TopN: number } }).Memory = { firstRoomPass2TopN: 3 };

      const rankedRooms = Array.from({ length: 12 }, (_, index) =>
        memoryRank({
          roomName: `W${index}N1`,
          score: 1 - index * 0.01
        })
      );
      assert.equal(configuredPass2TopN(), 3);
      assert.deepEqual(pass2ShortlistRooms(emptySelection(rankedRooms)), ["W0N1", "W1N1", "W2N1"]);

      (global as { Memory: { firstRoomPass2TopN: number } }).Memory = { firstRoomPass2TopN: 0 };
      assert.equal(configuredPass2TopN(), FIRST_ROOM_PASS2_TOP_N);
    } finally {
      if (previous) {
        (global as { Memory: unknown }).Memory = previous;
      } else {
        delete (global as { Memory?: unknown }).Memory;
      }
    }
  });

  it("does not publish pass-1 rooms outside the pass-2 shortlist into the top 5", () => {
    const rankedRooms = Array.from({ length: 12 }, (_, index) =>
      memoryRank({
        roomName: `W${index}N1`,
        score: 1 - index * 0.01,
        score2: index === 11 ? 9 : 0.5 - index * 0.01,
        H: 8,
        E2: 80,
        D2: 20,
        spawnPos: { x: 10, y: 10 }
      })
    );
    const shortlist = rankedRooms.slice(0, 10);
    const memory = emptySelection(rankedRooms);
    memory.bestRoom = "W0N1";
    memory.pass2 = {
      ranked: shortlist.map(entry => ({
        roomName: entry.roomName,
        eligible: true,
        spawnPos: entry.spawnPos,
        H: 8,
        E2: 80,
        D2: 20,
        score2: entry.score2 ?? 0,
        harvestSeats: [],
        usedChebyshev: false
      })),
      pending: [],
      complete: true,
      topN: 10,
      shortlistKey: shortlist.map(entry => entry.roomName).join(","),
      bestRoom: "W0N1"
    };

    const top = publishedFirstRoomRanks(memory, 5);
    assert.equal(top.length, 5);
    assert.deepEqual(
      top.map(entry => entry.roomName),
      ["W0N1", "W1N1", "W2N1", "W3N1", "W4N1"]
    );
    assert.notInclude(
      top.map(entry => entry.roomName),
      "W11N1"
    );
  });

  it("changes worldKey when the visible room set changes", () => {
    const region = { type: "visible" as const };
    const a = worldKeyForSelection(region, ["W1N1"], []);
    const b = worldKeyForSelection(region, ["W1N1", "W2N1"], []);
    assert.notEqual(a, b);
  });

  it("draws top 5 map ranks while bootstrap recommendation is active", () => {
    class FakePos {
      public constructor(
        public x: number,
        public y: number,
        public roomName: string
      ) {}
    }
    const previousPos = (global as { RoomPosition?: unknown }).RoomPosition;
    const previousGame = (global as { Game?: unknown }).Game;
    (global as { RoomPosition: typeof FakePos }).RoomPosition = FakePos;

    const texts: string[] = [];
    (global as { Game: unknown }).Game = {
      rooms: {},
      flags: {},
      map: {
        visual: {
          rect() {
            return undefined;
          },
          text(label: string, pos: FakePos) {
            texts.push(`${pos.roomName}:${label}`);
          }
        }
      }
    };

    const memory: FirstRoomMemory = {
      bestRoom: "W1N1",
      ranked: [1, 2, 3, 4, 5, 6].map(n => ({
        roomName: `W${n}N1`,
        eligible: true,
        score: 1 - n * 0.1,
        energyPerTick: 20,
        walkCost: 40,
        sourceCount: 2,
        usedChebyshev: false
      })),
      candidates: [],
      pending: [],
      intel: {},
      region: { type: "allOpen" },
      worldKey: "test",
      computedAt: 1,
      complete: true,
      logged: true
    };

    paintFirstRoomRecommendation(memory);
    assert.equal(FIRST_ROOM_MAP_TOP_N, 5);
    assert.equal(texts.length, 5);
    assert.equal(texts[0], "W1N1:#1 0.90");
    assert.isUndefined(texts.find(line => line.startsWith("W6N1")));

    texts.length = 0;
    paintFirstRoomRecommendation({ ...memory, settled: true });
    assert.equal(texts.length, 0);

    if (previousPos) {
      (global as { RoomPosition: unknown }).RoomPosition = previousPos;
    } else {
      delete (global as { RoomPosition?: unknown }).RoomPosition;
    }
    if (previousGame) {
      (global as { Game: unknown }).Game = previousGame;
    } else {
      delete (global as { Game?: unknown }).Game;
    }
  });

  it("settles and does not paint overlays once an owned spawn exists", () => {
    class FakePos {
      public constructor(
        public x: number,
        public y: number,
        public roomName: string
      ) {}
    }
    const previousPos = (global as { RoomPosition?: unknown }).RoomPosition;
    const previousGame = (global as { Game?: unknown }).Game;
    const previousMemory = (global as { Memory?: unknown }).Memory;
    (global as { RoomPosition: typeof FakePos }).RoomPosition = FakePos;

    const mapTexts: string[] = [];
    const roomTexts: string[] = [];
    const firstRoom: FirstRoomMemory = {
      bestRoom: "W1N1",
      ranked: [1, 2, 3].map(n => ({
        roomName: `W${n}N1`,
        eligible: true,
        score: 1 - n * 0.1,
        energyPerTick: 20,
        walkCost: 40,
        sourceCount: 2,
        usedChebyshev: false
      })),
      candidates: ["W1N1"],
      pending: ["W2N1"],
      intel: {},
      region: { type: "allOpen" },
      worldKey: "test",
      computedAt: 1,
      complete: true,
      logged: true,
      settled: false
    };

    (global as { Memory: unknown }).Memory = { firstRoom };
    (global as { Game: unknown }).Game = {
      time: 10,
      spawns: { Spawn1: { id: "spawn" } },
      rooms: {
        W1N1: {
          name: "W1N1",
          controller: { pos: { x: 10, y: 10 } },
          visual: {
            rect() {
              return undefined;
            },
            text(label: string) {
              roomTexts.push(label);
            }
          },
          createFlag() {
            return 0;
          }
        }
      },
      flags: {},
      map: {
        visual: {
          rect() {
            return undefined;
          },
          text(label: string, pos: FakePos) {
            mapTexts.push(`${pos.roomName}:${label}`);
          }
        }
      }
    };

    const recommended = bootstrapFirstRoomSelection();
    assert.isUndefined(recommended);
    assert.isTrue(firstRoom.settled);
    assert.deepEqual(firstRoom.pending, []);
    assert.equal(mapTexts.length, 0);
    assert.equal(roomTexts.length, 0);

    if (previousPos) {
      (global as { RoomPosition: unknown }).RoomPosition = previousPos;
    } else {
      delete (global as { RoomPosition?: unknown }).RoomPosition;
    }
    if (previousGame) {
      (global as { Game: unknown }).Game = previousGame;
    } else {
      delete (global as { Game?: unknown }).Game;
    }
    if (previousMemory) {
      (global as { Memory: unknown }).Memory = previousMemory;
    } else {
      delete (global as { Memory?: unknown }).Memory;
    }
  });

  it("draws in-room rank labels on visible top rooms while bootstrap is active", () => {
    class FakePos {
      public constructor(
        public x: number,
        public y: number,
        public roomName: string
      ) {}
    }
    const previousPos = (global as { RoomPosition?: unknown }).RoomPosition;
    const previousGame = (global as { Game?: unknown }).Game;
    (global as { RoomPosition: typeof FakePos }).RoomPosition = FakePos;

    const roomTexts: string[] = [];
    (global as { Game: unknown }).Game = {
      rooms: {
        W2N1: {
          name: "W2N1",
          controller: { pos: { x: 8, y: 9 } },
          visual: {
            rect() {
              return undefined;
            },
            text(label: string) {
              roomTexts.push(`W2N1:${label}`);
            }
          },
          createFlag() {
            return 0;
          }
        }
      },
      flags: {},
      map: {
        visual: {
          rect() {
            return undefined;
          },
          text() {
            return undefined;
          }
        }
      }
    };

    const memory: FirstRoomMemory = {
      bestRoom: "W1N1",
      ranked: [
        {
          roomName: "W1N1",
          eligible: true,
          score: 1.82,
          energyPerTick: 20,
          walkCost: 10,
          sourceCount: 2,
          usedChebyshev: false
        },
        {
          roomName: "W2N1",
          eligible: true,
          score: 0.9,
          energyPerTick: 20,
          walkCost: 21,
          sourceCount: 2,
          usedChebyshev: false
        }
      ],
      candidates: [],
      pending: [],
      intel: {},
      region: { type: "allOpen" },
      worldKey: "test",
      computedAt: 1,
      complete: true,
      logged: true
    };

    paintFirstRoomRecommendation(memory);
    assert.deepEqual(roomTexts, ["W2N1:#2 0.90"]);

    roomTexts.length = 0;
    paintFirstRoomRecommendation({ ...memory, settled: true });
    assert.equal(roomTexts.length, 0);

    if (previousPos) {
      (global as { RoomPosition: unknown }).RoomPosition = previousPos;
    } else {
      delete (global as { RoomPosition?: unknown }).RoomPosition;
    }
    if (previousGame) {
      (global as { Game: unknown }).Game = previousGame;
    } else {
      delete (global as { Game?: unknown }).Game;
    }
  });
});
