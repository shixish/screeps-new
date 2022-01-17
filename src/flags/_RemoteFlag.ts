import { FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { BasicFlag } from "./_BasicFlag";

export abstract class RemoteFlag extends BasicFlag {
  /* Flag name should be in the form: `${flag.type}:${room.name}` where room is the parent (spawner) room. */

  constructor(flag: Flag, type: FlagType, suffix?: string) {
    super(flag, type, suffix);
    this.auditOffice();
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[type] as BasicFlag[]).push(this);
  }

  updateRoomAudit(){
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[this.type] as BasicFlag[]).push(this);
  }

  abstract auditOffice(): void;

  get home():Room{
    let home:Room|undefined;
    if (this.memory.room){
      home = Game.rooms[this.memory.room];
    }else if (this.suffix){
      const roomName = this.suffix.split(':', 2)[0];
      home = Game.rooms[roomName];
      if (home){
        this.memory.room = roomName;
      }
    }
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
