import { BasicFlag } from "./_BasicFlag";
import { getBestLocations, getBestContainerLocation, getTerrainCostMatrix, getGrid, getStructureCostMatrix } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends BasicFlag {
  work() {
    if (this.room){ //If the room has vision
      const matrix = getTerrainCostMatrix(this.room);
      // const central = getBestLocations(this.room, matrix, true);

      const [spawn] = this.room.find(FIND_MY_SPAWNS);
      const central = spawn.pos;

      this.room.visual.circle(central.x, central.y, { radius: .5, fill: '#FF00FF' });

      // getStructureCostMatrix(this.room, matrix);


      // getGrid(this.room, central, matrix);
    }
  }
}
