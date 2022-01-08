import { FlagManager } from "./FlagManager";
import { getRoomAudit } from "../managers/room";
import { getBestCentralLocation, getTerrainCostMatrix } from "utils/map";

export class AuditFlag extends FlagManager {
  work() {
    const matrix = getTerrainCostMatrix(this.room);
    const central = getBestCentralLocation(this.room, matrix, true);

  }
}
