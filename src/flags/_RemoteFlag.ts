import { FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { BasicFlag, BasicFlagMemory } from "./_BasicFlag";

export interface RemoteFlagMemory extends BasicFlagMemory{
  // home: Room['name'];
}

export abstract class RemoteFlag<AbstractFlagMemory extends RemoteFlagMemory = RemoteFlagMemory> extends BasicFlag<AbstractFlagMemory> {
  /* Flag name should be in the form: `${flag.type}:${room.name}` where room is the parent (spawner) room. */
  officeAudit?:RoomAudit;
  homeRoomName!:Room['name'];

  constructor(flagName: Flag['name'], type: FlagType, suffix?: string) {
    super(flagName, type, suffix);
    this.officeAudit = this.office && getRoomAudit(this.office);
  }

  parseSuffix(suffix?:string){
    if (!suffix) throw `Malformed name`;
    const [ roomName, options ] = suffix.split(':', 2);
    this.homeRoomName = roomName;
    return options;
  }

  get home(){
    return Game.rooms[this.homeRoomName];
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
