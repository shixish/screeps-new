import { FlagManager } from "./FlagManager";
import { getRoomAudit } from "../managers/room";

export class BuildFlag extends FlagManager {
  private _constructionType: string|undefined;
  /* Flag name should be in the form: `build:${constructionType}:${random()}` where constructionType is the type of structure to be built. */

  get constructionType():BuildableStructureConstant|undefined{
    return this._constructionType || (this._constructionType = this.suffix?.split(':', 2)[0] as any);
  }

  getTerrainMap(){
    const terrain = this.room.getTerrain();
    const map:number[][] = new Array(50);
    for (let x = 0; x < 50; x++){
      map[x] = new Array(50);
    }

    // const maxDepth = 5;
    // const getPositionValue = (x:number, y:number, depth = 0):number=>{
    //   if (x < 0 || y < 0 || x > 49 || y > 49) return 0;
    //   if (map[x][y] !== undefined) return map[x][y];
    //   depth++;
    //   if (depth < maxDepth){
    //     Math.min(getPositionValue(x-1,y-1,depth), getPositionValue(x,y-1,depth), getPositionValue(x+1,y-1,depth), getPositionValue(x-1,y,depth), getPositionValue(x+1,y,depth), getPositionValue(x-1,y+1,depth), getPositionValue(x,y+1,depth), getPositionValue(x+1,y+1,depth));
    //   }
    //   const value = x < 2 || y < 2 || x > 47 || y > 47 ? 0 : (terrain.get(x, y) === TERRAIN_MASK_WALL ? 0 : 1);
    //   return map[x][y] = value;
    // };


    // for (let x2 = -2; x2 <= 2; x2++){
    //   for (let y2 = -2; y2 <= 2; y2++){
    //     const thisX = x + x2, thisY = y + y2;
    //     map[thisX][thisY] = (map[thisX][thisY] || 0) + 5-Math.abs(x2)-Math.abs(y2);
    //   }
    // }

    //This is mostly taken from https://gist.github.com/socantre/96e77685bc5164f4b510c1be752236b6
    const get = (x:number, y:number)=>{
      if (x < 1 || y < 1 || x > 48 || y > 48) return 0;
      return map[x][y];
    };

    for (let y = 0; y < 50; ++y) {
      for (let x = 0; x < 50; ++x) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
          map[x][y] = 0;
        } else {
          map[x][y] = Math.min(
            get(x - 1, y - 1),
            get(x, y - 1),
            get(x + 1, y - 1),
            get(x - 1, y),
          ) + 1;
        }
      }
    }

    for (let y = 49; y >= 0; --y) {
      for (let x = 49; x >= 0; --x) {
        const value = Math.min(
          get(x, y),
          get(x + 1, y + 1) + 1,
          get(x, y + 1) + 1,
          get(x - 1, y + 1) + 1,
          get(x + 1, y) + 1,
        );
        map[x][y] = value;
        this.room.visual.circle(x, y, { radius: value / 25 });
      }
    }

    // for (let x = 0; x < 50; x++){
    //   for (let y = 0; y < 50; y++){
    //     if (x < 2 || y < 2 || x > 47 || y > 47 || terrain.get(x, y) === TERRAIN_MASK_WALL){
    //       map[x][y] = 0;
    //     }else{
    //       for (let x2 = -2; x2 <= 2; x2++){
    //         for (let y2 = -2; y2 <= 2; y2++){
    //           const thisX = x + x2, thisY = y + y2;
    //           map[thisX][thisY] = (map[thisX][thisY] || 0) + 5-Math.abs(x2)-Math.abs(y2);
    //         }
    //       }
    //     }
    //   }
    // }
    // for (let x = 0; x < 50; x++){
    //   for (let y = 0; y < 50; y++){
    //     this.room.visual.text(String(map[x][y]), x, y);
    //   }
    // }
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

      // room.visual.circle(this.pos.x,this.pos.y).line(0,0,this.pos.x,this.pos.y);

      // this.getTerrainMap();

    }
  }
}
