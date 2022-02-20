import { BasicFlag } from "./_BasicFlag";
import { getBestCentralLocation, getBestContainerLocation, getTerrainCostMatrix, getGrid, getStructureCostMatrix, visualizeMatrix, findDiamondPlacement, diamondRingCoordinates, diamondCoordinates } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends BasicFlag {
  work() {
    const room = this.flag.room;
    if (room){ //If the room has vision
      // const terrainMatrix = getTerrainCostMatrix(room);
      // const central = getBestLocations(room, matrix, true);
      // const matrix = getStructureCostMatrix(room, 4);
      // visualizeMatrix(room, matrix, false);

      // {
      //   const diamondSize = 1;
      //   const [dx, dy] = findDiamondPlacement(room, diamondSize);
      //   for (const [x, y] of diamondCoordinates(dx, dy, diamondSize)){
      //     room.visual.circle(x, y, { radius: 0.5 });
      //   }
      //   for (const [x, y] of diamondRingCoordinates(dx, dy, diamondSize+1)){
      //     room.visual.circle(x, y, { radius: 0.5, fill:"#5555ff" });
      //   }
      // }
      {
        const diamondSize = 0;
        const structureMatrix = getStructureCostMatrix(room, 4, STRUCTURE_SPAWN);
        const [dx, dy] = findDiamondPlacement(room, diamondSize, structureMatrix);
        for (const [x, y] of diamondCoordinates(dx, dy, diamondSize)){
          room.visual.circle(x, y, { radius: 0.5 });
        }
        for (const [x, y] of diamondRingCoordinates(dx, dy, diamondSize+1)){
          room.visual.circle(x, y, { radius: 0.5, fill:"#5555ff" });
        }
      }

      // const [spawn] = room.find(FIND_MY_SPAWNS);
      // const central = spawn.pos;

      // room.visual.circle(central.x, central.y, { radius: .5, fill: '#FF00FF' });



      // getGrid(room, central, matrix);
    }
  }
}
