import { BasicFlag } from "./_BasicFlag";
import { getBestLocations, getBestContainerLocation, getTerrainCostMatrix, getGrid } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends BasicFlag {
  work() {
    if (this.room){ //If the room has vision
      const matrix = getTerrainCostMatrix(this.room);
      const central = getBestLocations(this.room, matrix, true);
      this.room.visual.circle(central.x, central.y, { radius: .5, fill: '#FF00FF' });

      // const [spawn] = this.room.find(FIND_MY_SPAWNS);
      // const central = spawn.pos;

      // getGrid(this.room, central, matrix);
    }
  }
}
