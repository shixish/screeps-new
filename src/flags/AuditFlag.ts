import { FlagManager } from "./BasicFlag";
import { getBestLocations, getBestContainerLocation, getTerrainCostMatrix } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends FlagManager {
  work() {
    if (this.room){ //If the room has vision
      const matrix = getTerrainCostMatrix(this.room);
      const central = getBestLocations(this.room, matrix, true);
      const sources = this.room.find(FIND_SOURCES);
      sources.forEach(source=>{
        getBestContainerLocation(source.pos, central, true);
      });
      // this.room.createFlag(central, `build:spawn:${random()}`);
      // this.remove();
    }
  }
}
