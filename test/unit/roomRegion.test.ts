import { assert } from "chai";
import {
  defaultFirstRoomRegion,
  formatRoomName,
  isClaimableSectorRoom,
  isHighwayRoom,
  isSourceKeeperRoom,
  listAllOpenRooms,
  listRoomsInRegion,
  parseRoomName,
  roomLinearDistance
} from "../../src/utils/roomNames";

describe("roomNames / region filter", () => {
  it("round-trips official Screeps room coordinates", () => {
    assert.deepEqual(parseRoomName("E0N0"), { x: 0, y: 0 });
    assert.deepEqual(parseRoomName("W0N0"), { x: -1, y: 0 });
    assert.deepEqual(parseRoomName("E0S0"), { x: 0, y: -1 });
    assert.deepEqual(parseRoomName("W0S0"), { x: -1, y: -1 });
    assert.equal(formatRoomName(0, 0), "E0N0");
    assert.equal(formatRoomName(-1, 0), "W0N0");
    assert.equal(formatRoomName(5, -4), "E5S3");
    assert.equal(formatRoomName(-6, 4), "W5N4");
    assert.equal(formatRoomName(parseRoomName("W8S2")!.x, parseRoomName("W8S2")!.y), "W8S2");
  });

  it("computes Chebyshev linear distance between rooms", () => {
    assert.equal(roomLinearDistance("W1N1", "W1N1"), 0);
    assert.equal(roomLinearDistance("W1N1", "E1N1"), 3);
    assert.equal(roomLinearDistance("W2N2", "E1S1"), 4);
    assert.equal(roomLinearDistance("sim", "W1N1"), Number.POSITIVE_INFINITY);
  });

  it("detects highway and source-keeper sector rooms", () => {
    assert.isTrue(isHighwayRoom("E0N1"));
    assert.isTrue(isHighwayRoom("W10N3"));
    assert.isTrue(isSourceKeeperRoom("E5N5"));
    assert.isTrue(isSourceKeeperRoom("W4N6"));
    assert.isTrue(isClaimableSectorRoom("E1N1"));
    assert.isTrue(isClaimableSectorRoom("W2N3"));
    assert.isFalse(isClaimableSectorRoom("E0N0"));
    assert.isFalse(isClaimableSectorRoom("E5N5"));
  });

  it("lists an explicit room list unchanged", () => {
    const rooms = listRoomsInRegion({ type: "list", rooms: ["sim", "W1N1", "E2S2"] });
    assert.sameMembers(rooms, ["sim", "W1N1", "E2S2"]);
  });

  it("lists rooms inside a bounding box of corner names", () => {
    const rooms = listRoomsInRegion({ type: "box", from: "W1N1", to: "E1N0" });
    assert.includeMembers(rooms, ["W1N1", "W0N1", "E0N1", "E1N1", "W1N0", "E1N0"]);
    assert.notInclude(rooms, "W2N1");
    assert.notInclude(rooms, "E1S1");
  });

  it("lists rooms within a Chebyshev radius of a center", () => {
    const rooms = listRoomsInRegion({ type: "radius", center: "W1N1", radius: 1 });
    assert.includeMembers(rooms, ["W1N1", "W2N1", "W0N1", "W1N2", "W1N0", "W2N2"]);
    assert.notInclude(rooms, "E1N1");
    assert.equal(Math.max(...rooms.map(name => roomLinearDistance("W1N1", name))), 1);
  });

  it("enumerates every open room on a small private-server world", () => {
    const closed = new Set(["E0N0"]);
    const rooms = listAllOpenRooms({
      getWorldSize: () => 4,
      isRoomOpen: name => !closed.has(name),
      excludeSectorRooms: false
    });
    assert.equal(rooms.length, 15);
    assert.includeMembers(rooms, ["W1N1", "E1N1", "W1S1", "E1S1"]);
    assert.notInclude(rooms, "E0N0");
    assert.notInclude(rooms, "E2N0");
  });

  it("visible mode includes Game.rooms plus known intel rooms", () => {
    const rooms = listRoomsInRegion(
      { type: "visible" },
      {
        visibleRooms: () => ["sim", "W1N1"],
        knownRooms: () => ["W2N2"]
      }
    );
    assert.sameMembers(rooms, ["sim", "W1N1", "W2N2"]);
  });

  it("defaults to allOpen on small worlds and visible on large shards", () => {
    assert.deepEqual(
      defaultFirstRoomRegion({ getWorldSize: () => 11, visibleRooms: () => [] }),
      { type: "allOpen" }
    );
    assert.deepEqual(
      defaultFirstRoomRegion({ getWorldSize: () => 102, visibleRooms: () => ["W1N1"] }),
      { type: "visible" }
    );
    assert.deepEqual(
      defaultFirstRoomRegion({ getWorldSize: () => 102, visibleRooms: () => [] }),
      { type: "visible" }
    );
  });
});
