/*
  TODO:
  Modify the result of getTerrainCostMatrix by zeroing out cells that already contain structures...
  Maybe roads don't count..?
  I think roads must count and I'll have to fit things in around roads and plant roads intelligently.
*/
export function getTerrainCostMatrix(room:Room){
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
    }
  }

  //Serialization info: https://github.com/screeps/docs/blob/master/api/source/PathFinder.CostMatrix.md
  return matrix;
}

export function visualizeMatrix(room:Room, matrix:CostMatrix, circles=true){
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      const value = matrix.get(x, y);
      if (value === 0) continue;
      if (circles){
        room.visual.circle(x, y, { radius: value / 25 });
      } else {
        room.visual.text(String(value), x, y);
      }
    }
  }
}

export function getStructureCostMatrix(room:Room, maxDistance = 4, weightedBy?:StructureConstant){
  const tempStructureLocationMatrix = new PathFinder.CostMatrix();

  const stepSize = 1;
  const maxValue = maxDistance;

  const structures = room.find(FIND_STRUCTURES);
  structures.forEach(structure=>{
    if (structure.structureType === weightedBy){
      tempStructureLocationMatrix.set(structure.pos.x, structure.pos.y, maxValue*2);
    }else{
      tempStructureLocationMatrix.set(structure.pos.x, structure.pos.y, maxValue);
    }
  });

  const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  constructionSites.forEach(constructionSite=>{
    tempStructureLocationMatrix.set(constructionSite.pos.x, constructionSite.pos.y, maxValue);
  });

  const matrix = new PathFinder.CostMatrix();
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      const structureValue = tempStructureLocationMatrix.get(x, y);
      if (structureValue) {
        matrix.set(x, y, structureValue);
      } else {
        matrix.set(x, y, Math.max(
          matrix.get(x - 1, y - 1),
          matrix.get(x, y - 1),
          matrix.get(x + 1, y - 1),
          matrix.get(x - 1, y),
        ) - stepSize);
      }
    }
  }

  for (let y = 49; y >= 0; --y) {
    for (let x = 49; x >= 0; --x) {
      const value = Math.max(
        matrix.get(x, y),
        matrix.get(x + 1, y + 1) - stepSize,
        matrix.get(x, y + 1) - stepSize,
        matrix.get(x - 1, y + 1) - stepSize,
        matrix.get(x + 1, y) - stepSize,
      );
      matrix.set(x, y, value);
    }
  }

  structures.forEach(structure=>{
    matrix.set(structure.pos.x, structure.pos.y, 0);
  });
  constructionSites.forEach(constructionSite=>{
    matrix.set(constructionSite.pos.x, constructionSite.pos.y, 0);
  })

  const blockedRange = 2;
  const blockPosition = (pos:RoomPosition)=>{
    for (const [dx, dy] of diamondCoordinates(pos.x, pos.y, blockedRange)){
      matrix.set(dx, dy, 0);
    }
  };

  room.find(FIND_SOURCES).forEach(source=>blockPosition(source.pos));
  room.find(FIND_MINERALS).forEach(mineral=>blockPosition(mineral.pos));
  if (room.controller) blockPosition(room.controller.pos);

  const terrain = room.getTerrain();
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      //We can't build too close to exits and can't build on walls
      if (terrain.get(x, y) === TERRAIN_MASK_WALL || x < 2 || y < 2 || x > 47 || y > 47) {
        matrix.set(x, y, 0);
      }
    }
  }

  return matrix;
}
// export function getStructureCostMatrix(room:Room, matrix:CostMatrix = getTerrainCostMatrix(room)){
//   room.find(FIND_STRUCTURES).forEach(structure=>{
//     // room.visual.text(structure.structureType, structure.pos);
//     matrix.set(structure.pos.x, structure.pos.y, 0);
//   });
//   return matrix;
// }

// export function getStructureTerrainCostMatrix(room:Room, matrix:CostMatrix = getStructureCostMatrix(room)){

// }

export function* diamondCoordinates(baseX:number, baseY:number, diamondSize = 1){
  for (let dy = 0; dy <= diamondSize; ++dy){
    for (let dx = 0; dx <= diamondSize; ++dx){
      if (dx === 0 && dy === 0){
        yield [baseX, baseY];
      } else if (dy === 0){
        const posX = baseX+dx, negX = baseX-dx;
        if (posX <= 49) yield [posX, baseY];
        if (negX >= 0) yield [negX, baseY];
      } else if (dx === 0){
        const posY = baseY+dy, negY = baseY-dy;
        if (posY <= 49) yield [baseX, posY];
        if (negY >= 0) yield [baseX, negY];
      } else if (dy+dx <= diamondSize) {
        const posX = baseX+dx, negX = baseX-dx;
        const posY = baseY+dy, negY = baseY-dy;
        if (posX <= 49){
          if (posY <= 49) yield [posX, posY];
          if (negY >= 0) yield [posX, negY];
        }
        if (negX >= 0){
          if (posY <= 49) yield [negX, posY];
          if (negY >= 0) yield [negX, negY];
        }
      }
    }
  }
}

export function* diamondRingCoordinates(baseX:number, baseY:number, diamondSize = 2){
  for (let dy = 0; dy <= diamondSize; ++dy){
    for (let dx = 0; dx <= diamondSize; ++dx){
      if (dy+dx === diamondSize){
        const posX = baseX+dx, negX = baseX-dx;
        const posY = baseY+dy, negY = baseY-dy;
        if (posX <= 49){
          if (posY <= 49) yield [posX, posY];
          if (negY >= 0) yield [posX, negY];
        }
        if (negX >= 0){
          if (posY <= 49) yield [negX, posY];
          if (negY >= 0) yield [negX, negY];
        }
      }
    }
  }
}

export function findDiamondPlacement(room:Room, diamondSize = 1, structureMatrix:CostMatrix = getStructureCostMatrix(room)){
  let bestX:number|undefined, bestY:number|undefined, bestValue:number = 0;
  for (let y = 0; y < 50; ++y) {
    for (let x = 0; x < 50; ++x) {
      if (structureMatrix.get(x, y) < diamondSize) continue;
      let valueSum:number = 0;
      for (const [dx, dy] of diamondCoordinates(x, y, diamondSize)){
        const value = structureMatrix.get(dx, dy);
        if (value === 0){
          valueSum = 0;
          break;
        }else{
          valueSum += value;
        }
      }
      let badPlacements = 0;
      if (valueSum > 0) for (const [rx, ry] of diamondRingCoordinates(x, y, diamondSize+1)){
        if (structureMatrix.get(rx, ry) === 0){
          room.visual.circle(rx, ry, { radius: 0.15, fill:"#FF0000" });
          if (room.lookAt(rx,ry).find(obj=>obj.structure?.structureType === STRUCTURE_ROAD)){
            valueSum += 1;
          }else{
            valueSum -= 2;
            badPlacements += 1;
          }
        }
        //If more than one road cannot be placed in the ring then this isn't a suitable location.
        if (badPlacements > 1){
          valueSum = 0;
          break;
        }
      }
      if (valueSum === 0) continue;
      room.visual.circle(x, y, { radius: 0.25, fill:"#FF00FF" });
      room.visual.text(String(valueSum), x, y);
      if (valueSum > bestValue){
        bestX = x;
        bestY = y;
        bestValue = valueSum;
      }
    }
  }

  // for (const [x, y] of diamondRingCoordinates(bestX!, bestY!, diamondSize+1)){
  //   room.visual.circle(x, y, { radius: 0.25, fill:"#0000FF" });
  // }

  if (bestValue == 0) throw 'Unable to find a suitable construction diamond!';
  return [bestX!, bestY!];

  // for (const [x, y] of diamondCoordinates(bestX!, bestY!, diamondSize)){
  //   // if (structureMatrix.get(x, y) === 0) break;
  //   room.visual.circle(x, y, { radius: 0.25 });
  // }

  // checkDiamond(bestX!, bestY!);

  // const searchSpace = 3;
  // for (let offsetY = -searchSpace; offsetY <= searchSpace; ++offsetY){
  //   for (let offsetX = -searchSpace; offsetX <= searchSpace; ++offsetX){

  //   }
  // }
}
// export function findDiamondPlacement(room:Room, diamondSize = 1, roadRing = true, terrainMatrix:CostMatrix = getTerrainCostMatrix(room), structureMatrix:CostMatrix = getStructureCostMatrix(room)){
//   const matrix = new PathFinder.CostMatrix();

//   let bestX:number|undefined, bestY:number|undefined, bestValue:number|undefined;
//   for (let y = 0; y < 50; ++y) {
//     for (let x = 0; x < 50; ++x) {
//       const structureValue = structureMatrix.get(x, y);
//       const terrainValue = terrainMatrix.get(x, y);
//       const average = structureValue === 0 || terrainValue === 0 ? 0 : structureValue+terrainValue; //Math.pow((Math.sqrt(structureValue)+Math.sqrt(terrainValue))/2,2); //(structureValue+terrainValue)/2;
//       if (!bestValue || average > bestValue){
//         bestValue = average;
//         bestX = x;
//         bestY = y;
//       }
//       matrix.set(x, y, average);
//     }
//   }

//   const sizeOffset = diamondSize-1;
//   const checkDiamond = (offsetX:number, offsetY:number)=>{
//     const baseX = bestX!+offsetX;
//     const baseY = bestY!+offsetY;
//     for (let d = -sizeOffset; d <= sizeOffset; ++d){
//       const x = baseX+d;
//       const y = baseY+d;
//       room.visual.circle(x, y, { radius: 0.75, fill:"#00FF00" });
//     }
//   };

//   // const searchSpace = 3;
//   // for (let offsetY = -searchSpace; offsetY <= searchSpace; ++offsetY){
//   //   for (let offsetX = -searchSpace; offsetX <= searchSpace; ++offsetX){

//   //   }
//   // }

//   checkDiamond(0, 0);


//   return matrix;
// }

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
