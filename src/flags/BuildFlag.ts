import { FlagManager } from "./FlagManager";
import { getRoomAudit } from "../managers/room";

export class BuildFlag extends FlagManager {
  private _constructionType: string|undefined;
  /* Flag name should be in the form: `build:${constructionType}:${random()}` where constructionType is the type of structure to be built. */

  get constructionType():BuildableStructureConstant|undefined{
    return this._constructionType || (this._constructionType = this.suffix?.split(':', 2)[0] as any);
  }
  work() {
    const room = this.flag.room;

    if (!this.constructionType){
      console.log(`[${this.flag.room}] Invalid flag: ${this.flag.name}`);
      this.remove();
    }

    if (room) {
      const roomAudit = getRoomAudit(room);
      roomAudit.flags[this.type].push(this);
    }
  }
}
