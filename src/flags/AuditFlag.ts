import { FlagManager } from "./FlagManager";
import { getBestCentralLocation, getTerrainCostMatrix } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends FlagManager {
  work() {
    if (this.room){ //If the room has vision
      const matrix = getTerrainCostMatrix(this.room);
      const central = getBestCentralLocation(this.room, matrix, true);
      this.room.createFlag(central, `build:spawn:${random()}`);
      this.remove();
    }
  }
}
