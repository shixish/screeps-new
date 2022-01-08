export function getTerrainCostMatrix(room:Room, visualize = false){
  const terrain = room.getTerrain();

  //This comes from https://gist.github.com/socantre/96e77685bc5164f4b510c1be752236b6
  const matrix = new PathFinder.CostMatrix();
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL || x < 1 || y < 1 || x > 48 || y > 48) {
        matrix.set(x, y, 0);
      } else {
        matrix.set(x, y, Math.min(
          matrix.get(x - 1, y - 1),
          matrix.get(x, y - 1),
          matrix.get(x + 1, y - 1),
          matrix.get(x - 1, y),
        ) + 1);
      }
    }
  }

  for (let y = 49; y >= 0; --y) {
    for (let x = 49; x >= 0; --x) {
      const value = Math.min(
        matrix.get(x, y),
        matrix.get(x + 1, y + 1) + 1,
        matrix.get(x, y + 1) + 1,
        matrix.get(x - 1, y + 1) + 1,
        matrix.get(x + 1, y) + 1,
      );
      matrix.set(x, y, value);
      if (visualize) room.visual.circle(x, y, { radius: value / 25 });
    }
  }

  //Serialization info: https://github.com/screeps/docs/blob/master/api/source/PathFinder.CostMatrix.md
  return matrix;
}

export function getBestCentralLocation(room:Room, matrix:CostMatrix = getTerrainCostMatrix(room), visualize = false){
  const sources = room.find(FIND_SOURCES);
  let bestX:number, bestY:number, bestValue:number|undefined;
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      const avgRange = (sources.reduce((sum, source)=>sum + Math.pow(source.pos.getRangeTo(x,y), 3), 0)+Math.pow(room.controller!.pos.getRangeTo(x,y), 3))/(sources.length + 1);
      const value = matrix.get(x,y)/avgRange;
      if (!bestValue || value > bestValue){
        bestValue = value;
        bestX = x;
        bestY = y;
      }
      if (visualize) room.visual.circle(x, y, { radius: value*100 });
    }
  }
  if (visualize) room.visual.circle(bestX!, bestY!, { radius: 2, fill: '#FF00FF' });
  return new RoomPosition(bestX!, bestY!, room.name);
}
