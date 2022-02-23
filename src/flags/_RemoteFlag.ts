import { ACTIVE_PARTS, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { BasicFlag, BasicFlagMemory } from "./_BasicFlag";

export interface RemoteFlagMemory extends BasicFlagMemory{
  home: Room['name'];
}

export abstract class RemoteFlag<AbstractFlagMemory extends RemoteFlagMemory = RemoteFlagMemory> extends BasicFlag<AbstractFlagMemory> {
  /* Flag name should be in the form: `${flag.type}:${room.name}` where room is the parent (spawner) room. */
  officeAudit?:RoomAudit;

  constructor(flag: Flag, type: FlagType, suffix?: string) {
    super(flag, type, suffix);
    this.officeAudit = this.office && getRoomAudit(this.office);
  }

  get home():Room{
    let home:Room|undefined;
    if (this.memory.home){
      home = Game.rooms[this.memory.home];
    }else if (this.suffix){
      const roomName = this.suffix.split(':', 2)[0];
      home = Game.rooms[roomName];
      if (home){
        this.memory.home = roomName;
      }
    }
    if (!home) throw `Flag [${this.flag.name}] error: home isn't defined.`;
    return home;
  }

  get office(){
    return this.flag.room;
  }

  get roomName(){
    //This works even if this.flag.room doesn't exist yet. (Don't have vision)
    return this.flag.pos.roomName;
  }

  // work() {
  //   const office = this.flag.room;
  //   const roomAudit = getRoomAudit(this.home);
  //   roomAudit.flags[this.type].push(this);
  // }
}
