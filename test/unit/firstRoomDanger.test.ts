import { assert } from "chai";
import {
  BLOCKED_PATH_COST,
  DANGER_WEIGHT,
  NPC_DANGER_PENALTY,
  OPPORTUNITY_WEIGHT,
  applyDangerToScore2,
  applyNeighborTermsToScore2,
  classifyNeighbor,
  neighborOpportunityBonus,
  playerNeighborPenalty,
  scoreAdjacentNeighbors,
  scoreNeighborDanger
} from "../../src/utils/firstRoomDanger";
import {
  SCORE_EPSILON,
  compareFirstRoomPass2Scores,
  rankFirstRoomsPass2,
  scoreFirstRoomPass2,
  scoreRoomLayout
} from "../../src/utils/firstRoomScore";
import { ROOM_SIZE, tileIndex } from "../../src/utils/spawnPlacement";

const PLAIN = 0;
const WALL = 1;

function makeTerrain(fill = PLAIN): number[] {
  return new Array<number>(ROOM_SIZE * ROOM_SIZE).fill(fill);
}

function setTile(grid: number[], x: number, y: number, value: number): void {
  grid[tileIndex(x, y)] = value;
}

function getter(grid: number[]) {
  return (x: number, y: number) => grid[tileIndex(x, y)];
}

describe("firstRoomDanger", () => {
  const open = getter(makeTerrain());
  const compactSources = [
    { x: 20, y: 20 },
    { x: 28, y: 20 }
  ];
  const compactController = { x: 24, y: 28 };

  it("classifies empty, player, invader, and source-keeper neighbors", () => {
    assert.equal(classifyNeighbor({ roomName: "W1N1" }), "empty");
    assert.equal(classifyNeighbor({ roomName: "W1N1", owner: "Alice" }), "player");
    assert.equal(classifyNeighbor({ roomName: "W1N1", owner: "Invader" }), "npc");
    assert.equal(classifyNeighbor({ roomName: "W1N1", owner: "Source Keeper" }), "npc");
    assert.equal(classifyNeighbor({ roomName: "E5N5" }), "npc");
    assert.equal(classifyNeighbor({ roomName: "W1N1", reserved: true, reservationOwner: "Alice" }), "empty");
    assert.equal(classifyNeighbor({ roomName: "W1N1", my: true, owner: "me" }), "empty");
  });

  it("treats source-keeper sector neighbors as NPC even without owner intel", () => {
    const result = scoreNeighborDanger({
      roomName: "E3N3",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open
    });
    const sk = result.neighbors.filter(entry => entry.kind === "npc");
    assert.isAtLeast(sk.length, 1);
    assert.isTrue(sk.some(entry => entry.roomName === "E4N4"));
    assert.equal(result.danger, sk.length * NPC_DANGER_PENALTY);
  });

  it("increases player penalty with controller level and decreases it with distance", () => {
    const close = playerNeighborPenalty(3, 20);
    const highRcl = playerNeighborPenalty(8, 20);
    const far = playerNeighborPenalty(3, 80);
    assert.isAbove(highRcl, close);
    assert.isBelow(far, close);
    assert.equal(close, (3 + 2) / (20 + 10));
    assert.equal(highRcl, (8 + 2) / (20 + 10));
  });

  it("applies a small constant for invader neighbors, ignoring a fake high RCL", () => {
    const result = scoreNeighborDanger({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        {
          roomName: "W0N1",
          owner: "Invader",
          controllerLevel: 8,
          spawnPos: { x: 2, y: 25 }
        }
      ]
    });
    assert.equal(result.danger, NPC_DANGER_PENALTY);
    assert.equal(result.neighbors.length, 1);
    assert.equal(result.neighbors[0].kind, "npc");
    assert.equal(result.neighbors[0].penalty, NPC_DANGER_PENALTY);
    assert.isUndefined(result.neighbors[0].controllerLevel);

    const player = scoreNeighborDanger({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        {
          roomName: "W0N1",
          owner: "Alice",
          controllerLevel: 8,
          spawnPos: { x: 2, y: 25 }
        }
      ]
    });
    assert.isAbove(player.danger, result.danger);
    assert.equal(player.neighbors[0].kind, "player");
  });

  it("adds 0 for empty / unowned neighbors", () => {
    const result = scoreNeighborDanger({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        { roomName: "W0N1" },
        { roomName: "W2N1", owner: null },
        { roomName: "W1N2", reserved: true, reservationOwner: "Alice" }
      ]
    });
    assert.equal(result.danger, 0);
    assert.deepEqual(result.neighbors, []);
  });

  it("penalizes a closer player spawn more than a far one at the same RCL", () => {
    const close = scoreNeighborDanger({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        { roomName: "W0N1", owner: "Alice", controllerLevel: 4, spawnPos: { x: 2, y: 25 } }
      ]
    });
    const far = scoreNeighborDanger({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        { roomName: "W0N1", owner: "Alice", controllerLevel: 4, spawnPos: { x: 47, y: 25 } }
      ]
    });
    assert.isAbove(close.danger, far.danger);
    assert.isBelow(close.neighbors[0].distance!, far.neighbors[0].distance!);
    assert.equal(close.neighbors[0].kind, "player");
  });

  it("folds danger into score2 without moving the hill-climbed spawn", () => {
    const safe = scoreFirstRoomPass2({
      roomName: "W8N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const threatened = scoreFirstRoomPass2({
      roomName: "W1N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController,
      neighbors: [
        { roomName: "W0N1", owner: "Alice", controllerLevel: 8, spawnPos: { x: 2, y: 25 } }
      ]
    });

    assert.isTrue(safe.eligible);
    assert.isTrue(threatened.eligible);
    assert.deepEqual(threatened.spawnPos, safe.spawnPos);
    assert.equal(threatened.D2, safe.D2);
    assert.equal(threatened.E2, safe.E2);
    assert.equal(safe.danger, 0);
    assert.isAbove(threatened.danger!, 0);
    assert.equal(safe.score2, safe.E2 / (safe.D2 + SCORE_EPSILON));
    assert.equal(
      threatened.score2,
      applyDangerToScore2(threatened.E2, threatened.D2, threatened.danger!, { epsilon: SCORE_EPSILON })
    );
    assert.isBelow(threatened.score2, safe.score2);
    assert.equal(threatened.energyScore2, safe.score2);
    assert.isBelow(compareFirstRoomPass2Scores(safe, threatened), 0);
  });

  it("ranks the room with a hostile neighbor below an equal-layout safe room", () => {
    const ranked = rankFirstRoomsPass2([
      {
        roomName: "W1N1",
        getTerrain: open,
        sources: compactSources,
        controller: compactController,
        neighbors: [
          { roomName: "W0N1", owner: "Alice", controllerLevel: 8, spawnPos: { x: 2, y: 25 } }
        ]
      },
      {
        roomName: "W8N1",
        getTerrain: open,
        sources: compactSources,
        controller: compactController
      }
    ]);

    assert.equal(ranked[0].roomName, "W8N1");
    assert.equal(ranked[1].roomName, "W1N1");
    assert.equal(ranked[0].D2, ranked[1].D2);
    assert.equal(ranked[0].E2, ranked[1].E2);
    assert.isAbove(ranked[1].danger!, ranked[0].danger!);
    assert.isBelow(ranked[1].score2, ranked[0].score2);
  });

  it("keeps an invader neighbor as a smaller hit than a player RCL 8", () => {
    const invader = scoreFirstRoomPass2({
      roomName: "W1N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController,
      neighbors: [{ roomName: "W0N1", owner: "Invader", controllerLevel: 8 }]
    });
    const player = scoreFirstRoomPass2({
      roomName: "W1N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController,
      neighbors: [
        { roomName: "W0N1", owner: "Alice", controllerLevel: 8, spawnPos: { x: 2, y: 25 } }
      ]
    });
    assert.equal(invader.danger, NPC_DANGER_PENALTY);
    assert.isAbove(player.danger!, invader.danger!);
    assert.isAbove(invader.score2, player.score2);
  });

  it("uses score2 = E2 / (D2 + 1 + weight * danger) so scores stay positive", () => {
    const scored = scoreFirstRoomPass2({
      roomName: "W1N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController,
      neighbors: [
        { roomName: "W0N1", owner: "Alice", controllerLevel: 5, spawnPos: { x: 10, y: 25 } }
      ]
    });
    assert.isTrue(scored.score2 > 0);
    assert.equal(DANGER_WEIGHT, 10);
    assert.equal(
      scored.score2,
      scored.E2 / (scored.D2 + SCORE_EPSILON + DANGER_WEIGHT * (scored.danger ?? 0))
    );
    assert.equal(scored.opportunity, 0);
    assert.lengthOf(scored.neighbors ?? [], 1);
    assert.equal(scored.neighbors![0].roomName, "W0N1");
  });

  it("adds an opportunity bonus from a scorable empty neighbor's pass-1 / controller distance", () => {
    const layout = scoreRoomLayout({
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    assert.isTrue(layout.eligible);
    assert.isAbove(layout.score, 0);

    const close = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        {
          roomName: "W0N1",
          sources: compactSources,
          controller: { x: 2, y: 25 },
          getTerrain: open,
          pass1Score: layout.score
        }
      ]
    });
    const far = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        {
          roomName: "W0N1",
          sources: compactSources,
          controller: { x: 47, y: 25 },
          getTerrain: open,
          pass1Score: layout.score
        }
      ]
    });

    assert.equal(close.danger, 0);
    assert.equal(close.neighbors[0].kind, "empty");
    assert.equal(close.neighbors[0].penalty, 0);
    assert.isAbove(close.opportunity, 0);
    assert.isAbove(close.opportunity, far.opportunity);
    assert.isBelow(close.neighbors[0].controllerDistance!, far.neighbors[0].controllerDistance!);
    assert.equal(
      close.neighbors[0].bonus,
      neighborOpportunityBonus(layout.score, close.neighbors[0].controllerDistance!)
    );
  });

  it("gives opportunity 0 when the neighbor layout is not scorable", () => {
    const none = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        { roomName: "W0N1", controller: { x: 10, y: 10 }, sources: [{ x: 12, y: 12 }], getTerrain: open },
        { roomName: "W2N1", sources: compactSources, getTerrain: open }
      ]
    });
    assert.equal(none.opportunity, 0);
    assert.deepEqual(
      none.neighbors.filter(entry => (entry.bonus ?? 0) > 0),
      []
    );
  });

  it("still scores a hostile neighbor's resource layout for opportunity", () => {
    const layout = scoreRoomLayout({
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const result = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [
        {
          roomName: "W0N1",
          owner: "Alice",
          controllerLevel: 3,
          spawnPos: { x: 2, y: 25 },
          controller: { x: 2, y: 25 },
          sources: compactSources,
          getTerrain: open,
          pass1Score: layout.score
        }
      ]
    });
    assert.isAbove(result.danger, 0);
    assert.isAbove(result.opportunity, 0);
    assert.equal(result.neighbors[0].kind, "player");
    assert.equal(result.neighbors[0].pass1Score, layout.score);
  });

  it("shrinks opportunity when walls force a long walk to the neighbor controller", () => {
    const layout = scoreRoomLayout({
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const neighbor = {
      roomName: "W0N1",
      sources: compactSources,
      controller: { x: 2, y: 25 },
      getTerrain: open,
      pass1Score: layout.score
    };
    const openPath = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: open,
      neighbors: [neighbor]
    });

    const blockedGrid = makeTerrain();
    for (let y = 1; y < ROOM_SIZE; y++) {
      setTile(blockedGrid, 35, y, WALL);
    }
    const blockedPath = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: getter(blockedGrid),
      neighbors: [neighbor]
    });

    assert.isAbove(blockedPath.neighbors[0].controllerDistance!, openPath.neighbors[0].controllerDistance!);
    assert.isBelow(blockedPath.opportunity, openPath.opportunity);
  });

  it("uses a blocked-path cost so unusable adjacency barely helps", () => {
    const layout = scoreRoomLayout({
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const sealed = makeTerrain();
    for (let y = 0; y < ROOM_SIZE; y++) {
      setTile(sealed, 49, y, WALL);
    }
    const result = scoreAdjacentNeighbors({
      roomName: "W1N1",
      spawnPos: { x: 25, y: 25 },
      getTerrain: getter(sealed),
      neighbors: [
        {
          roomName: "W0N1",
          sources: compactSources,
          controller: { x: 2, y: 25 },
          getTerrain: open,
          pass1Score: layout.score
        }
      ]
    });
    assert.isAtLeast(result.neighbors[0].controllerDistance!, BLOCKED_PATH_COST);
    assert.isBelow(result.opportunity, neighborOpportunityBonus(layout.score, BLOCKED_PATH_COST - 1));
  });

  it("folds opportunity into the numerator and danger into the denominator", () => {
    const layout = scoreRoomLayout({
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const isolated = scoreFirstRoomPass2({
      roomName: "W8N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const connected = scoreFirstRoomPass2({
      roomName: "W1N1",
      getTerrain: open,
      sources: compactSources,
      controller: compactController,
      neighbors: [
        {
          roomName: "W0N1",
          sources: compactSources,
          controller: { x: 2, y: 25 },
          getTerrain: open,
          pass1Score: layout.score
        }
      ]
    });

    assert.deepEqual(connected.spawnPos, isolated.spawnPos);
    assert.equal(connected.D2, isolated.D2);
    assert.equal(connected.E2, isolated.E2);
    assert.equal(isolated.opportunity, 0);
    assert.isAbove(connected.opportunity!, 0);
    assert.equal(
      connected.score2,
      applyNeighborTermsToScore2(connected.E2, connected.D2, connected.danger ?? 0, connected.opportunity ?? 0, {
        epsilon: SCORE_EPSILON
      })
    );
    assert.isAbove(connected.score2, isolated.score2);
    assert.equal(OPPORTUNITY_WEIGHT, 60);
    assert.isBelow(compareFirstRoomPass2Scores(connected, isolated), 0);
  });

  it("ranks a well-connected room above an equal-layout isolated room", () => {
    const layout = scoreRoomLayout({
      getTerrain: open,
      sources: compactSources,
      controller: compactController
    });
    const ranked = rankFirstRoomsPass2([
      {
        roomName: "W8N1",
        getTerrain: open,
        sources: compactSources,
        controller: compactController
      },
      {
        roomName: "W1N1",
        getTerrain: open,
        sources: compactSources,
        controller: compactController,
        neighbors: [
          {
            roomName: "W0N1",
            sources: compactSources,
            controller: { x: 2, y: 25 },
            getTerrain: open,
            pass1Score: layout.score
          }
        ]
      }
    ]);

    assert.equal(ranked[0].roomName, "W1N1");
    assert.equal(ranked[1].roomName, "W8N1");
    assert.equal(ranked[0].E2, ranked[1].E2);
    assert.equal(ranked[0].D2, ranked[1].D2);
    assert.isAbove(ranked[0].opportunity!, ranked[1].opportunity!);
  });

  it("increases opportunity bonus with neighbor pass-1 score and decreases it with distance", () => {
    assert.equal(neighborOpportunityBonus(1.2, 24), 1.2 / 25);
    assert.isAbove(neighborOpportunityBonus(2, 24), neighborOpportunityBonus(1, 24));
    assert.isBelow(neighborOpportunityBonus(1.2, 80), neighborOpportunityBonus(1.2, 24));
    assert.equal(neighborOpportunityBonus(0, 10), 0);
  });
});
