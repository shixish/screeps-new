import { assert } from "chai";
import {
  FIRST_ROOM_MAP_RANK_COLORS,
  FIRST_ROOM_MAP_TOP_N,
  FirstRoomMapRank,
  bestAvailableScore,
  firstRoomMapMarkers,
  formatRankLabel,
  formatShortScore,
  inRoomOverlayAnchor,
  mapMarkerRectStyle,
  paintTopFirstRoomsInVisibleRooms,
  paintTopFirstRoomsOnMap,
  rankColor,
  topFirstRoomRanks
} from "../../src/utils/firstRoomMapVisual";

function entry(partial: Partial<FirstRoomMapRank> & Pick<FirstRoomMapRank, "roomName">): FirstRoomMapRank {
  return {
    eligible: true,
    score: 0.5,
    energyPerTick: 20,
    walkCost: 40,
    ...partial
  };
}

describe("firstRoomMapVisual", () => {
  it("caps overlay work at the top 5 eligible rooms", () => {
    assert.equal(FIRST_ROOM_MAP_TOP_N, 5);
    const ranked = [
      entry({ roomName: "W1N1", score: 0.9 }),
      entry({ roomName: "skip", eligible: false, score: 0 }),
      entry({ roomName: "W2N1", score: 0.8 }),
      entry({ roomName: "W3N1", score: 0.7 }),
      entry({ roomName: "W4N1", score: 0.6 }),
      entry({ roomName: "W5N1", score: 0.5 }),
      entry({ roomName: "W6N1", score: 0.4 })
    ];
    const top = topFirstRoomRanks(ranked);
    assert.deepEqual(
      top.map(item => item.roomName),
      ["W1N1", "W2N1", "W3N1", "W4N1", "W5N1"]
    );
    assert.notInclude(
      top.map(item => item.roomName),
      "W6N1"
    );
  });

  it("labels each room with rank #1…#5 and a rounded score", () => {
    const markers = firstRoomMapMarkers([
      entry({ roomName: "W1N1", score: 0.4878 }),
      entry({ roomName: "W2N1", score: 0.4 }),
      entry({ roomName: "W3N1", score: 1 })
    ]);
    assert.equal(markers[0].label, "#1 0.49");
    assert.equal(markers[1].label, "#2 0.40");
    assert.equal(markers[2].label, "#3 1");
    assert.equal(formatRankLabel(4, entry({ roomName: "W4N1", score: 0.1234 })), "#4 0.12");
  });

  it("prefers pass-2 score2, then numeric spawn, then pass-1 score", () => {
    assert.equal(bestAvailableScore(entry({ roomName: "a", score: 0.2, score2: 0.9, spawn: 0.5 })), 0.9);
    assert.equal(bestAvailableScore(entry({ roomName: "b", score: 0.2, spawn: 0.5 })), 0.5);
    assert.equal(bestAvailableScore(entry({ roomName: "c", score: 0.2 })), 0.2);
    assert.equal(formatShortScore(entry({ roomName: "d", score: 0.11, score2: 0.77 })), "0.77");
  });

  it("falls back to E/D when no numeric score is available", () => {
    assert.equal(
      formatShortScore({ roomName: "W1N1", eligible: true, energyPerTick: 20.4, walkCost: 39.6 }),
      "20/40"
    );
  });

  it("uses a distinct color per rank, with #1 standing out", () => {
    assert.equal(FIRST_ROOM_MAP_RANK_COLORS.length, 5);
    assert.equal(rankColor(1), "#ffd54a");
    const colors = [1, 2, 3, 4, 5].map(rankColor);
    assert.equal(new Set(colors).size, 5);
    const markers = firstRoomMapMarkers([
      entry({ roomName: "W1N1" }),
      entry({ roomName: "W2N1" })
    ]);
    assert.equal(markers[0].color, rankColor(1));
    assert.notEqual(markers[0].color, markers[1].color);
    assert.isAbove(markers[0].fillOpacity, markers[1].fillOpacity);
    assert.isAbove(markers[0].fontSize, markers[1].fontSize);
    assert.isAbove(markers[0].strokeWidth, markers[1].strokeWidth);
  });

  it("maps marker.fillOpacity onto MapVisual rect opacity (not fillsOpacity)", () => {
    const markers = firstRoomMapMarkers([
      entry({ roomName: "W1N1" }),
      entry({ roomName: "W2N1" })
    ]);
    assert.property(markers[0], "fillOpacity");
    assert.notProperty(markers[0], "fillsOpacity");
    const style = mapMarkerRectStyle(markers[0]);
    assert.equal(style.opacity, markers[0].fillOpacity);
    assert.equal(style.opacity, 0.16);
    assert.equal(mapMarkerRectStyle(markers[1]).opacity, markers[1].fillOpacity);
    assert.equal(mapMarkerRectStyle(markers[1]).opacity, 0.08);
  });

  it("paints only those top rooms through Game.map.visual and no-ops without it", () => {
    class FakePos {
      public x: number;
      public y: number;
      public roomName: string;
      public constructor(x: number, y: number, roomName: string) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
      }
    }
    const previousPos = (global as { RoomPosition?: unknown }).RoomPosition;
    (global as { RoomPosition: typeof FakePos }).RoomPosition = FakePos;

    const texts: string[] = [];
    const rects: string[] = [];
    const opacities: number[] = [];
    const visual = {
      rect: (pos: FakePos, _w: number, _h: number, style?: { opacity?: number }) => {
        rects.push(pos.roomName);
        if (typeof style?.opacity === "number") opacities.push(style.opacity);
      },
      text: (label: string, pos: FakePos) => {
        texts.push(`${pos.roomName}:${label}`);
      }
    };

    const ranked = [1, 2, 3, 4, 5, 6].map(n => entry({ roomName: `W${n}N1`, score: 1 - n * 0.1 }));
    const painted = paintTopFirstRoomsOnMap(ranked, visual);
    assert.equal(painted, 5);
    assert.equal(rects.length, 5);
    assert.equal(texts.length, 5);
    assert.equal(texts[0], "W1N1:#1 0.90");
    assert.equal(texts[4], "W5N1:#5 0.50");
    assert.isUndefined(texts.find(line => line.startsWith("W6N1")));
    assert.deepEqual(opacities, firstRoomMapMarkers(ranked).map(marker => marker.fillOpacity));

    assert.equal(paintTopFirstRoomsOnMap(ranked, undefined), 0);
    assert.equal(paintTopFirstRoomsOnMap([], visual), 0);

    if (previousPos) {
      (global as { RoomPosition: unknown }).RoomPosition = previousPos;
    } else {
      delete (global as { RoomPosition?: unknown }).RoomPosition;
    }
  });

  it("anchors in-room labels on the spawn, then controller, then midpoint, then room center", () => {
    assert.deepEqual(
      inRoomOverlayAnchor(
        { name: "W1N1", controller: { pos: { x: 12, y: 8 } } },
        { midpoint: { x: 20, y: 20 }, spawnPos: { x: 18, y: 22 } }
      ),
      { x: 18, y: 22 }
    );
    assert.deepEqual(
      inRoomOverlayAnchor({ name: "W1N1", controller: { pos: { x: 12, y: 8 } } }, { midpoint: { x: 20, y: 20 } }),
      { x: 12, y: 8 }
    );
    assert.deepEqual(inRoomOverlayAnchor({ name: "W1N1" }, { midpoint: { x: 20, y: 21 } }), { x: 20, y: 21 });
    assert.deepEqual(inRoomOverlayAnchor({ name: "W1N1" }), { x: 25, y: 25 });
  });

  it("paints rank labels only in currently visible top rooms", () => {
    const ranked = [
      entry({ roomName: "W1N1", score: 1.82 }),
      entry({ roomName: "W2N1", score: 0.9 }),
      entry({ roomName: "W3N1", score: 0.4 })
    ];
    const texts: string[] = [];
    const rooms = {
      W1N1: {
        name: "W1N1",
        controller: { pos: { x: 10, y: 11 } },
        visual: {
          rect() {
            return undefined;
          },
          text(label: string, x: number, y: number) {
            texts.push(`W1N1:${label}@${x},${y}`);
          }
        }
      },
      W9N9: {
        name: "W9N9",
        visual: {
          text(label: string) {
            texts.push(`W9N9:${label}`);
          }
        }
      }
    };

    const painted = paintTopFirstRoomsInVisibleRooms(ranked, rooms);
    assert.equal(painted, 1);
    assert.equal(texts.length, 1);
    assert.equal(texts[0], "W1N1:#1 1.82@10,10.3");
    assert.equal(paintTopFirstRoomsInVisibleRooms(ranked, {}), 0);
    assert.equal(paintTopFirstRoomsInVisibleRooms([], rooms), 0);
  });
});
