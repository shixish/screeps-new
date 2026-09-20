import { assert } from "chai";
import {
  MOVE_STALL_LIMIT,
  MoveProgressMemory,
  clearMoveStall,
  moveDestKey,
  movePosKey,
  trackMoveProgress
} from "../../src/utils/stickyPath";

const pos = (x: number, y: number, roomName = "W1N1") => ({ x, y, roomName });

describe("sticky path stall tracking", () => {
  it("counts consecutive ticks spent on the same tile", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100), 0);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 102), 2);
    //Three ticks of standing still is what buys a repath.
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 103), MOVE_STALL_LIMIT);
  });

  it("resets once the creep reaches a new tile", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 6)), 102), 0);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 6)), 103), 1);
  });

  it("does not count fatigue as a stall", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100);
    //Waiting out swamp cost means the creep is paying to move, not being blocked.
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101, true), 0);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 102), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 103), 2);
    //A fatigued tick breaks the run, so the fatigued creep never spends its repath on waiting out cost.
    assert.isBelow(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 104, true), MOVE_STALL_LIMIT);
  });

  it("starts over when the destination or range changes", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101), 1);
    assert.equal(trackMoveProgress(memory, moveDestKey(pos(10, 10), 3), movePosKey(pos(5, 5)), 102), 0);
    assert.equal(trackMoveProgress(memory, moveDestKey(pos(20, 10), 3), movePosKey(pos(5, 5)), 103), 0);
  });

  it("ignores ticks the creep spent doing something else", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101), 1);
    //A gap in the run means those ticks weren't spent chasing this destination.
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 110), 0);
  });

  it("samples once per tick when a role asks to move twice", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 102), 2);
  });

  it("gives a repathed course a fresh grace period", () => {
    const memory: MoveProgressMemory = {};
    const dest = moveDestKey(pos(10, 10), 1);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 100);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 101);
    trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 102);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 103), MOVE_STALL_LIMIT);
    clearMoveStall(memory);
    //Still blocked after the repath: the counter has to climb all the way back up before we repath again.
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 104), 1);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 105), 2);
    assert.equal(trackMoveProgress(memory, dest, movePosKey(pos(5, 5)), 106), MOVE_STALL_LIMIT);
  });
});
