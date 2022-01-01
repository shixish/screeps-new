import { FlagManager } from "./FlagManager";
import { getRoomAudit } from "../managers/room";

export class ClaimFlag extends FlagManager {
  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work() {
    const home = this.memory.room && Game.rooms[this.memory.room] || this.suffix && Game.rooms[this.suffix];
    const office = this.flag.room;

    // Note: this.flag.pos.findClosestByRange seems to only work with rooms that have vision...
    // || this.flag.pos.findClosestByRange(FIND_MY_SPAWNS, {
    //   filter: spawn=>{
    //     //Claim body part costs 600 energy
    //     return spawn.room.energyAvailable >= 800;
    //   }
    // })?.room;
    if (home) {
      this.memory.room = home.name;
      if (office?.controller?.my && office.controller.level > 2 && office.find(FIND_MY_SPAWNS).length) {
        console.log(`Finished claiming ${home.name}.`);
        this.remove();
      } else {
        const roomAudit = getRoomAudit(home);
        roomAudit.flags[this.type].push(this);
      }
    } else {
      console.log(`Claim flag error: room not found.`);
    }
  }
}
