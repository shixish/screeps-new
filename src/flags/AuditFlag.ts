import { BasicFlag } from "./_BasicFlag";
import { getBestLocations, getBestContainerLocation, getTerrainCostMatrix } from "utils/map";
import { random } from "utils/random";

export class AuditFlag extends BasicFlag {
  work() {
    if (this.room){ //If the room has vision
      const matrix = getTerrainCostMatrix(this.room);
      // const central = getBestLocations(this.room, matrix);

      const [spawn] = this.room.find(FIND_MY_SPAWNS);
      const central = spawn.pos;
      this.room.visual.circle(central, { radius: 1 });

      const distance = 5;
      const boxSize = 2;
      const gridSum = (offsetX:number, offsetY:number, visualize=false)=>{
        const gridX = central.x+offsetX, gridY = central.y+offsetY;
        if (visualize) this.room.visual.circle(gridX, gridY, { radius: .5, fill: '#FF00FF' });
        let total = matrix.get(gridX, gridY);
        for (let d=-distance; d <= distance; d++){
          if (d === 0) continue;
          if (visualize){
            this.room.visual.circle(gridX+d, gridY+d, { radius: .2, fill: '#FF0000' });
            this.room.visual.circle(gridX+d, gridY-d, { radius: .2, fill: '#FF0000' });

            this.room.visual.circle(gridX+boxSize+d, gridY-boxSize+d, { radius: .2, fill: '#0000FF' });
            this.room.visual.circle(gridX-boxSize+d, gridY+boxSize+d, { radius: .2, fill: '#0000FF' });
          }
          total += matrix.get(gridX+d, gridY+d);
          total += matrix.get(gridX+d, gridY-d);

          total += matrix.get(gridX+boxSize+d, gridY-boxSize+d);
          total += matrix.get(gridX-boxSize+d, gridY+boxSize+d);

          if (d === boxSize || d === -boxSize) continue;
          if (visualize){
            this.room.visual.circle(gridX-boxSize+d, gridY-boxSize-d, { radius: .2, fill: '#00FF00' });
            this.room.visual.circle(gridX+boxSize+d, gridY+boxSize-d, { radius: .2, fill: '#00FF00' });
          }
          total += matrix.get(gridX-boxSize+d, gridY-boxSize-d);
          total += matrix.get(gridX+boxSize+d, gridY+boxSize-d);
        }
        return total;
      };

      let bestOffset:number[]|undefined, largest:number|undefined;
      [[-2, -1], [-1, -2], [+1, -2], [+2, -1], [+2, +1], [+1, +2], [-1, +2], [-2, +1]].forEach(offset=>{
        const [offsetX, offsetY] = offset;
        // const gridX = central.x+offsetX, gridY = central.y+offsetY;
        // this.room.visual.circle(gridX, gridY, { radius: .2, fill: '#FF00FF' });
        const total = gridSum(offsetX, offsetY);
        if (!largest || total > largest){
          bestOffset = offset;
          largest = total;
        }
      });

      const [offsetX, offsetY] = bestOffset!;
      gridSum(offsetX, offsetY, true);

      // {
      //   const gridX = central.x-1, gridY = central.y+2;
      //   this.room.visual.circle(gridX, gridY, { radius: .2, fill: '#FF00FF' });
      //   this.room.visual.line(gridX-5, gridY-5, gridX+5, gridY+5);
      // }
      // {
      //   const gridX = central.x-1, gridY = central.y-2;
      //   this.room.visual.circle(gridX, gridY, { radius: .2, fill: '#FF00FF' });
      //   this.room.visual.line(gridX-5, gridY-5, gridX+5, gridY+5);
      // }

      // const sources = this.room.find(FIND_SOURCES);
      // sources.forEach(source=>{
      //   getBestContainerLocation(source.pos, central, true);
      // });
      // this.room.createFlag(central, `build:spawn:${random()}`);
      // this.remove();
    }


  }
}
