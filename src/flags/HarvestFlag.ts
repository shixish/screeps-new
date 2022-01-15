import { getBestContainerLocation, getBestLocations, getTerrainCostMatrix } from "utils/map";
import { random } from "utils/random";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag } from "./_RemoteFlag";

export class HarvestFlag extends RemoteFlag {
  /* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
  work() {
    const home = this.memory.room && Game.rooms[this.memory.room] || this.suffix && Game.rooms[this.suffix];
    if (!home) throw `Harvest flag [${this.flag.name}] error: home isn't defined.`;
    const office = this.flag.room;
    const roomAudit = getRoomAudit(home);
    roomAudit.flags[this.type].push(this);
  }
}
