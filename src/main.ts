import { ErrorMapper } from "utils/ErrorMapper";
import { clearTickCache, roomAuditCache } from "utils/tickCache";
import { manageFlags } from "managers/flags";
import { manageStructures } from "managers/structures";
import { manageCreeps } from "managers/creeps";
import { RoomAudit } from "managers/room";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  // console.log(`Current game tick is ${Game.time}`);
  clearTickCache(); //The cache persists between ticks, we need to explicitly rebuild it each time.

  for (const r in Game.rooms) {
    const room = Game.rooms[r];
    const audit = new RoomAudit(room);
    roomAuditCache.set(room.name, audit);
  }
  manageFlags();
  manageStructures(); //Structures (tower) should have priority
  manageCreeps();
});
