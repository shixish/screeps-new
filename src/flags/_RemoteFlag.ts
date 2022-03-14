import { FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { BasicFlag, BasicFlagMemory } from "./_BasicFlag";

export interface RemoteFlagMemory extends BasicFlagMemory{
  // home: Room['name'];
}

export abstract class RemoteFlag<AbstractFlagMemory extends RemoteFlagMemory = RemoteFlagMemory> extends BasicFlag<AbstractFlagMemory> {
  /* Flag name should be in the form: `${flag.type}:${room.name}` where room is the parent (spawner) room. */
  officeAudit?:RoomAudit;
  domestic:boolean;

  constructor(flagName: Flag['name'], type: FlagType, suffix?: string) {
    super(flagName, type, suffix);
    this.officeAudit = this.office && getRoomAudit(this.office);
    this.domestic = this.office === this.home;
  }

  parseSuffix(suffix?:string){
    if (!suffix) throw `Malformed name`;
    const [ roomName, options ] = suffix.split(':', 2);
    this.homeRoomName = roomName;
    return options;
  }

  get officeIsHostile(){
    return Memory.rooms[this.roomName].hostile ?? false;
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
