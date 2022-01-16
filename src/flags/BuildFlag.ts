import { BasicFlag } from "./_BasicFlag";
import { getBestLocations, getTerrainCostMatrix } from "utils/map";
import { getRoomAudit } from "utils/tickCache";
import { FlagType } from "utils/constants";

/* Flag name should be in the form: `build:${constructionType}:${random()}` where constructionType is the type of structure to be built. */
export class BuildFlag extends BasicFlag {
  type!:FlagType.Build;

  private _constructionType: string|undefined;
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

      // const sources = this.room.find(FIND_SOURCES);
      // sources.forEach(source=>{
      //   // this.room.createConstructionSite(source.pos.x, source.pos.y-1, STRUCTURE_ROAD); //Top
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y-1, STRUCTURE_ROAD); //Top Right
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y, STRUCTURE_ROAD); //Right
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Right
      //   // this.room.createConstructionSite(source.pos.x, source.pos.y+1, STRUCTURE_ROAD); // Bottom
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Left
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y, STRUCTURE_ROAD); //Left
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y-1, STRUCTURE_ROAD); //Top Left
      // });

      // room.visual.circle(this.pos.x,this.pos.y).line(0,0,this.pos.x,this.pos.y);

      // this.getTerrainMap();

      // const central = getBestCentralLocation(room);

    }
  }
}
