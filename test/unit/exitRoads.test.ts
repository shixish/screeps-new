import { assert } from "chai";
import {
  packRoadPos,
  splitExitRoadSegments,
  sortExitRoadMeasurements,
  findExitRoadSegmentsNear,
  promoteExitRoadSegment,
  getExitRoadDirectionLabel
} from "../../src/utils/earlyEconomy";

describe("exit roads", () => {
  it("labels the four exit directions", () => {
    assert.equal(getExitRoadDirectionLabel(1 as ExitConstant), "TOP");
    assert.equal(getExitRoadDirectionLabel(7 as ExitConstant), "LEFT");
  });

  it("cuts a route into fixed size segments", () => {
    const path = [1, 2, 3, 4, 5, 6, 7];
    const segments = splitExitRoadSegments(path, "TOP", 3);
    assert.deepEqual(segments.map(s => s.id), ["TOP-0", "TOP-1", "TOP-2"]);
    assert.deepEqual(segments[2].tiles, [7]);
  });

  it("orders exits by path cost, ties by exit constant", () => {
    const sorted = sortExitRoadMeasurements([
      { exit: 5 as ExitConstant, cost: 40 },
      { exit: 1 as ExitConstant, cost: 12 },
      { exit: 7 as ExitConstant, cost: 12 }
    ]);
    assert.deepEqual(sorted.map(m => m.exit), [1, 7, 5]);
  });

  it("finds and promotes segments near infrastructure", () => {
    const plan = {
      routes: [{ exit: 1 as ExitConstant, order: 0, cost: 10, path: [packRoadPos(10, 10)],
                 segments: [{ id: "TOP-0", tiles: [packRoadPos(10, 10)] },
                            { id: "TOP-1", tiles: [packRoadPos(40, 40)] }] }],
      plannedTiles: [packRoadPos(10, 10), packRoadPos(40, 40)],
      planned: 0
    };
    assert.deepEqual(findExitRoadSegmentsNear(plan, 12, 12, 3).map(s => s.id), ["TOP-0"]);
    assert.deepEqual(promoteExitRoadSegment(plan, "TOP-0"), [packRoadPos(10, 10)]);
    assert.isEmpty(findExitRoadSegmentsNear(plan, 12, 12, 3));
  });
});
