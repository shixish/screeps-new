export const getExit = (room: Room, target_room_name: string) => {
  let path = room.findExitTo(target_room_name);
  if (path) {
    if (!Memory.paths) Memory.paths = {};
    // if (!Memory['paths'][room.name]) Memory['paths'][room.name] = {};
    // // Memory['paths'][room.name][target_room_name] = path;

    // if (!Memory['paths'][target_room_name]) Memory['paths'][target_room_name] = {};
    // Memory['paths'][target_room_name][room.name] = path;
  }
  return path;
}

export const getReverseDirection = (direction:DirectionConstant) => {
  switch (direction) {
    case TOP:
      return BOTTOM;
    case TOP_RIGHT:
      return BOTTOM_LEFT;
    case RIGHT:
      return LEFT;
    case BOTTOM_RIGHT:
      return TOP_LEFT;
    case BOTTOM:
      return TOP;
    case BOTTOM_LEFT:
      return TOP_RIGHT;
    case LEFT:
      return RIGHT;
    case TOP_LEFT:
      return BOTTOM_RIGHT;
  }
}

// Use RoomPosition.getDirectionTo(target:RoomPosition)

// export const getDirectionFrom = (from:RoomPosition, to:RoomPosition) => {
//   var x = from.x;
//   var y = from.y;
//   // Node is to the left
//   if (to.x < x) {
//     // Node is to the top
//     if (to.y < y) return TOP_LEFT; //8

//     // Node is on the same level
//     if (to.y == y) return LEFT; //7

//     // Node is to the bottom
//     if (to.y > y) return BOTTOM_LEFT; //6
//   }

//   if (to.x == x) {
//     // Node is to the top
//     if (to.y < y) return TOP; //1

//     // Node is to the bottom
//     if (to.y > y) return BOTTOM; //5
//   }

//   // Node is to the right
//   if (to.x > x) {
//     // Node is to the top
//     if (to.y < y) return TOP_RIGHT; //2

//     // Node is on the same level
//     if (to.y == y) return RIGHT; //3

//     // Node is to the bottom
//     if (to.y > y) return BOTTOM_RIGHT; //4
//   }
// }

// export const getClosestByPath = (actor, targets, range?: Function) => {
//   let target;
//   let target_path = [];

//   // range = range == undefined ? 1 : range;

//   if (targets && targets.length > 0) {
//     // let goals = _.map(targets, function(obj) {
//     //     // We can't actually walk on sources-- set `range` to 1 so we path next to it.
//     //     let range = 1;
//     //     if (obj.structureType && obj.structureType == STRUCTURE_CONTAINER) range = 0;
//     //     return { pos: obj.pos, range: range };
//     // });
//     let goals = _.map(targets, function (obj) {
//       // We can't actually walk on sources-- set `range` to 1 so we path next to it.
//       return { pos: obj.pos, range: range(obj) };
//     });

//     // debug.log(goals);

//     // let pathfinder_obj = {
//     //     // We need to set the defaults costs higher so that we
//     //     // can set the road cost lower in `roomCallback`
//     //     plainCost: 2,
//     //     swampCost: 10,

//     //     roomCallback: function(roomName) {
//     //         let room = Game.rooms[roomName];
//     //         // In this example `room` will always exist, but since PathFinder
//     //         // supports searches which span multiple rooms you should be careful!
//     //         if (!room) return;
//     //         let costs = new PathFinder.CostMatrix;
//     //         room.find(FIND_STRUCTURES).forEach(function(structure:Structure) {
//     //             if (structure.structureType === STRUCTURE_ROAD) {
//     //                 // Favor roads over plain tiles
//     //                 costs.set(structure.pos.x, structure.pos.y, 1);
//     //             } else if (structure.structureType !== STRUCTURE_RAMPART || !structure.my) {
//     //                 // Can't walk through buildings, except for our own ramparts
//     //                 costs.set(structure.pos.x, structure.pos.y, 0xff);
//     //             }
//     //         });
//     //         // Avoid creeps in the room
//     //         room.find(FIND_CREEPS).forEach(function(creep:Creep) {
//     //             costs.set(actor.pos.x, actor.pos.y, 0xff);
//     //         });
//     //         return costs;
//     //     },
//     // }

//     let results = PathFinder.search(actor.pos, goals);
//     // console.log(goals[0].pos, Object.keys(path), path.path, path.ops);

//     if (results.path) {
//       let parent = actor.pos;
//       for (let step of results.path) {
//         let dx = step.x - parent.x;
//         let dy = step.y - parent.y;
//         let direction = this.getDirectionFrom(parent, step);
//         target_path.push({
//           x: step.x,
//           y: step.y,
//           dx: dx,
//           dy: dy,
//           direction: direction
//         });
//         parent = step;
//       }
//       for (let i in targets) {
//         // console.log(parent.x, parent.y, targets[i].pos.x, targets[i].pos.y)
//         // console.log(i, targets[i], targets[i].pos.x, targets[i].pos.y)
//         if (Math.abs(parent.x - targets[i].pos.x) <= 1 && Math.abs(parent.y - targets[i].pos.y) <= 1) {
//           target = targets[i];
//           break;
//         }
//       }
//     }
//   }

//   return {
//     target: target,
//     path: target_path
//   };
// }
