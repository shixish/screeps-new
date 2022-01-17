/*
  TODO:
  Modify the result of getTerrainCostMatrix by zeroing out cells that already contain structures...
  Maybe roads don't count..?
  I think roads must count and I'll have to fit things in around roads and plant roads intelligently.
*/
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

export function getBestLocations(room:Room, matrix:CostMatrix, visualize = false){
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
  if (visualize) room.visual.circle(bestX!, bestY!, { radius: 1, fill: '#FF00FF' });
  return new RoomPosition(bestX!, bestY!, room.name);
}

export function getBestContainerLocation(pos:RoomPosition, center:RoomPosition, visualize = false){
  const room = Game.rooms[pos.roomName];
  const terrain = room.getTerrain();
  let bestX:number, bestY:number, bestRange:number|undefined;
  for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
    const x = pos.x + coord[0], y = pos.y + coord[1];
    if (terrain.get(x, y) !== TERRAIN_MASK_WALL){
      const range = center.getRangeTo(x, y);
      if (visualize) room.visual.text(String(range), x, y);
      if (!bestRange || bestRange > range){
        bestX = x;
        bestY = y;
        bestRange = range;
      }
    }
  }
  if (visualize) room.visual.circle(bestX!, bestY!, { radius: 1, fill: '#0000FF' });
  return new RoomPosition(bestX!, bestY!, pos.roomName);
}

export function getSpawnRoadPath(spawn:StructureSpawn, goal:RoomPosition){
  let leastRange:number|undefined;
  //Use the closest of the diamond corners around the spawn as the start position
  const spawnStartPos = [[0,-1], [-1, 0], [0, 1], [1, 0]].reduce((out, direction)=>{
    const x = spawn.pos.x+direction[0], y = spawn.pos.y+direction[1];
    const range = goal.getRangeTo(x, y);
    if (!leastRange || leastRange > range){
      leastRange = range;
      out = new RoomPosition(x, y, spawn.room.name);
    }
    return out;
  }, undefined as RoomPosition|undefined)!;
  return PathFinder.search(spawnStartPos, {
    pos: goal,
    range: 1,
  }, {
    swampCost: 1, //Swamps cost the same since we will build a road over it
    maxRooms: 1,
  });
}
