/*
  TODO:
  Modify the result of getTerrainCostMatrix by zeroing out cells that already contain structures...
  Maybe roads don't count..?
  I think roads must count and I'll have to fit things in around roads and plant roads intelligently.
*/
export function getTerrainCostMatrix(room:Room, visualize = false){
  const terrain = room.getTerrain();

  const sources = room.find(FIND_SOURCES);
  const [ mineral ] = room.find(FIND_MINERALS);
  const controller = room.controller;

  const blockedRange = 1;
  const isBlocked = (x:number, y:number)=>{
    //Count regions around the exits, sources, minerals, and controller as walled off.
    return terrain.get(x, y) === TERRAIN_MASK_WALL ||
      x < 1 || y < 1 || x > 48 || y > 48 ||
      sources.find(source=>Math.abs(source.pos.x-x)<=blockedRange && Math.abs(source.pos.y-y)<=blockedRange) ||
      mineral && Math.abs(mineral.pos.x-x)<=blockedRange && Math.abs(mineral.pos.y-y)<=blockedRange ||
      controller && Math.abs(controller.pos.x-x)<=blockedRange && Math.abs(controller.pos.y-y)<=blockedRange;
  };

  //This comes from https://gist.github.com/socantre/96e77685bc5164f4b510c1be752236b6
  const matrix = new PathFinder.CostMatrix();
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      if (isBlocked(x, y)) {
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
      const range = matrix.get(x,y);
      const value = range/avgRange;
      //Need to be 2 squares away from a wall at minimum
      if (range > 2 && (!bestValue || value > bestValue)){
        bestValue = value;
        bestX = x;
        bestY = y;
      }
      if (visualize) room.visual.circle(x, y, { radius: value*25 });
    }
  }
  if (visualize) room.visual.circle(bestX!, bestY!, { radius: .5, fill: '#FF00FF' });
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


export function getGrid(room:Room, central:RoomPosition, matrix:CostMatrix){
  room.visual.circle(central, { radius: 1 });

  const distance = 5;
  const boxSize = 2;
  const gridSum = (offsetX:number, offsetY:number, visualize=false)=>{
    const gridX = central.x+offsetX, gridY = central.y+offsetY;
    if (visualize) room.visual.circle(gridX, gridY, { radius: .5, fill: '#FF00FF' });
    let total = matrix.get(gridX, gridY);
    for (let d=-distance; d <= distance; d++){
      if (d === 0) continue;
      if (visualize){
        room.visual.circle(gridX+d, gridY+d, { radius: .2, fill: '#FF0000' });
        room.visual.circle(gridX+d, gridY-d, { radius: .2, fill: '#FF0000' });

        room.visual.circle(gridX+boxSize+d, gridY-boxSize+d, { radius: .2, fill: '#0000FF' });
        room.visual.circle(gridX-boxSize+d, gridY+boxSize+d, { radius: .2, fill: '#0000FF' });
      }
      total += matrix.get(gridX+d, gridY+d);
      total += matrix.get(gridX+d, gridY-d);

      total += matrix.get(gridX+boxSize+d, gridY-boxSize+d);
      total += matrix.get(gridX-boxSize+d, gridY+boxSize+d);

      if (d === boxSize || d === -boxSize) continue;
      if (visualize){
        room.visual.circle(gridX-boxSize+d, gridY-boxSize-d, { radius: .2, fill: '#00FF00' });
        room.visual.circle(gridX+boxSize+d, gridY+boxSize-d, { radius: .2, fill: '#00FF00' });
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
    // room.visual.circle(gridX, gridY, { radius: .2, fill: '#FF00FF' });
    const total = gridSum(offsetX, offsetY);
    if (!largest || total > largest){
      bestOffset = offset;
      largest = total;
    }
  });

  const [offsetX, offsetY] = bestOffset!;
  gridSum(offsetX, offsetY, true);
}
