import { FlagManager } from "./FlagManager";
import { getRoomAudit } from "../managers/room";
import { getBestCentralLocation } from "utils/map";

export class AuditFlag extends FlagManager {
  work() {
    const central = getBestCentralLocation(this.room, true);
  }
}
