import { CreepRoleName } from "utils/constants";
import { getBestCentralLocation } from "utils/map";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

export interface DefendFlagMemory extends RemoteFlagMemory{

}

export class DefendFlag extends RemoteFlag<DefendFlagMemory> {
  /* Flag name should be in the form: `Defend:${roomName}` where roomName is the name of the parent room. */
  work() {

  }
}
