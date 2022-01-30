import { BasicFlag } from "./_BasicFlag";
import { getBestCentralLocation, getBestContainerLocation, getTerrainCostMatrix, getGrid, getStructureCostMatrix, visualizeMatrix, findDiamondPlacement, diamondRingCoordinates, diamondCoordinates } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends BasicFlag {
  work() {
    if (this.room){ //If the room has vision
      // const terrainMatrix = getTerrainCostMatrix(this.room);
      // const central = getBestLocations(this.room, matrix, true);
      // const matrix = getStructureCostMatrix(this.room, 4);
      // visualizeMatrix(this.room, matrix, false);

      // {
      //   const diamondSize = 1;
      //   const [dx, dy] = findDiamondPlacement(this.room, diamondSize);
      //   for (const [x, y] of diamondCoordinates(dx, dy, diamondSize)){
      //     this.room.visual.circle(x, y, { radius: 0.5 });
      //   }
      //   for (const [x, y] of diamondRingCoordinates(dx, dy, diamondSize+1)){
      //     this.room.visual.circle(x, y, { radius: 0.5, fill:"#5555ff" });
      //   }
      // }
      {
        const diamondSize = 0;
        const structureMatrix = getStructureCostMatrix(this.room, 4, STRUCTURE_SPAWN);
        const [dx, dy] = findDiamondPlacement(this.room, diamondSize, structureMatrix);
        for (const [x, y] of diamondCoordinates(dx, dy, diamondSize)){
          this.room.visual.circle(x, y, { radius: 0.5 });
        }
        for (const [x, y] of diamondRingCoordinates(dx, dy, diamondSize+1)){
          this.room.visual.circle(x, y, { radius: 0.5, fill:"#5555ff" });
        }
      }

      // const [spawn] = this.room.find(FIND_MY_SPAWNS);
      // const central = spawn.pos;

      // this.room.visual.circle(central.x, central.y, { radius: .5, fill: '#FF00FF' });



      // getGrid(this.room, central, matrix);
    }
  }
}
