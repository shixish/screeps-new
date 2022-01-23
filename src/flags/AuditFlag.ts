import { BasicFlag } from "./_BasicFlag";
import { getBestLocations, getBestContainerLocation, getTerrainCostMatrix, getGrid, getStructureCostMatrix, visualizeMatrix, findDiamondPlacement } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends BasicFlag {
  work() {
    if (this.room){ //If the room has vision
      // const terrainMatrix = getTerrainCostMatrix(this.room);
      // const central = getBestLocations(this.room, matrix, true);
      const matrix = getStructureCostMatrix(this.room);

      findDiamondPlacement(this.room, matrix);

      visualizeMatrix(this.room, matrix, false);

      const [spawn] = this.room.find(FIND_MY_SPAWNS);
      const central = spawn.pos;

      this.room.visual.circle(central.x, central.y, { radius: .5, fill: '#FF00FF' });



      // getGrid(this.room, central, matrix);
    }
  }
}
