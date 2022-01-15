import { FlagManager } from "./BasicFlag";

export abstract class RemoteFlag extends FlagManager {
  /* Flag name should be in the form: `${flag.type}:${room.name}` where room is the parent (spawner) room. */

  get home(){
    const home = this.memory.room && Game.rooms[this.memory.room] || this.suffix && Game.rooms[this.suffix];
    if (!home) throw `Flag [${this.flag.name}] error: home isn't defined.`;
    return home;
  }

  get office(){
    return this.flag.room;
  }

  // work() {
  //   const office = this.flag.room;
  //   const roomAudit = getRoomAudit(this.home);
  //   roomAudit.flags[this.type].push(this);
  // }
}
