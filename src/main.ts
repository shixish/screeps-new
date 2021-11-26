import { manageCreeps } from "utils/creeps";
import { ErrorMapper } from "utils/ErrorMapper";
import { manageStructures } from "utils/structures";
import { tickCache } from "utils/tickCache";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  // console.log(`Current game tick is ${Game.time}`);
  tickCache.clear(); //The cache persists between ticks, we need to explicitly rebuild it each time.

  manageCreeps();
  manageStructures();
  // for (const r in Game.rooms) {
  //   const room = Game.rooms[r];
  //   room.find(FIND_SOURCES).forEach(manageSource);
  // }

  // console.log(JSON.stringify(tickCache));
});
